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

async function post<T>(entrada: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch("/api/conteudo/ia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entrada),
    signal,
  })
  const body = (await res.json().catch(() => null)) as { success?: boolean; dados?: T; error?: string; message?: string } | null
  if (!res.ok || !body?.dados) {
    const msg =
      (body && typeof body.error === "string" && body.error) ||
      (body && typeof body.message === "string" && body.message) ||
      (res.status === 401 ? "Sessão expirada. Entre de novo." : `A ConvertIA não respondeu (erro ${res.status}).`)
    throw new IaIndisponivelError(msg, res.status)
  }
  return body.dados
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
