/**
 * Acesso a dados do módulo Conteúdo — a ÚNICA porta de leitura/escrita do
 * lado do cliente. Tudo passa pelas rotas `/api/conteudo/*` (Supabase +
 * Graph API no servidor). Nenhum componente conhece URL nem formato de
 * resposta; erro HTTP vira `ConteudoApiError` com a mensagem da API.
 */

import { PROMPTS_PRONTOS, type PromptPronto } from "./config"
import { ST_TEMPLATES } from "./templates"
import type { Agendado, BrandKit, DashboardData, Documento, EtapaFunil, Formato, ImagemSlot, LeadDoPost, MeuTemplate, Perfil, PerfilEditavel, PerfilFiltro, Reel, Referencia, ReferenciaCandidata, Template, Trend, TrendsStatus } from "./types"
import type { Ideia } from "./ideias/banco"
import type { EtapaReel, ProgressoFunil } from "./reels/pipeline"

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

/** Classificação em lote (seleção da tabela). Campo ausente não é tocado. */
export async function classificarPosts(ids: string[], patch: { pilar?: string | null; molde?: string | null; palavraChave?: string | null }): Promise<number> {
  const r = await api<{ atualizados: number }>(`/api/conteudo/posts`, { method: "PATCH", body: JSON.stringify({ ids, ...patch }) })
  return r.atualizados
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

/**
 * Cadência do perfil: em que dias da semana ele publica e a que hora. Lista
 * de dias VAZIA devolve o calendário ao modo "sugerido pela meta" — e a tela
 * diz qual dos dois está valendo.
 */
export async function setCadencia(perfil: PerfilEditavel, e: { dias?: number[]; hora?: string | null }): Promise<Perfil> {
  const r = await api<{ perfil: Perfil }>(`/api/conteudo/perfis/${perfil}`, {
    method: "PATCH",
    body: JSON.stringify({ cadenciaDias: e.dias, cadenciaHora: e.hora }),
  })
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
export async function uploadImagem(file: File, kind: "slide" | "avatar" | "referencia" = "slide"): Promise<{ url: string; path: string }> {
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

// ── Estúdio: referências (exemplos que a ConvertIA lê) ──────────────────

export async function getReferencias(): Promise<Referencia[]> {
  const r = await api<{ referencias: Referencia[] }>(`/api/conteudo/referencias`)
  return r.referencias
}

/** Carrosséis reais do Instagram que ainda não viraram referência. */
export async function getCandidatosReferencia(): Promise<ReferenciaCandidata[]> {
  const r = await api<{ candidatos: ReferenciaCandidata[] }>(`/api/conteudo/referencias/candidatos`)
  return r.candidatos
}

/** Importa um post real: lê os slides na Meta, guarda e transcreve (até ~1 min). */
export async function importarReferencia(igMediaId: string): Promise<Referencia> {
  const r = await api<{ referencia: Referencia }>(`/api/conteudo/referencias/importar`, { method: "POST", body: JSON.stringify({ igMediaId }) })
  return r.referencia
}

/** Referência a partir de slides enviados (URLs do upload com kind=referencia). */
export async function criarReferenciaUpload(entrada: { nome?: string; slidesUrls: string[]; legenda?: string | null }): Promise<Referencia> {
  const r = await api<{ referencia: Referencia }>(`/api/conteudo/referencias`, { method: "POST", body: JSON.stringify(entrada) })
  return r.referencia
}

export interface PatchReferenciaEntrada {
  retranscrever?: boolean
  nome?: string
  /** `imagemUrl` só é aceita para slide que ainda não tem imagem (URL do upload kind=referencia). */
  slides?: Array<{ ordem: number; tipo?: string; titulo?: string; corpo?: string; imagemUrl?: string }>
  legenda?: string | null
  palavraChave?: string | null
  pilar?: string | null
  molde?: string | null
  porQueFunciona?: string[]
  peso?: 1 | 2 | 3
  ativa?: boolean
}

export async function patchReferencia(id: string, patch: PatchReferenciaEntrada): Promise<Referencia> {
  const r = await api<{ referencia: Referencia }>(`/api/conteudo/referencias/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
  return r.referencia
}

export async function deleteReferencia(id: string): Promise<void> {
  await api(`/api/conteudo/referencias/${id}`, { method: "DELETE" })
}

// ── Comment gate: a automação da palavra ────────────────────────────────
//
// Estas duas são as ÚNICAS chamadas do Estúdio a rotas do CRM, e é de
// propósito: a automação mora no CRM (é lá que ela é editada, pausada e
// auditada), então duplicá-la sob /api/conteudo criaria um segundo dono
// da mesma coisa. O que não muda é o contrato deste módulo — nenhum
// componente conhece URL nem formato de resposta.

export interface PipelineDeVendas {
  id: string
  name: string
  stages: Array<{ id: string; name: string; order: number; stage_type?: string | null }>
}

export async function getPipelinesDeVendas(): Promise<PipelineDeVendas[]> {
  const r = await api<{ pipelines: PipelineDeVendas[] }>(`/api/crm/pipelines?scope=sales`)
  return r.pipelines ?? []
}

export interface LigarCommentGateEntrada {
  canalId: string
  palavra: string
  resposta: string
  pipelineId: string
  etapaId: string
  ativar: boolean
}

export interface CommentGateLigado {
  id: string
  name: string
  is_active: boolean
  /** true = já existia uma igual; o Estúdio devolveu ela em vez de duplicar. */
  already_exists: boolean
}

export async function ligarCommentGate(e: LigarCommentGateEntrada): Promise<CommentGateLigado> {
  return api<CommentGateLigado>(`/api/crm/channels/${e.canalId}/instagram/setup-automation`, {
    method: "POST",
    body: JSON.stringify({
      pipeline_id: e.pipelineId,
      stage_id: e.etapaId,
      event_kind: "comment",
      // Com palavra-chave o "só a primeira mensagem" atrapalha (quem já
      // comentou no post não entraria) — o servidor descarta, mandamos
      // false para a intenção ficar explícita nos dois lados.
      first_message_only: false,
      only_this_channel: true,
      activate: e.ativar,
      keyword: e.palavra,
      reply: e.resposta,
    }),
  })
}

// ── Banco de ideias ─────────────────────────────────────────────────────

export async function getIdeias(): Promise<Ideia[]> {
  const r = await api<{ ideias: Ideia[] }>(`/api/conteudo/ideias`)
  return r.ideias ?? []
}

export interface NovaIdeia {
  titulo: string
  funil?: EtapaFunil | null
  formato?: Formato | null
  tags?: string[]
  fonte?: Ideia["fonte"]
  fonteDetalhe?: string | null
  trendId?: string | null
  /** false pula a ConvertIA (anotação crua, sem score). */
  classificar?: boolean
}

/** Devolve `classificada: false` quando a IA falhou — a ideia entrou crua. */
export async function criarIdeia(e: NovaIdeia): Promise<{ ideia: Ideia; classificada: boolean }> {
  return api<{ ideia: Ideia; classificada: boolean }>(`/api/conteudo/ideias`, { method: "POST", body: JSON.stringify(e) })
}

/**
 * A ConvertIA propõe pautas e elas já entram no banco. `lacunas` (o que
 * falta fechar na semana) vem do pipeline de Reels — sem elas, é o "gerar
 * ideias" solto do banco.
 */
export async function gerarIdeias(opts: { lacunas?: string[]; quantidade?: number } = {}): Promise<Ideia[]> {
  const r = await api<{ ideias: Ideia[] }>(`/api/conteudo/ideias/gerar`, { method: "POST", body: JSON.stringify(opts) })
  return r.ideias ?? []
}

export async function patchIdeia(
  id: string,
  campos: Partial<Pick<Ideia, "titulo" | "funil" | "formato" | "tags" | "molde" | "status">>,
): Promise<Ideia> {
  const r = await api<{ ideia: Ideia }>(`/api/conteudo/ideias/${id}`, { method: "PATCH", body: JSON.stringify(campos) })
  return r.ideia
}

export async function deleteIdeia(id: string): Promise<void> {
  await api(`/api/conteudo/ideias/${id}`, { method: "DELETE" })
}

/** Alterna o voto. A contagem vem do COUNT do servidor, não do número da tela + 1. */
export async function votarIdeia(id: string): Promise<{ votos: number; votei: boolean }> {
  return api<{ votos: number; votei: boolean }>(`/api/conteudo/ideias/${id}/voto`, { method: "POST" })
}

export async function enviarIdeiaParaReels(id: string): Promise<string> {
  const r = await api<{ reelId: string }>(`/api/conteudo/ideias/${id}/enviar-reels`, { method: "POST" })
  return r.reelId
}

// ── Pipeline de Reels ───────────────────────────────────────────────────

export async function getReels(): Promise<{ reels: Reel[]; progresso: ProgressoFunil[] }> {
  const r = await api<{ reels: Reel[]; progresso: ProgressoFunil[] }>(`/api/conteudo/reels`)
  return { reels: r.reels ?? [], progresso: r.progresso ?? [] }
}

export interface NovoReel {
  titulo: string
  funil: EtapaFunil
  etapa?: EtapaReel
  tema?: string | null
  formato?: string | null
  duracaoS?: number | null
}

export async function criarReel(e: NovoReel): Promise<string> {
  const r = await api<{ id: string }>(`/api/conteudo/reels`, { method: "POST", body: JSON.stringify(e) })
  return r.id
}

export type PatchReel = Partial<
  Pick<Reel, "titulo" | "funil" | "etapa" | "tema" | "formato" | "duracaoS" | "score" | "roteiro" | "responsavelId" | "canalId" | "agendadoPara" | "posicao">
>

export async function patchReel(id: string, campos: PatchReel): Promise<void> {
  await api(`/api/conteudo/reels/${id}`, { method: "PATCH", body: JSON.stringify(campos) })
}

export async function deleteReel(id: string): Promise<void> {
  await api(`/api/conteudo/reels/${id}`, { method: "DELETE" })
}

// ── Assuntos em alta ────────────────────────────────────────────────────
//
// O status viaja junto do dado de propósito: o painel diz QUANDO a rodada
// foi feita e se a busca na internet está configurada. Sem isso, uma lista
// de três dias atrás parece o que está em alta agora.

export async function getTrends(): Promise<{ trends: Trend[]; status: TrendsStatus }> {
  return api<{ trends: Trend[]; status: TrendsStatus }>(`/api/conteudo/trends`)
}

export interface TrendsGeradas {
  trends: Trend[]
  status: TrendsStatus
  /** Links que a IA citou fora do que a busca serviu (removidos antes de gravar). */
  fontes_descartadas: number
  /** Por que a rodada saiu sem fato externo, quando foi o caso. */
  busca_indisponivel: string | null
}

export async function gerarTrends(): Promise<TrendsGeradas> {
  return api<TrendsGeradas>(`/api/conteudo/trends`, { method: "POST" })
}

export async function arquivarTrend(id: string): Promise<void> {
  await api(`/api/conteudo/trends/${id}`, { method: "DELETE" })
}
