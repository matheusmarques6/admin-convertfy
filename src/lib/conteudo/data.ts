/**
 * Acesso a dados do módulo Conteúdo — a ÚNICA porta de leitura/escrita do
 * lado do cliente. Tudo passa pelas rotas `/api/conteudo/*` (Supabase +
 * Graph API no servidor). Nenhum componente conhece URL nem formato de
 * resposta; erro HTTP vira `ConteudoApiError` com a mensagem da API.
 */

import { PROMPTS_PRONTOS, type PromptPronto } from "./config"
import { ST_TEMPLATES } from "./templates"
import type { Agendado, BrandKit, DashboardData, Documento, ImagemSlot, LeadDoPost, MeuTemplate, Perfil, PerfilEditavel, PerfilFiltro, Template } from "./types"

export class ConteudoApiError extends Error {
  status: number
  code: string | null
  /** No 409 do documento: a versão que está no servidor. */
  documentoAtual?: Documento
  constructor(msg: string, status: number, code: string | null = null) {
    super(msg)
    this.name = "ConteudoApiError"
    this.status = status
    this.code = code
  }
}

type Body<T> = ({ success: true } & T) | { success: false; error?: string; message?: string; code?: string; documento_atual?: Documento }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) } })
  const body = (await res.json().catch(() => null)) as Body<T> | null
  if (!res.ok || !body || body.success === false) {
    const msg =
      (body && "error" in body && typeof body.error === "string" && body.error) ||
      (body && "message" in body && typeof body.message === "string" && body.message) ||
      (res.status === 401 ? "Sessão expirada. Entre de novo." : `Falha ao falar com o servidor (${res.status}).`)
    const err = new ConteudoApiError(msg, res.status, body && "code" in body ? (body.code ?? null) : null)
    if (body && "documento_atual" in body && body.documento_atual) err.documentoAtual = body.documento_atual
    throw err
  }
  return body as T
}

// ── Dashboard ───────────────────────────────────────────────────────────

export interface PeriodoQuery {
  start: string
  end: string
}

export async function getDashboard(perfil: PerfilFiltro, periodo: PeriodoQuery, opts: { sync?: boolean } = {}): Promise<DashboardData> {
  const q = new URLSearchParams({ perfil, start: periodo.start, end: periodo.end })
  if (opts.sync === false) q.set("sync", "0")
  const r = await api<{ dashboard: DashboardData }>(`/api/conteudo/dashboard?${q}`)
  return r.dashboard
}

/** Força a sincronização com o Instagram (botão "Atualizar dados"). */
export async function sincronizarInstagram(): Promise<{ perfis: Perfil[]; resultados: Array<{ channel_id: string; ok: boolean; midias: number; erro?: string }> }> {
  return api(`/api/conteudo/dashboard/sync`, { method: "POST" })
}

export async function getLeadsDoPost(mediaId: string): Promise<{ leads: LeadDoPost[]; total: number }> {
  return api(`/api/conteudo/posts/${encodeURIComponent(mediaId)}/leads`)
}

export async function classificarPost(mediaId: string, patch: { pilar?: string | null; molde?: string | null; palavraChave?: string | null; documentoId?: string | null }): Promise<void> {
  await api(`/api/conteudo/posts/${encodeURIComponent(mediaId)}`, { method: "PATCH", body: JSON.stringify(patch) })
}

// ── Perfis ──────────────────────────────────────────────────────────────

export async function getPerfis(refresh = false): Promise<Perfil[]> {
  const r = await api<{ perfis: Perfil[] }>(`/api/conteudo/perfis${refresh ? "?refresh=1" : ""}`)
  return r.perfis
}

export async function setMetaSemanal(perfil: PerfilEditavel, metaSemanal: number): Promise<Perfil> {
  const r = await api<{ perfil: Perfil }>(`/api/conteudo/perfis/${perfil}`, { method: "PATCH", body: JSON.stringify({ metaSemanal }) })
  return r.perfil
}

// ── Estúdio: templates e prompts (configuração) ─────────────────────────

export function getTemplates(): Template[] {
  return ST_TEMPLATES
}

export function getPromptsProntos(): PromptPronto[] {
  return PROMPTS_PRONTOS
}

/** Slot de imagem a partir de uma URL (upload, banco da org ou gerada). */
export function slotDeUrl(url: string): ImagemSlot {
  return { url, zoom: 100, x: 0, y: 0, larguraSlot: 1080, alturaSlot: 1350 }
}

// ── Imagens (Storage da org) ────────────────────────────────────────────

export interface AssetItem {
  url: string
  path: string
  nome: string
  criadoEm: string | null
  kind: "avatar" | "slide" | "gerada"
}

export async function getAssets(limit = 60): Promise<AssetItem[]> {
  const r = await api<{ itens: AssetItem[] }>(`/api/conteudo/assets?limit=${limit}`)
  return r.itens
}

/** Sobe uma imagem e devolve a URL servida pelo admin (não expira). */
export async function uploadImagem(file: File, kind: "slide" | "avatar" = "slide"): Promise<{ url: string; path: string }> {
  const fd = new FormData()
  fd.append("file", file)
  fd.append("kind", kind)
  return api(`/api/conteudo/upload`, { method: "POST", body: fd })
}

// ── Estúdio: meus templates ─────────────────────────────────────────────

export async function getMeusTemplates(): Promise<MeuTemplate[]> {
  const r = await api<{ templates: MeuTemplate[] }>(`/api/conteudo/templates`)
  return r.templates
}

export async function criarMeuTemplate(t: { nome: string; templateId: string; estrutura: MeuTemplate["estrutura"]; fidelidade?: number | null; usos?: number }): Promise<MeuTemplate> {
  const r = await api<{ template: MeuTemplate }>(`/api/conteudo/templates`, { method: "POST", body: JSON.stringify(t) })
  return r.template
}

export async function usarMeuTemplate(id: string): Promise<MeuTemplate> {
  const r = await api<{ template: MeuTemplate }>(`/api/conteudo/templates/${id}`, { method: "PATCH", body: JSON.stringify({ usar: true }) })
  return r.template
}

export async function excluirMeuTemplate(id: string): Promise<void> {
  await api(`/api/conteudo/templates/${id}`, { method: "DELETE" })
}

// ── Estúdio: documentos ─────────────────────────────────────────────────

export async function getDocumentos(): Promise<Documento[]> {
  const r = await api<{ documentos: Documento[] }>(`/api/conteudo/documentos`)
  return r.documentos
}

export async function getDocumento(id: string): Promise<Documento | null> {
  try {
    const r = await api<{ documento: Documento }>(`/api/conteudo/documentos/${id}`)
    return r.documento
  } catch (e) {
    if (e instanceof ConteudoApiError && e.status === 404) return null
    throw e
  }
}

export async function criarDocumento(doc: Documento): Promise<Documento> {
  const r = await api<{ documento: Documento }>(`/api/conteudo/documentos`, { method: "POST", body: JSON.stringify({ documento: doc }) })
  return r.documento
}

/**
 * Salva (substitui) o documento. `baseAtualizadoEm` é o carimbo da versão
 * que o cliente carregou; se o servidor tiver outra, lança
 * `ConteudoApiError` 409 com `documentoAtual`. `force` sobrescreve.
 */
export async function saveDocumento(doc: Documento, opts: { baseAtualizadoEm?: string | null; force?: boolean } = {}): Promise<Documento> {
  const r = await api<{ documento: Documento }>(`/api/conteudo/documentos/${doc.id}`, {
    method: "PUT",
    body: JSON.stringify({ documento: doc, baseAtualizadoEm: opts.baseAtualizadoEm ?? null, force: Boolean(opts.force) }),
  })
  return r.documento
}

export async function deleteDocumento(id: string): Promise<void> {
  await api(`/api/conteudo/documentos/${id}`, { method: "DELETE" })
}

// ── Brand kits por perfil ───────────────────────────────────────────────

export async function getBrandKits(): Promise<{ kits: Record<PerfilEditavel, BrandKit>; perfis: Perfil[] }> {
  return api(`/api/conteudo/brand-kits`)
}

export async function saveBrandKit(perfil: PerfilEditavel, kit: BrandKit): Promise<void> {
  await api(`/api/conteudo/brand-kits`, { method: "PUT", body: JSON.stringify({ perfil, kit }) })
}

// ── Agenda (Calendário) ─────────────────────────────────────────────────

export async function getAgenda(periodo?: Partial<PeriodoQuery>): Promise<Agendado[]> {
  const q = new URLSearchParams()
  if (periodo?.start) q.set("start", periodo.start)
  if (periodo?.end) q.set("end", periodo.end)
  const r = await api<{ itens: Agendado[] }>(`/api/conteudo/agenda${q.size ? `?${q}` : ""}`)
  return r.itens
}

export async function agendarDocumento(entrada: { documentoId: string; perfil: string | null; data: string; hora: string }): Promise<{ item: Agendado; agenda: { perfil: string; data: string; dataIso: string; hora: string } }> {
  return api(`/api/conteudo/agenda`, { method: "PUT", body: JSON.stringify(entrada) })
}

export async function desagendarDocumento(documentoId: string): Promise<void> {
  await api(`/api/conteudo/agenda?documentoId=${encodeURIComponent(documentoId)}`, { method: "DELETE" })
}
