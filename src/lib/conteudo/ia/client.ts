"use client"

/**
 * Cliente da IA do Estúdio — um POST por ação. Erro do servidor vira
 * mensagem legível (o modo local de `fallback.ts` entra quando o chamador
 * decidir).
 */

import type { EntradaIA, EntradaImagem, SaidaImagem, SaidaPorAcao } from "./schemas"

export class IaIndisponivelError extends Error {
  status: number
  constructor(msg: string, status: number) {
    super(msg)
    this.name = "IaIndisponivelError"
    this.status = status
  }
}

interface Envelope<T> {
  success?: boolean
  dados?: T
  error?: string
  message?: string
  /** Triagem com busca: o que foi realmente servido ao modelo. */
  fontes?: Array<{ titulo: string; url: string }>
  busca_indisponivel?: string | null
  fontes_descartadas?: number
}

async function postEnvelope<T>(entrada: unknown, signal?: AbortSignal): Promise<Envelope<T>> {
  const res = await fetch("/api/conteudo/ia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entrada),
    signal,
  })
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!res.ok || !body?.dados) {
    const msg =
      (body && typeof body.error === "string" && body.error) ||
      (body && typeof body.message === "string" && body.message) ||
      (res.status === 401 ? "Sessão expirada. Entre de novo." : `A ConvertIA não respondeu (erro ${res.status}).`)
    throw new IaIndisponivelError(msg, res.status)
  }
  return body
}

async function post<T>(entrada: unknown, signal?: AbortSignal): Promise<T> {
  return (await postEnvelope<T>(entrada, signal)).dados as T
}

export async function chamarIA<K extends keyof SaidaPorAcao>(
  entrada: Extract<EntradaIA, { acao: K }>,
  signal?: AbortSignal,
): Promise<SaidaPorAcao[K]> {
  return post<SaidaPorAcao[K]>(entrada, signal)
}

export async function gerarImagemIA(entrada: Omit<EntradaImagem, "acao">, signal?: AbortSignal): Promise<SaidaImagem> {
  return post<SaidaImagem>({ acao: "gerar_imagem", ...entrada }, signal)
}

export interface TriagemComFontes {
  triagem: SaidaPorAcao["triagem"]
  /** O que a busca serviu ao modelo (lista fechada de URLs citáveis). */
  fontes: Array<{ titulo: string; url: string }>
  /** Por que a triagem rodou sem fato externo, quando foi o caso. */
  buscaIndisponivel: string | null
  /** Citações que não batiam com o servido e foram removidas. */
  fontesDescartadas: number
}

/**
 * Triagem: além do JSON, devolve o que a busca serviu. A tela precisa
 * disso para mostrar as fontes e para DIZER quando a busca não rodou —
 * triagem sem fato externo é um resultado diferente, não um erro.
 */
export async function chamarTriagem(
  entrada: Extract<EntradaIA, { acao: "triagem" }>,
  signal?: AbortSignal,
): Promise<TriagemComFontes> {
  const env = await postEnvelope<SaidaPorAcao["triagem"]>(entrada, signal)
  return {
    triagem: env.dados as SaidaPorAcao["triagem"],
    fontes: env.fontes ?? [],
    buscaIndisponivel: env.busca_indisponivel ?? null,
    fontesDescartadas: env.fontes_descartadas ?? 0,
  }
}
