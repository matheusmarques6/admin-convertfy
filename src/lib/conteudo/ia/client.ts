"use client"

/**
 * Cliente da IA do Estúdio — um POST por ação. Erro do servidor vira
 * mensagem legível (o modo local de `fallback.ts` entra quando o chamador
 * decidir).
 */

import type { EntradaIA, SaidaPorAcao } from "./schemas"

export class IaIndisponivelError extends Error {
  status: number
  constructor(msg: string, status: number) {
    super(msg)
    this.name = "IaIndisponivelError"
    this.status = status
  }
}

export async function chamarIA<K extends keyof SaidaPorAcao>(
  entrada: Extract<EntradaIA, { acao: K }>,
  signal?: AbortSignal,
): Promise<SaidaPorAcao[K]> {
  const res = await fetch("/api/conteudo/ia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entrada),
    signal,
  })
  const body = (await res.json().catch(() => null)) as { success?: boolean; dados?: SaidaPorAcao[K]; error?: string; message?: string } | null
  if (!res.ok || !body?.dados) {
    const msg =
      (body && typeof body.error === "string" && body.error) ||
      (body && typeof body.message === "string" && body.message) ||
      (res.status === 401 ? "Sessão expirada. Entre de novo." : `A ConvertIA não respondeu (erro ${res.status}).`)
    throw new IaIndisponivelError(msg, res.status)
  }
  return body.dados
}
