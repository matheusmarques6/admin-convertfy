/**
 * qa-mode-loader — o interruptor do QA sai do ambiente e vai para o banco.
 *
 * `getQaMode()` lê só `process.env`, e ligar o QA em produção exigia um
 * deploy da Vercel; desligá-lo de novo, outro. Isso é exatamente o que os
 * outros gates desta casa (`montador_mode`, `seletor_mode`,
 * `blueprint_mode`, `color_plano_mode`) resolveram indo para
 * `email_generation_settings` — e o QA é o mais importante deles, porque
 * com `enforce` uma issue `high` passa a REPROVAR a peça.
 *
 * **A env continua vencendo**, e isso é decisão: ela é o freio de emergência
 * que não depende do banco responder. Quem quiser desligar o QA numa
 * madrugada em que o Postgres está fora ainda consegue.
 *
 * Precedência: `EMAIL_QA_MODE`/`EMAIL_QA_ENABLED` → `email_generation_settings
 * .qa_mode` → `shadow`.
 *
 * Falha de leitura (coluna ausente — a migration deste repo é aplicada à mão
 * e escorrega) cai no PADRÃO e loga. Errar para o lado de não bloquear é o
 * lado barato: a peça sai com as issues gravadas e alguém revisa; o
 * contrário seria reprovar geração por causa de uma migration pendente.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

import { getQaMode, type QaMode } from "./qa-mode"

const log = logger.child("QaMode")

const MODOS: QaMode[] = ["off", "shadow", "enforce"]

function normalizar(valor: unknown): QaMode | null {
  const v = typeof valor === "string" ? valor.trim().toLowerCase() : ""
  return (MODOS as string[]).includes(v) ? (v as QaMode) : null
}

/** Modo declarado no ambiente, ou `null` quando ninguém declarou nada. */
export function qaModeDoAmbiente(
  env: Record<string, string | undefined> = process.env,
): QaMode | null {
  const explicito = normalizar(env.EMAIL_QA_MODE)
  if (explicito) return explicito
  if (env.EMAIL_QA_ENABLED === "true") return "enforce"
  if (env.EMAIL_QA_ENABLED === "false") return "off"
  return null
}

/**
 * O modo que vale para esta loja.
 *
 * `storeId` ausente devolve o do ambiente (ou o padrão) — é o caminho dos
 * testes e de qualquer chamador que não tenha loja em mãos.
 */
export async function resolveQaMode(storeId?: string | null): Promise<QaMode> {
  const doAmbiente = qaModeDoAmbiente()
  if (doAmbiente) return doAmbiente
  if (!storeId) return getQaMode()
  try {
    const admin = createAdminClient()
    const { data: store } = await admin
      .from("client_stores")
      .select("org_id")
      .eq("id", storeId)
      .maybeSingle()
    const orgId = (store as { org_id?: string | null } | null)?.org_id
    if (!orgId) return getQaMode()
    const { data, error } = await admin
      .from("email_generation_settings")
      .select("qa_mode")
      .eq("org_id", orgId)
      .maybeSingle()
    if (error) {
      log.warn("qa_mode.load_failed", { storeId, error: error.message })
      return getQaMode()
    }
    return normalizar((data as { qa_mode?: string | null } | null)?.qa_mode) ?? getQaMode()
  } catch {
    return getQaMode()
  }
}
