/**
 * lint-mode-loader — o interruptor do lint de envio (B2), no desenho do
 * `qa-mode-loader`: `EMAIL_LINT_MODE` no ambiente VENCE
 * `email_generation_settings.lint_mode` (freio de emergência que não
 * depende do Postgres); falha de leitura cai no padrão `enforce` e loga.
 *
 *   off     → nem o pós-processador nem o lint rodam
 *   shadow  → rodam, gravam o run `lint_envio` e NÃO bloqueiam
 *   enforce → achado bloqueante reprova a peça (`failed: lint_<id>`) antes
 *             do QA por modelo
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("LintMode")

export type LintMode = "off" | "shadow" | "enforce"
const MODOS: LintMode[] = ["off", "shadow", "enforce"]
const PADRAO: LintMode = "enforce"

function normalizar(valor: unknown): LintMode | null {
  const v = typeof valor === "string" ? valor.trim().toLowerCase() : ""
  return (MODOS as string[]).includes(v) ? (v as LintMode) : null
}

export function lintModeDoAmbiente(env: Record<string, string | undefined> = process.env): LintMode | null {
  return normalizar(env.EMAIL_LINT_MODE)
}

export async function resolveLintMode(storeId?: string | null): Promise<LintMode> {
  const doAmbiente = lintModeDoAmbiente()
  if (doAmbiente) return doAmbiente
  if (!storeId) return PADRAO
  try {
    const admin = createAdminClient()
    const { data: store } = await admin.from("client_stores").select("org_id").eq("id", storeId).maybeSingle()
    const orgId = (store as { org_id?: string | null } | null)?.org_id
    if (!orgId) return PADRAO
    const { data, error } = await admin.from("email_generation_settings").select("lint_mode").eq("org_id", orgId).maybeSingle()
    if (error) {
      log.warn("lint_mode.load_failed", { storeId, error: error.message, hint: "aplicar a migration 20261147" })
      return PADRAO
    }
    return normalizar((data as { lint_mode?: string | null } | null)?.lint_mode) ?? PADRAO
  } catch {
    return PADRAO
  }
}
