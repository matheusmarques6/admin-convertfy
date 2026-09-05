/**
 * Prévia de link do modal "Nova transcrição".
 *
 * Escada de degradação, do mais completo ao mais honesto:
 *
 *  1. Worker (`yt-dlp --dump-json`) — título, canal, DURAÇÃO, capa, data.
 *     É o único que sabe a duração; roda no container porque a Vercel não
 *     tem binário.
 *  2. oEmbed da própria plataforma — título, canal e capa REAIS, sem
 *     duração. Continua sendo dado da plataforma, não palpite.
 *  3. Só a plataforma e a URL. O item ainda entra na fila: o worker
 *     preenche o título quando processar.
 *
 * Em nenhum degrau um campo é inventado: o que não veio fica null e a UI
 * mostra o traço.
 */

import type { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { detectarPlataforma, limparUrl, normalizarUrl } from "@/lib/transcricoes/url"
import { sugerirColecao, type Regra } from "@/lib/transcricoes/sugestao"
import type { Plataforma, PreviaLink } from "@/lib/transcricoes/types"

const log = logger.child("TranscricoesPrevia")

type Admin = ReturnType<typeof createAdminClient>

const TIMEOUT_MS = 20_000

interface MetadadosBrutos {
  titulo: string | null
  canal: string | null
  duracaoSeg: number | null
  thumbUrl: string | null
  publicadoEm: string | null
}

const VAZIO: MetadadosBrutos = { titulo: null, canal: null, duracaoSeg: null, thumbUrl: null, publicadoEm: null }

// ── Degrau 1: worker ────────────────────────────────────────────────────

export function workerConfigurado(): boolean {
  return Boolean(process.env.WORKER_URL && process.env.WORKER_SHARED_SECRET)
}

async function viaWorker(url: string): Promise<MetadadosBrutos | null> {
  if (!workerConfigurado()) return null
  const base = process.env.WORKER_URL!.replace(/\/+$/, "")
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(`${base}/previa?url=${encodeURIComponent(url)}`, {
      headers: { "x-worker-secret": process.env.WORKER_SHARED_SECRET! },
      signal: controller.signal,
      cache: "no-store",
    })
    if (!resp.ok) return null
    const json = (await resp.json()) as { ok?: boolean } & MetadadosBrutos
    if (!json.ok) return null
    return {
      titulo: json.titulo ?? null,
      canal: json.canal ?? null,
      duracaoSeg: json.duracaoSeg ?? null,
      thumbUrl: json.thumbUrl ?? null,
      publicadoEm: json.publicadoEm ?? null,
    }
  } catch (e) {
    log.warn("prévia pelo worker falhou", { erro: e instanceof Error ? e.message : String(e) })
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Degrau 2: oEmbed ────────────────────────────────────────────────────

const OEMBED: Partial<Record<Plataforma, (url: string) => string>> = {
  youtube: (u) => `https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json`,
  tiktok: (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`,
  // O Instagram passou a exigir token de app no oEmbed: sem ele, cai no
  // degrau 3 em vez de chutar título.
}

async function viaOembed(url: string, plataforma: Plataforma): Promise<MetadadosBrutos | null> {
  const montar = OEMBED[plataforma]
  if (!montar) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const resp = await fetch(montar(url), { signal: controller.signal, cache: "no-store" })
    if (!resp.ok) return null
    const json = (await resp.json()) as { title?: string; author_name?: string; thumbnail_url?: string }
    return {
      titulo: json.title?.trim() || null,
      canal: json.author_name?.trim() || null,
      // oEmbed não devolve duração — e null é a resposta certa para "não sei".
      duracaoSeg: null,
      thumbUrl: json.thumbnail_url || null,
      publicadoEm: null,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Prévia ──────────────────────────────────────────────────────────────

export async function carregarRegras(admin: Admin, orgId: string): Promise<Regra[]> {
  const { data } = await admin
    .from("transcricoes_regras")
    .select("id, termos, colecao_id, plataforma, prioridade")
    .eq("org_id", orgId)
    .order("prioridade", { ascending: false })
    .returns<Array<{ id: string; termos: string[]; colecao_id: string; plataforma: string | null; prioridade: number }>>()
  return (data ?? []).map((r) => ({
    id: r.id,
    termos: r.termos ?? [],
    colecaoId: r.colecao_id,
    plataforma: (r.plataforma as Plataforma | null) ?? null,
    prioridade: r.prioridade,
  }))
}

export async function resolverPrevia(
  admin: Admin,
  orgId: string,
  urlBruta: string,
  regras: Regra[],
): Promise<PreviaLink> {
  const plataforma = detectarPlataforma(urlBruta)
  const limpa = limparUrl(urlBruta) ?? urlBruta.trim()
  const normalizada = normalizarUrl(urlBruta)

  const base: PreviaLink = {
    url: limpa,
    ok: false,
    plataforma,
    titulo: null,
    canal: null,
    duracaoSeg: null,
    thumbUrl: null,
    urlNormalizada: normalizada,
    duplicadaDe: null,
    colecaoSugeridaId: null,
    erro: null,
  }

  if (!plataforma) {
    return { ...base, erro: "Só YouTube, Instagram e TikTok. Para outros, envie o arquivo." }
  }

  // Duplicado é checado ANTES de gastar rede com metadados: o item não vai
  // entrar na fila mesmo.
  if (normalizada) {
    const { data } = await admin
      .from("transcricoes")
      .select("id, titulo")
      .eq("org_id", orgId)
      .eq("url_normalizada", normalizada)
      .maybeSingle<{ id: string; titulo: string }>()
    if (data) {
      return { ...base, ok: false, duplicadaDe: { id: data.id, titulo: data.titulo } }
    }
  }

  const meta = (await viaWorker(limpa)) ?? (await viaOembed(limpa, plataforma)) ?? VAZIO

  return {
    ...base,
    ok: true,
    titulo: meta.titulo,
    canal: meta.canal,
    duracaoSeg: meta.duracaoSeg,
    thumbUrl: meta.thumbUrl,
    colecaoSugeridaId: sugerirColecao(
      { titulo: meta.titulo, canal: meta.canal, url: limpa, plataforma },
      regras,
    ),
  }
}

/** Data de publicação, quando o degrau 1 conseguiu. */
export async function metadadosCompletos(url: string): Promise<MetadadosBrutos | null> {
  return viaWorker(url)
}
