/**
 * O que a ficha do e-mail mostra no lugar do preview — módulo PURO,
 * client-safe.
 *
 * Até 14/09 o preview era `email.html || renderEmailHtml(email, blocks)`:
 * sem `html`, caía no renderizador LEGADO por tipo de bloco, que não
 * conhece `body`/`reviews` e desenha a hero com o que estiver em
 * `email_blocks.content` — inclusive a imagem da geração anterior. Foi
 * assim que um e-mail cuja copy o n8n nunca devolveu (batch 879fe6e4)
 * apareceu na tela como "só a hero, com a imagem no lugar errado": uma
 * prévia falsa de um e-mail que não existe.
 *
 * Regra: o renderizador legado só serve e-mail SEM geração (sem
 * `generation_batch_id` — flows antigos do Klaviyo). Com geração e sem
 * `html`, a tela mostra o ESTADO — aguardando o n8n, renderizando, ou a
 * falha nomeada — nunca um desenho.
 */

import type { EmailFlowEmail } from "@/types/email-workspace"
import { translateFailureReason } from "./failure-reason"

/** Status em que a copy ainda não voltou do n8n. */
export const AGUARDANDO_COPY = [
  "pending",
  "in_progress",
  "copy_generating",
  "copy_generating_recovery",
] as const

/** Status em que a copy existe e a fase 2 ainda não terminou. */
export const RENDERIZANDO = ["copy_ready", "rendering", "image_done", "qa_running"] as const

export type PreviewState =
  /** Há HTML gerado: é ele que se mostra. */
  | { kind: "html"; html: string }
  /** E-mail sem geração (flow legado): o renderizador por blocos vale. */
  | { kind: "legado" }
  /** Copy despachada ao n8n e ainda sem callback. */
  | { kind: "aguardando_copy"; desde: string | null }
  /** Copy gravada; imagem/HTML/QA em andamento. */
  | { kind: "renderizando"; status: string }
  /** A geração falhou — o motivo traduzido. */
  | { kind: "falhou"; motivo: string; codigo: string | null }
  /** Terminal sem HTML (ex.: somente-texto): nada a desenhar. */
  | { kind: "sem_html"; status: string }

export type PreviewEmail = Pick<
  EmailFlowEmail,
  "html" | "status" | "generation_batch_id" | "copy_started_at" | "failure_reason"
>

export function previewState(email: PreviewEmail): PreviewState {
  if (email.html && email.html.trim()) return { kind: "html", html: email.html }
  if (!email.generation_batch_id) return { kind: "legado" }
  const status = String(email.status ?? "")
  if (status === "failed") {
    return {
      kind: "falhou",
      motivo: translateFailureReason(email.failure_reason),
      codigo: email.failure_reason ?? null,
    }
  }
  if ((AGUARDANDO_COPY as readonly string[]).includes(status)) {
    return { kind: "aguardando_copy", desde: email.copy_started_at ?? null }
  }
  if ((RENDERIZANDO as readonly string[]).includes(status)) {
    return { kind: "renderizando", status }
  }
  return { kind: "sem_html", status }
}

/** O preview aceita edição (estrutura/tipografia)? Só com HTML gerado. */
export function previewEditavel(estado: PreviewState): boolean {
  return estado.kind === "html" || estado.kind === "legado"
}
