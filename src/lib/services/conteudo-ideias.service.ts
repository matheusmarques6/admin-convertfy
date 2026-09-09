/**
 * Banco de ideias e pipeline de Reels — leitura/escrita das tabelas
 * `conteudo_ideias`, `conteudo_ideia_votos` e `conteudo_reels`.
 *
 * Duas regras de leitura que a tela depende:
 *
 * - **Voto é COUNT, nunca coluna incrementada.** Contador desnormalizado
 *   diverge na primeira corrida, e aqui o número é o argumento do time
 *   para priorizar — divergir é pior que somar devagar.
 * - **As métricas do reel publicado saem do POST REAL** (`conteudo_ig_media`),
 *   não de campo digitado. Reel publicado sem mídia vinculada mostra o
 *   traço; número inventado num card de "publicado" é o tipo de coisa que
 *   ninguém confere e todo mundo repete depois.
 */

import type { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { Ideia, StatusIdeia } from "@/lib/conteudo/ideias/banco"
import type { EtapaReel } from "@/lib/conteudo/reels/pipeline"
import type { EtapaFunil, Formato, Reel, ReelRoteiroBloco } from "@/lib/conteudo/types"

const log = logger.child("ConteudoIdeias")
type Admin = ReturnType<typeof createAdminClient>

const IDEIA_COLS =
  "id, titulo, funil, formato, pilar, tags, fonte, fonte_detalhe, score, por_que, molde, status, reel_id, documento_id, criado_em"

interface IdeiaRow {
  id: string
  titulo: string
  funil: EtapaFunil | null
  formato: Formato | null
  pilar: string | null
  tags: string[] | null
  fonte: Ideia["fonte"]
  fonte_detalhe: string | null
  score: number | null
  por_que: string | null
  molde: string | null
  status: StatusIdeia
  reel_id: string | null
  documento_id: string | null
  criado_em: string
}

function rowToIdeia(r: IdeiaRow, votos: number, votei: boolean): Ideia {
  return {
    id: r.id,
    titulo: r.titulo,
    funil: r.funil,
    formato: r.formato,
    pilar: r.pilar,
    tags: Array.isArray(r.tags) ? r.tags : [],
    fonte: r.fonte,
    fonteDetalhe: r.fonte_detalhe,
    score: r.score,
    porQue: r.por_que,
    molde: r.molde,
    status: r.status,
    votos,
    votei,
    reelId: r.reel_id,
    documentoId: r.documento_id,
    criadoEm: r.criado_em,
  }
}

/** Ideias da org com a contagem de votos e o voto do usuário atual. */
export async function listarIdeias(admin: Admin, orgId: string, userId: string, opts: { status?: StatusIdeia } = {}): Promise<Ideia[]> {
  let q = admin.from("conteudo_ideias").select(IDEIA_COLS).eq("org_id", orgId)
  if (opts.status) q = q.eq("status", opts.status)
  const { data, error } = await q.order("criado_em", { ascending: false }).limit(500)
  if (error) throw error
  const rows = (data ?? []) as unknown as IdeiaRow[]
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const { data: votos, error: erroVotos } = await admin
    .from("conteudo_ideia_votos")
    .select("ideia_id, profile_id")
    .in("ideia_id", ids)
  if (erroVotos) throw erroVotos

  const porIdeia = new Map<string, { total: number; meu: boolean }>()
  for (const v of (votos ?? []) as Array<{ ideia_id: string; profile_id: string }>) {
    const atual = porIdeia.get(v.ideia_id) ?? { total: 0, meu: false }
    atual.total += 1
    if (v.profile_id === userId) atual.meu = true
    porIdeia.set(v.ideia_id, atual)
  }

  return rows.map((r) => {
    const v = porIdeia.get(r.id)
    return rowToIdeia(r, v?.total ?? 0, v?.meu ?? false)
  })
}

export interface NovaIdeia {
  titulo: string
  funil?: EtapaFunil | null
  formato?: Formato | null
  pilar?: string | null
  tags?: string[]
  fonte?: Ideia["fonte"]
  fonteDetalhe?: string | null
  score?: number | null
  porQue?: string | null
  molde?: string | null
  trendId?: string | null
}

export async function criarIdeia(admin: Admin, orgId: string, userId: string, e: NovaIdeia): Promise<Ideia> {
  const { data, error } = await admin
    .from("conteudo_ideias")
    .insert({
      org_id: orgId,
      titulo: e.titulo.trim(),
      funil: e.funil ?? null,
      formato: e.formato ?? null,
      pilar: e.pilar ?? null,
      tags: e.tags ?? [],
      fonte: e.fonte ?? "time",
      fonte_detalhe: e.fonteDetalhe ?? null,
      score: e.score ?? null,
      por_que: e.porQue ?? null,
      molde: e.molde ?? null,
      trend_id: e.trendId ?? null,
      criado_por: userId,
    })
    .select(IDEIA_COLS)
    .single()
  if (error) throw error
  return rowToIdeia(data as unknown as IdeiaRow, 0, false)
}

export async function patchIdeia(
  admin: Admin,
  orgId: string,
  userId: string,
  id: string,
  patch: Partial<NovaIdeia> & { status?: StatusIdeia },
): Promise<Ideia> {
  const campos: Record<string, unknown> = {}
  if (patch.titulo !== undefined) campos.titulo = patch.titulo.trim()
  if (patch.funil !== undefined) campos.funil = patch.funil
  if (patch.formato !== undefined) campos.formato = patch.formato
  if (patch.pilar !== undefined) campos.pilar = patch.pilar
  if (patch.tags !== undefined) campos.tags = patch.tags
  if (patch.score !== undefined) campos.score = patch.score
  if (patch.porQue !== undefined) campos.por_que = patch.porQue
  if (patch.molde !== undefined) campos.molde = patch.molde
  if (patch.status !== undefined) campos.status = patch.status

  const { data, error } = await admin
    .from("conteudo_ideias")
    .update(campos)
    .eq("id", id)
    .eq("org_id", orgId)
    .select(IDEIA_COLS)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("Ideia não encontrada")

  const { count } = await admin
    .from("conteudo_ideia_votos")
    .select("profile_id", { count: "exact", head: true })
    .eq("ideia_id", id)
  const { data: meu } = await admin
    .from("conteudo_ideia_votos")
    .select("profile_id")
    .eq("ideia_id", id)
    .eq("profile_id", userId)
    .maybeSingle()
  return rowToIdeia(data as unknown as IdeiaRow, count ?? 0, Boolean(meu))
}

/** Alterna o voto do usuário. Devolve a contagem nova. */
export async function alternarVoto(admin: Admin, orgId: string, userId: string, ideiaId: string): Promise<{ votos: number; votei: boolean }> {
  const { data: ideia } = await admin.from("conteudo_ideias").select("id").eq("id", ideiaId).eq("org_id", orgId).maybeSingle()
  if (!ideia) throw new Error("Ideia não encontrada")

  const { data: existente } = await admin
    .from("conteudo_ideia_votos")
    .select("profile_id")
    .eq("ideia_id", ideiaId)
    .eq("profile_id", userId)
    .maybeSingle()

  if (existente) {
    await admin.from("conteudo_ideia_votos").delete().eq("ideia_id", ideiaId).eq("profile_id", userId)
  } else {
    // Clique duplo insere a mesma linha: a PK (ideia, profile) resolve, e
    // ignorar o conflito é mais barato que checar de novo.
    await admin.from("conteudo_ideia_votos").upsert({ ideia_id: ideiaId, profile_id: userId }, { ignoreDuplicates: true })
  }

  const { count } = await admin
    .from("conteudo_ideia_votos")
    .select("profile_id", { count: "exact", head: true })
    .eq("ideia_id", ideiaId)
  return { votos: count ?? 0, votei: !existente }
}

export async function excluirIdeia(admin: Admin, orgId: string, id: string): Promise<void> {
  const { error } = await admin.from("conteudo_ideias").delete().eq("id", id).eq("org_id", orgId)
  if (error) throw error
}

// ── Reels ──────────────────────────────────────────────────────────────────

const REEL_COLS =
  "id, titulo, funil, etapa, tema, formato, duracao_s, score, roteiro, responsavel_id, canal_id, agendado_para, publicado_em, ig_media_id, posicao, ideia_id, criado_em"

interface ReelRow {
  id: string
  titulo: string
  funil: EtapaFunil
  etapa: EtapaReel
  tema: string | null
  formato: string | null
  duracao_s: number | null
  score: number | null
  roteiro: ReelRoteiroBloco[] | null
  responsavel_id: string | null
  canal_id: string | null
  agendado_para: string | null
  publicado_em: string | null
  ig_media_id: string | null
  posicao: number
  ideia_id: string | null
  criado_em: string
}

export async function listarReels(admin: Admin, orgId: string): Promise<Reel[]> {
  const { data, error } = await admin
    .from("conteudo_reels")
    .select(REEL_COLS)
    .eq("org_id", orgId)
    .order("posicao", { ascending: true })
    .order("criado_em", { ascending: false })
    .limit(400)
  if (error) throw error
  const rows = (data ?? []) as unknown as ReelRow[]
  if (rows.length === 0) return []

  // Nome do responsável e métricas do post real, em duas leituras por lote.
  const perfis = Array.from(new Set(rows.map((r) => r.responsavel_id).filter((v): v is string => Boolean(v))))
  const midias = Array.from(new Set(rows.map((r) => r.ig_media_id).filter((v): v is string => Boolean(v))))

  const nomes = new Map<string, string>()
  if (perfis.length > 0) {
    // A coluna é `name` neste schema (não `full_name`): pedir a errada faz o
    // select inteiro falhar e o pipeline aparecer vazio.
    const { data: ps } = await admin.from("profiles").select("id, name, email").in("id", perfis)
    for (const p of (ps ?? []) as Array<{ id: string; name: string | null; email: string | null }>) {
      nomes.set(p.id, p.name?.trim() || p.email || "")
    }
  }

  const metricas = new Map<string, { views: number | null; alcance: number | null; permalink: string | null }>()
  if (midias.length > 0) {
    const { data: ms } = await admin.from("conteudo_ig_media").select("id, views, reach, permalink").in("id", midias)
    for (const m of (ms ?? []) as Array<{ id: string; views: number | null; reach: number | null; permalink: string | null }>) {
      // Views e alcance são MEDIDAS DIFERENTES (reprodução × contas
      // alcançadas): usar uma no lugar da outra faria o card comparar
      // grandezas distintas entre dois reels sem ninguém perceber.
      metricas.set(m.id, { views: m.views ?? null, alcance: m.reach ?? null, permalink: m.permalink })
    }
  }

  return rows.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    funil: r.funil,
    etapa: r.etapa,
    tema: r.tema,
    formato: r.formato,
    duracaoS: r.duracao_s,
    score: r.score,
    roteiro: Array.isArray(r.roteiro) ? r.roteiro : [],
    responsavelId: r.responsavel_id,
    responsavelNome: r.responsavel_id ? (nomes.get(r.responsavel_id) ?? null) : null,
    canalId: r.canal_id,
    agendadoPara: r.agendado_para,
    publicadoEm: r.publicado_em,
    metricas: r.ig_media_id ? (metricas.get(r.ig_media_id) ?? null) : null,
    igMediaId: r.ig_media_id,
    posicao: r.posicao,
    ideiaId: r.ideia_id,
    criadoEm: r.criado_em,
  }))
}

export interface NovoReel {
  titulo: string
  funil: EtapaFunil
  etapa?: EtapaReel
  tema?: string | null
  formato?: string | null
  duracaoS?: number | null
  score?: number | null
  ideiaId?: string | null
  posicao?: number
}

export async function criarReel(admin: Admin, orgId: string, userId: string, e: NovoReel): Promise<string> {
  const { data, error } = await admin
    .from("conteudo_reels")
    .insert({
      org_id: orgId,
      titulo: e.titulo.trim(),
      funil: e.funil,
      etapa: e.etapa ?? "ideias",
      tema: e.tema ?? null,
      formato: e.formato ?? null,
      duracao_s: e.duracaoS ?? null,
      score: e.score ?? null,
      ideia_id: e.ideiaId ?? null,
      posicao: e.posicao ?? 0,
      criado_por: userId,
      responsavel_id: userId,
    })
    .select("id")
    .single()
  if (error) throw error
  return data.id as string
}

export interface PatchReel {
  titulo?: string
  funil?: EtapaFunil
  etapa?: EtapaReel
  tema?: string | null
  formato?: string | null
  duracaoS?: number | null
  score?: number | null
  roteiro?: ReelRoteiroBloco[]
  responsavelId?: string | null
  canalId?: string | null
  agendadoPara?: string | null
  posicao?: number
}

export async function patchReel(admin: Admin, orgId: string, id: string, patch: PatchReel): Promise<void> {
  const campos: Record<string, unknown> = {}
  if (patch.titulo !== undefined) campos.titulo = patch.titulo.trim()
  if (patch.funil !== undefined) campos.funil = patch.funil
  if (patch.tema !== undefined) campos.tema = patch.tema
  if (patch.formato !== undefined) campos.formato = patch.formato
  if (patch.duracaoS !== undefined) campos.duracao_s = patch.duracaoS
  if (patch.score !== undefined) campos.score = patch.score
  if (patch.roteiro !== undefined) campos.roteiro = patch.roteiro
  if (patch.responsavelId !== undefined) campos.responsavel_id = patch.responsavelId
  if (patch.canalId !== undefined) campos.canal_id = patch.canalId
  if (patch.agendadoPara !== undefined) campos.agendado_para = patch.agendadoPara
  if (patch.posicao !== undefined) campos.posicao = patch.posicao

  if (patch.etapa !== undefined) {
    campos.etapa = patch.etapa
    // A data de publicação só é carimbada na ENTRADA em "publicado". Sem
    // ler o estado atual, reordenar um card que já está publicado (o
    // arrasto manda a mesma etapa com posição nova) reescreveria a data
    // para hoje — e a semana passaria a contar uma publicação antiga.
    const { data: atual } = await admin.from("conteudo_reels").select("etapa, publicado_em").eq("id", id).eq("org_id", orgId).maybeSingle()
    const era = (atual as { etapa?: EtapaReel; publicado_em?: string | null } | null)?.etapa
    if (patch.etapa === "publicado") {
      if (era !== "publicado" || !(atual as { publicado_em?: string | null } | null)?.publicado_em) campos.publicado_em = new Date().toISOString()
    } else if (era === "publicado") {
      // Sair de "publicado" apaga a data: card que voltou para edição não
      // pode continuar contando como publicação feita.
      campos.publicado_em = null
    }
  }

  const { error } = await admin.from("conteudo_reels").update(campos).eq("id", id).eq("org_id", orgId)
  if (error) throw error
}

export async function excluirReel(admin: Admin, orgId: string, id: string): Promise<void> {
  const { error } = await admin.from("conteudo_reels").delete().eq("id", id).eq("org_id", orgId)
  if (error) throw error
}

/** Ideia → card no pipeline. Idempotente: ideia já enviada devolve o reel. */
export async function enviarIdeiaParaReels(admin: Admin, orgId: string, userId: string, ideiaId: string): Promise<string> {
  const { data: ideia, error } = await admin
    .from("conteudo_ideias")
    .select("id, titulo, funil, molde, score, reel_id, status")
    .eq("id", ideiaId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (error) throw error
  if (!ideia) throw new Error("Ideia não encontrada")
  if (ideia.reel_id) return ideia.reel_id as string

  const reelId = await criarReel(admin, orgId, userId, {
    titulo: ideia.titulo as string,
    // Ideia sem funil entra no topo: é onde a peça nasce quando ninguém
    // classificou, e o card mostra o funil para o operador corrigir.
    funil: ((ideia.funil as EtapaFunil | null) ?? "topo"),
    formato: (ideia.molde as string | null) ?? null,
    score: (ideia.score as number | null) ?? null,
    ideiaId: ideia.id as string,
  })
  await admin.from("conteudo_ideias").update({ reel_id: reelId, status: "enviada" }).eq("id", ideiaId).eq("org_id", orgId)
  log.info("ideia enviada para o pipeline de reels", { ideiaId, reelId })
  return reelId
}
