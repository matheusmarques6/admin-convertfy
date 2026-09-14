/**
 * Marca o e-mail como `failed` a partir da FASE 1 (Passo 11, 14/09).
 *
 * Até aqui só a fase 2 escrevia `failure_reason` (`markEmailFailed` no
 * runner) e o dispatch escrevia `sem_secao_montada`. A fase 1 não tinha
 * escritor: quando a montagem recusava a peça, o e-mail seguia `draft`, ia
 * ao n8n com o template global e morria 3 minutos depois em `hero_failed`
 * — um motivo que não diz o que faltou. Agora a lacuna de biblioteca é
 * dita AQUI, com o nome do dispositivo, antes de gastar copy e imagem.
 *
 * Mesma guarda do dispatch: nunca rebaixa e-mail publicado nem já pronto
 * por uma geração nova. Fail-open no I/O — telemetria e estado nunca
 * bloqueiam quem chamou.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { logger } from "@/lib/logger"

const log = logger.child("Fase1Failure")

/** Status que uma geração nova pode rebaixar para `failed`. */
export const STATUS_REBAIXAVEIS = [
  "draft",
  "pending",
  "in_progress",
  "copy_generating",
  "copy_generating_recovery",
  "failed",
] as const

export type FailureReasonFase1 = "lacuna_biblioteca"

export async function marcarEmailFalhoNaFase1(
  admin: SupabaseClient,
  emailId: string,
  reason: FailureReasonFase1,
  detalhe: Record<string, unknown> = {},
): Promise<boolean> {
  const { error, count } = await admin
    .from("email_flow_emails")
    .update(
      {
        status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: reason,
        updated_at: new Date().toISOString(),
      },
      { count: "exact" },
    )
    .eq("id", emailId)
    .in("status", [...STATUS_REBAIXAVEIS])
  if (error) {
    log.warn("update_failed", { emailId, reason, error: error.message })
    return false
  }
  log.warn("email_failed", { emailId, reason, atualizados: count ?? null, ...detalhe })
  return (count ?? 0) > 0
}
