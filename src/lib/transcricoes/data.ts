/**
 * Porta ÚNICA de leitura e escrita do lado do cliente. Nenhum componente
 * conhece URL nem formato de resposta; erro HTTP vira `TranscricoesApiError`
 * com a mensagem que a API mandou — não "algo deu errado".
 */

import type {
  BibliotecaPagina,
  Colecao,
  EstadoDaFila,
  Plataforma,
  PreviaLink,
  TranscricaoDetalhe,
  TrechoEncontrado,
} from "./types"

export class TranscricoesApiError extends Error {
  status: number
  constructor(msg: string, status: number) {
    super(msg)
    this.name = "TranscricoesApiError"
    this.status = status
  }
}

type Corpo<T> = ({ success: true } & T) | { success: false; error?: string; message?: string }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const corpo = (await res.json().catch(() => null)) as Corpo<T> | null
  if (!res.ok || !corpo || corpo.success === false) {
    const msg =
      (corpo && "error" in corpo && typeof corpo.error === "string" && corpo.error) ||
      (corpo && "message" in corpo && typeof corpo.message === "string" && corpo.message) ||
      (res.status === 401 ? "Sessão expirada. Entre de novo." : `Falha ao falar com o servidor (${res.status}).`)
    throw new TranscricoesApiError(msg, res.status)
  }
  return corpo as T
}

// ── Biblioteca ──────────────────────────────────────────────────────────

export interface QueryBiblioteca {
  colecao?: string | null
  plataforma?: Plataforma | null
  status?: string | null
  ordem?: string
  q?: string
  pagina?: number
}

export interface RespostaBiblioteca {
  pagina: BibliotecaPagina
  arvore: { raizes: Colecao[]; totalGeral: number; semColecao: number; inboxId: string | null }
  colecoes: Array<{ id: string; nome: string; paiId: string | null; reservada: "inbox" | null }>
  busca: { termo: string; trechos: TrechoEncontrado[]; totalTrechos: number; semanticaIndisponivel: boolean }
  fila: EstadoDaFila
}

export function queryString(q: QueryBiblioteca): string {
  const p = new URLSearchParams()
  if (q.colecao) p.set("colecao", q.colecao)
  if (q.plataforma) p.set("plataforma", q.plataforma)
  if (q.status) p.set("status", q.status)
  if (q.ordem) p.set("ordem", q.ordem)
  if (q.q?.trim()) p.set("q", q.q.trim())
  if (q.pagina) p.set("pagina", String(q.pagina))
  return p.toString()
}

export async function getBiblioteca(q: QueryBiblioteca): Promise<RespostaBiblioteca> {
  const qs = queryString(q)
  return api<RespostaBiblioteca>(`/api/transcricoes${qs ? `?${qs}` : ""}`)
}

// ── Ingestão ────────────────────────────────────────────────────────────

export async function getPrevia(urls: string[]): Promise<{ itens: PreviaLink[]; duracaoDisponivel: boolean }> {
  return api(`/api/transcricoes/previa`, { method: "POST", body: JSON.stringify({ urls }) })
}

export interface ItemEnfileirado {
  url: string
  id: string | null
  titulo: string | null
  erro: string | null
}

export async function enfileirarLinks(entrada: {
  urls: string[]
  colecaoId: string | null
  idioma: string
  tags: string[]
}): Promise<{ itens: ItemEnfileirado[]; enfileiradas: number }> {
  return api(`/api/transcricoes`, { method: "POST", body: JSON.stringify(entrada) })
}

export interface DestinoUpload {
  id: string
  bucket: string
  caminho: string
  enderecoTus: string
  tamanhoMaximoBytes: number
}

export async function prepararUpload(entrada: {
  nomeArquivo: string
  tamanhoBytes: number
  tipo?: string
  colecaoId: string | null
  idioma: string
  tags: string[]
}): Promise<DestinoUpload> {
  return api(`/api/transcricoes/upload`, { method: "POST", body: JSON.stringify(entrada) })
}

/** Fecha o ciclo do upload: só aqui a linha vira visível para o worker. */
export async function concluirUpload(id: string): Promise<{ id: string; titulo: string }> {
  return api(`/api/transcricoes/upload`, { method: "POST", body: JSON.stringify({ id, concluido: true }) })
}

// ── Item ────────────────────────────────────────────────────────────────

export async function getTranscricao(id: string): Promise<TranscricaoDetalhe> {
  const r = await api<{ transcricao: TranscricaoDetalhe }>(`/api/transcricoes/${id}`)
  return r.transcricao
}

export async function atualizarTranscricao(
  id: string,
  patch: { colecaoId?: string | null; titulo?: string; tags?: string[] },
): Promise<void> {
  await api(`/api/transcricoes/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
}

export async function excluirTranscricao(id: string): Promise<void> {
  await api(`/api/transcricoes/${id}`, { method: "DELETE" })
}

export async function reprocessar(id: string, escopo: "indexacao" | "tudo" = "indexacao"): Promise<void> {
  await api(`/api/transcricoes/${id}/reprocessar`, { method: "POST", body: JSON.stringify({ escopo }) })
}

export async function salvarBloco(
  id: string,
  blocoId: number,
  texto: string,
): Promise<{ bloco: { id: number; s: number; fim: number; texto: string; editado: boolean }; chunksParaReindexar: number }> {
  return api(`/api/transcricoes/${id}/blocos`, { method: "PATCH", body: JSON.stringify({ blocoId, texto }) })
}

export async function renomearLocutor(
  id: string,
  locutorId: number,
  nome: string,
): Promise<{ locutor: { id: number; rotuloOriginal: string; nome: string; cor: number }; falasAtualizadas: number }> {
  return api(`/api/transcricoes/${id}/locutores`, { method: "PATCH", body: JSON.stringify({ locutorId, nome }) })
}

export function urlExport(id: string, formato: "txt" | "srt" | "md"): string {
  return `/api/transcricoes/${id}/export?formato=${formato}`
}

// ── Lote ────────────────────────────────────────────────────────────────

export async function acaoEmLote(entrada: {
  ids: string[]
  acao: "mover" | "excluir" | "adicionar_tags" | "remover_tags"
  colecaoId?: string | null
  tags?: string[]
}): Promise<{ afetados: number }> {
  return api(`/api/transcricoes/lote`, { method: "POST", body: JSON.stringify(entrada) })
}

// ── Coleções ────────────────────────────────────────────────────────────

export interface RespostaColecoes {
  raizes: Colecao[]
  todas: Colecao[]
  totalGeral: number
  semColecao: number
  inboxId: string | null
  podeSemear: boolean
}

export async function getColecoes(): Promise<RespostaColecoes> {
  return api(`/api/transcricoes/colecoes`)
}

export async function criarColecao(entrada: { nome: string; paiId?: string | null }): Promise<{ colecao: { id: string } }> {
  return api(`/api/transcricoes/colecoes`, { method: "POST", body: JSON.stringify(entrada) })
}

export async function semearEstrutura(): Promise<{ criadas: number }> {
  return api(`/api/transcricoes/colecoes`, { method: "POST", body: JSON.stringify({ semearEstrutura: true }) })
}

export async function atualizarColecao(
  id: string,
  patch: {
    nome?: string
    paiId?: string | null
    naBaseDeConhecimento?: boolean
    phraseList?: string[]
    modelo?: string
  },
): Promise<{ colecao: Colecao; enfileirados: number }> {
  return api(`/api/transcricoes/colecoes/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
}

export async function excluirColecao(id: string): Promise<void> {
  await api(`/api/transcricoes/colecoes/${id}`, { method: "DELETE" })
}
