/**
 * Referências do Estúdio — leitura/escrita em `conteudo_referencias` e a
 * importação de um carrossel real do Instagram.
 *
 * Importar = (1) ler os filhos do carrossel na Graph API, (2) baixar cada
 * slide para o Storage da org (a URL do CDN da Meta expira; a referência
 * precisa continuar visível daqui a um ano), (3) pedir à ConvertIA a
 * transcrição da copy por slide e o porquê. A linha nasce ANTES da
 * transcrição, `pendente`: se a IA cair, a referência existe, os slides
 * estão guardados e o botão "Ler de novo" resolve — nada é perdido.
 */

import sharp from "sharp"
import type { createAdminClient } from "@/lib/supabase/server"
import { AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { CONVERTIA_IMAGE_BUCKET, convertiaImageUrl, storagePathFromUrl } from "@/lib/ai/convertia-image-url"
import { executarIA } from "@/lib/conteudo/ia/service"
import type { SaidaTranscricao } from "@/lib/conteudo/ia/schemas"
import type { Referencia, ReferenciaCandidata, ReferenciaMetricas, ReferenciaSlide } from "@/lib/conteudo/types"
import { channelIgConfig, graph, loadIgChannels } from "./conteudo-instagram-sync.service"

const log = logger.child("ConteudoReferencias")

type Admin = ReturnType<typeof createAdminClient>

export interface ReferenciaRow {
  id: string
  org_id: string
  nome: string
  origem: "instagram" | "upload"
  ig_media_id: string | null
  permalink: string | null
  slides: ReferenciaSlide[]
  legenda: string | null
  palavra_chave: string | null
  pilar: string | null
  molde: string | null
  por_que_funciona: string[]
  metricas: ReferenciaMetricas | null
  peso: number
  ativa: boolean
  transcricao: "pendente" | "lida" | "erro"
  transcricao_erro: string | null
  criado_em: string
  atualizado_em: string
}

export const COLS =
  "id, org_id, nome, origem, ig_media_id, permalink, slides, legenda, palavra_chave, pilar, molde, por_que_funciona, metricas, peso, ativa, transcricao, transcricao_erro, criado_em, atualizado_em"

export function rowToReferencia(r: ReferenciaRow): Referencia {
  return {
    id: r.id,
    nome: r.nome,
    origem: r.origem,
    igMediaId: r.ig_media_id,
    permalink: r.permalink,
    slides: Array.isArray(r.slides) ? r.slides : [],
    legenda: r.legenda,
    palavraChave: r.palavra_chave,
    pilar: (r.pilar as Referencia["pilar"]) ?? null,
    molde: (r.molde as Referencia["molde"]) ?? null,
    porQueFunciona: Array.isArray(r.por_que_funciona) ? r.por_que_funciona : [],
    metricas: r.metricas ?? null,
    peso: (r.peso === 2 || r.peso === 3 ? r.peso : 1) as 1 | 2 | 3,
    ativa: r.ativa,
    transcricao: r.transcricao,
    transcricaoErro: r.transcricao_erro,
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
  }
}

export async function listarReferencias(admin: Admin, orgId: string): Promise<Referencia[]> {
  const { data, error } = await admin.from("conteudo_referencias").select(COLS).eq("org_id", orgId).order("peso", { ascending: false }).order("criado_em", { ascending: false }).limit(200).returns<ReferenciaRow[]>()
  if (error) throw error
  return (data ?? []).map(rowToReferencia)
}

export async function obterReferencia(admin: Admin, orgId: string, id: string): Promise<Referencia | null> {
  const { data, error } = await admin.from("conteudo_referencias").select(COLS).eq("org_id", orgId).eq("id", id).maybeSingle<ReferenciaRow>()
  if (error) throw error
  return data ? rowToReferencia(data) : null
}

// ── Candidatos: carrosséis reais ainda não importados ───────────────────

interface MediaRow {
  id: string
  channel_id: string
  caption: string | null
  permalink: string | null
  thumbnail_url: string | null
  media_url: string | null
  published_at: string | null
  children_count: number | null
  reach: number | null
  saved: number | null
  shares: number | null
  follows: number | null
  comments_count: number | null
}

function headlineDaLegenda(caption: string | null): string {
  const primeira = (caption ?? "").split(/\n/).map((l) => l.trim()).find(Boolean) ?? ""
  return primeira.length > 110 ? `${primeira.slice(0, 109).trimEnd()}…` : primeira || "Carrossel sem legenda"
}

export async function listarCandidatos(admin: Admin, orgId: string): Promise<ReferenciaCandidata[]> {
  const [{ data: midias, error }, { data: usados }] = await Promise.all([
    admin
      .from("conteudo_ig_media")
      .select("id, channel_id, caption, permalink, thumbnail_url, media_url, published_at, children_count, reach, saved, shares, follows, comments_count")
      .eq("org_id", orgId)
      .eq("media_type", "CAROUSEL_ALBUM")
      .order("saved", { ascending: false, nullsFirst: false })
      .limit(100)
      .returns<MediaRow[]>(),
    admin.from("conteudo_referencias").select("ig_media_id").eq("org_id", orgId).not("ig_media_id", "is", null),
  ])
  if (error) throw error
  const ja = new Set(((usados ?? []) as Array<{ ig_media_id: string }>).map((u) => u.ig_media_id))
  return (midias ?? [])
    .filter((m) => !ja.has(m.id))
    .map((m) => ({
      igMediaId: m.id,
      perfil: m.channel_id,
      headline: headlineDaLegenda(m.caption),
      slides: m.children_count,
      thumb: m.thumbnail_url ?? m.media_url,
      permalink: m.permalink,
      publicadoEm: m.published_at ?? "",
      metricas: { reach: m.reach, saved: m.saved, shares: m.shares, follows: m.follows, comments: m.comments_count },
    }))
}

// ── Slides → Storage ────────────────────────────────────────────────────

/** Baixa, redimensiona (≤1350px, JPEG) e guarda no bucket da org. Devolve a URL servida pelo admin e o buffer. */
async function guardarSlide(admin: Admin, orgId: string, refId: string, ordem: number, origem: string | Buffer): Promise<{ url: string; buf: Buffer }> {
  let entrada: Buffer
  if (Buffer.isBuffer(origem)) entrada = origem
  else {
    const res = await fetch(origem, { cache: "no-store" })
    if (!res.ok) throw new AppError(`Slide ${ordem} indisponível na Meta (${res.status}).`, 502)
    entrada = Buffer.from(await res.arrayBuffer())
  }
  const buf = await sharp(entrada, { animated: false }).rotate().resize(1350, 1350, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer()
  const path = `stores/org-${orgId}/email-assets/ref-${refId}-${String(ordem).padStart(2, "0")}.jpg`
  const { error } = await admin.storage.from(CONVERTIA_IMAGE_BUCKET).upload(path, buf, { contentType: "image/jpeg", upsert: true })
  if (error) throw new AppError(`Não foi possível guardar o slide ${ordem}: ${error.message}`, 500)
  return { url: convertiaImageUrl(path), buf }
}

/** Lê um slide já guardado (URL do admin) como buffer — para re-transcrever. */
async function lerSlide(admin: Admin, url: string): Promise<Buffer | null> {
  const path = storagePathFromUrl(url)
  if (!path) return null
  const { data, error } = await admin.storage.from(CONVERTIA_IMAGE_BUCKET).download(path)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

const dataUrl = (buf: Buffer) => `data:image/jpeg;base64,${buf.toString("base64")}`

// ── Transcrição pela ConvertIA ──────────────────────────────────────────

function aplicarTranscricao(slides: ReferenciaSlide[], t: SaidaTranscricao): ReferenciaSlide[] {
  const porOrdem = new Map(t.slides.map((s) => [s.ordem, s]))
  return slides.map((s) => {
    const lido = porOrdem.get(s.ordem)
    return lido ? { ...s, tipo: lido.tipo, titulo: lido.titulo?.trim() || undefined, corpo: lido.corpo?.trim() || undefined } : s
  })
}

/**
 * Pede a leitura à IA e grava. `buffers` evita rebaixar do Storage quando o
 * chamador acabou de guardar os slides. Falha vira `transcricao='erro'` com
 * a mensagem — a linha e as imagens ficam.
 */
export async function transcreverReferencia(admin: Admin, orgId: string, id: string, buffers?: Buffer[]): Promise<Referencia> {
  const ref = await obterReferencia(admin, orgId, id)
  if (!ref) throw new AppError("Referência não encontrada", 404, "not-found")
  const ordenados = [...ref.slides].sort((a, b) => a.ordem - b.ordem)
  let imagens: string[]
  if (buffers?.length) imagens = buffers.map(dataUrl)
  else {
    const lidos = await Promise.all(ordenados.map((s) => lerSlide(admin, s.imagemUrl)))
    imagens = lidos.filter((b): b is Buffer => Boolean(b)).map(dataUrl)
  }
  if (!imagens.length) throw new AppError("Nenhum slide legível para transcrever.", 422)

  try {
    const r = await executarIA({ acao: "transcrever_referencia", imagens: imagens.slice(0, 12), legenda: ref.legenda ?? undefined, nome: ref.nome })
    const t = r.dados
    const patch = {
      nome: ref.origem === "upload" || !ref.nome || ref.nome === "Referência" ? t.nome : ref.nome,
      slides: aplicarTranscricao(ordenados, t),
      por_que_funciona: t.porQueFunciona,
      pilar: ref.pilar ?? t.pilar ?? null,
      molde: ref.molde ?? t.molde ?? null,
      palavra_chave: ref.palavraChave ?? t.palavraChave?.toUpperCase() ?? null,
      transcricao: "lida",
      transcricao_erro: null,
    }
    const { data, error } = await admin.from("conteudo_referencias").update(patch).eq("id", id).eq("org_id", orgId).select(COLS).single<ReferenciaRow>()
    if (error) throw error
    log.info("referencia.transcrita", { id, slides: t.slides.length, modelo: r.modelo, ms: r.ms, custo: r.custoUsd })
    return rowToReferencia(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.warn("referencia.transcricao_falhou", { id, erro: msg })
    const { data } = await admin.from("conteudo_referencias").update({ transcricao: "erro", transcricao_erro: msg.slice(0, 400) }).eq("id", id).eq("org_id", orgId).select(COLS).single<ReferenciaRow>()
    if (data) return rowToReferencia(data)
    throw e
  }
}

// ── Criação por upload ──────────────────────────────────────────────────

/**
 * Referência a partir de slides já enviados pelo upload (URLs do admin).
 * Cria a linha, guarda cópia normalizada de cada slide sob `ref-<id>-NN` e
 * transcreve.
 */
export async function criarReferenciaDeUpload(admin: Admin, orgId: string, userId: string, entrada: { nome?: string; slidesUrls: string[]; legenda?: string | null }): Promise<Referencia> {
  const { data: linha, error } = await admin
    .from("conteudo_referencias")
    .insert({ org_id: orgId, nome: entrada.nome?.trim() || "Referência", origem: "upload", slides: [], legenda: entrada.legenda ?? null, criado_por: userId })
    .select(COLS)
    .single<ReferenciaRow>()
  if (error) throw error

  const buffers: Buffer[] = []
  const slides: ReferenciaSlide[] = []
  for (const [i, url] of entrada.slidesUrls.entries()) {
    const buf = await lerSlide(admin, url)
    if (!buf) throw new AppError(`Slide ${i + 1} não está no banco de imagens da org — envie pelo upload.`, 422)
    const g = await guardarSlide(admin, orgId, linha.id, i + 1, buf)
    buffers.push(g.buf)
    slides.push({ ordem: i + 1, imagemUrl: g.url })
  }
  const { error: e2 } = await admin.from("conteudo_referencias").update({ slides }).eq("id", linha.id)
  if (e2) throw e2
  return transcreverReferencia(admin, orgId, linha.id, buffers)
}

// ── Importação do Instagram ─────────────────────────────────────────────

interface Child {
  id: string
  media_type?: string
  media_url?: string
  thumbnail_url?: string
}

export async function importarDoInstagram(admin: Admin, orgId: string, userId: string, igMediaId: string): Promise<Referencia> {
  const { data: m, error } = await admin
    .from("conteudo_ig_media")
    .select("id, channel_id, media_id, media_type, caption, permalink, media_url, thumbnail_url, reach, saved, shares, follows, comments_count, pilar, molde, palavra_chave")
    .eq("org_id", orgId)
    .eq("id", igMediaId)
    .maybeSingle()
  if (error) throw error
  if (!m) throw new AppError("Post não encontrado", 404, "not-found")

  // Importar duas vezes é clique duplo, não duas referências (índice único
  // parcial na migration; aqui só evitamos o 23505 com uma leitura).
  const { data: existente } = await admin.from("conteudo_referencias").select(COLS).eq("org_id", orgId).eq("ig_media_id", m.id).maybeSingle<ReferenciaRow>()
  if (existente) return rowToReferencia(existente)

  const canais = await loadIgChannels(admin, orgId, false)
  const canal = canais.find((c) => c.id === m.channel_id)
  if (!canal) throw new AppError("Canal do post não encontrado na organização.", 404, "not-found")
  const config = channelIgConfig(canal)

  // Slides: filhos do carrossel; imagem única cai no próprio media_url.
  let fontes: Array<{ url: string }> = []
  if (m.media_type === "CAROUSEL_ALBUM") {
    const r = await graph<{ data?: Child[] }>(config, `/${m.media_id}/children?fields=id,media_type,media_url,thumbnail_url`)
    if (!r.ok) throw new AppError(`Não foi possível ler os slides no Instagram: ${r.error.message}`, 502)
    fontes = (r.data.data ?? []).map((c) => ({ url: (c.media_type === "VIDEO" ? c.thumbnail_url : c.media_url) ?? "" })).filter((c) => c.url)
  } else if (m.media_url || m.thumbnail_url) {
    fontes = [{ url: (m.media_url ?? m.thumbnail_url) as string }]
  }
  if (!fontes.length) throw new AppError("O post não tem imagens legíveis.", 422)

  const metricas: ReferenciaMetricas = { reach: m.reach, saved: m.saved, shares: m.shares, follows: m.follows, comments: m.comments_count }
  const { data: linha, error: e1 } = await admin
    .from("conteudo_referencias")
    .insert({
      org_id: orgId,
      nome: headlineDaLegenda(m.caption),
      origem: "instagram",
      ig_media_id: m.id,
      permalink: m.permalink,
      slides: [],
      legenda: m.caption,
      palavra_chave: m.palavra_chave ?? null,
      pilar: m.pilar ?? null,
      molde: m.molde ?? null,
      metricas,
      criado_por: userId,
    })
    .select(COLS)
    .single<ReferenciaRow>()
  if (e1) {
    if (e1.code === "23505") {
      const { data: outra } = await admin.from("conteudo_referencias").select(COLS).eq("org_id", orgId).eq("ig_media_id", m.id).maybeSingle<ReferenciaRow>()
      if (outra) return rowToReferencia(outra)
    }
    throw e1
  }

  const buffers: Buffer[] = []
  const slides: ReferenciaSlide[] = []
  for (const [i, f] of fontes.slice(0, 12).entries()) {
    try {
      const g = await guardarSlide(admin, orgId, linha.id, i + 1, f.url)
      buffers.push(g.buf)
      slides.push({ ordem: i + 1, imagemUrl: g.url })
    } catch (e) {
      // Um slide que a Meta não serve não derruba a referência inteira.
      log.warn("referencia.slide_nao_guardado", { id: linha.id, ordem: i + 1, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  if (!slides.length) {
    await admin.from("conteudo_referencias").delete().eq("id", linha.id)
    throw new AppError("Nenhum slide do post pôde ser baixado do Instagram.", 502)
  }
  const { error: e2 } = await admin.from("conteudo_referencias").update({ slides }).eq("id", linha.id)
  if (e2) throw e2
  return transcreverReferencia(admin, orgId, linha.id, buffers)
}

// ── Edição e exclusão ───────────────────────────────────────────────────

export interface PatchReferencia {
  nome?: string
  slides?: Array<{ ordem: number; tipo?: string; titulo?: string; corpo?: string }>
  legenda?: string | null
  palavraChave?: string | null
  pilar?: string | null
  molde?: string | null
  porQueFunciona?: string[]
  peso?: 1 | 2 | 3
  ativa?: boolean
}

export async function atualizarReferencia(admin: Admin, orgId: string, id: string, patch: PatchReferencia): Promise<Referencia> {
  const atual = await obterReferencia(admin, orgId, id)
  if (!atual) throw new AppError("Referência não encontrada", 404, "not-found")
  const row: Record<string, unknown> = {}
  if (patch.nome !== undefined) row.nome = patch.nome
  if (patch.legenda !== undefined) row.legenda = patch.legenda
  if (patch.palavraChave !== undefined) row.palavra_chave = patch.palavraChave ? patch.palavraChave.toUpperCase() : null
  if (patch.pilar !== undefined) row.pilar = patch.pilar
  if (patch.molde !== undefined) row.molde = patch.molde
  if (patch.porQueFunciona !== undefined) row.por_que_funciona = patch.porQueFunciona
  if (patch.peso !== undefined) row.peso = patch.peso
  if (patch.ativa !== undefined) row.ativa = patch.ativa
  if (patch.slides) {
    // A copy é editável; a IMAGEM nunca vem do cliente — casa por ordem.
    const edit = new Map(patch.slides.map((s) => [s.ordem, s]))
    row.slides = atual.slides.map((s) => {
      const e = edit.get(s.ordem)
      return e ? { ...s, tipo: (e.tipo as ReferenciaSlide["tipo"]) ?? s.tipo, titulo: e.titulo?.trim() || undefined, corpo: e.corpo?.trim() || undefined } : s
    })
    // Humano escreveu a copy: a referência passa a ser utilizável mesmo se a IA falhou.
    if (atual.transcricao !== "lida" && (row.slides as ReferenciaSlide[]).some((s) => s.titulo || s.corpo)) {
      row.transcricao = "lida"
      row.transcricao_erro = null
    }
  }
  if (!Object.keys(row).length) return atual
  const { data, error } = await admin.from("conteudo_referencias").update(row).eq("id", id).eq("org_id", orgId).select(COLS).single<ReferenciaRow>()
  if (error) throw error
  return rowToReferencia(data)
}

export async function excluirReferencia(admin: Admin, orgId: string, id: string): Promise<void> {
  const ref = await obterReferencia(admin, orgId, id)
  if (!ref) return
  const { error } = await admin.from("conteudo_referencias").delete().eq("org_id", orgId).eq("id", id)
  if (error) throw error
  // As imagens são cópias nossas (ref-<id>-NN): apagar a linha sem apagar os
  // arquivos deixaria lixo no bucket para sempre. Best-effort.
  const paths = ref.slides.map((s) => storagePathFromUrl(s.imagemUrl)).filter((p): p is string => Boolean(p))
  if (paths.length) {
    const { error: e2 } = await admin.storage.from(CONVERTIA_IMAGE_BUCKET).remove(paths)
    if (e2) log.warn("referencia.slides_nao_removidos", { id, erro: e2.message })
  }
}
