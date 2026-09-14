/**
 * contrato-mode — os três gates do contrato de decisão (14/09, migration
 * 20261145), no desenho de `color-plano-mode.ts`:
 *
 * - `contrato_estrutural`  — validadores de escolha/resgate/blueprint
 *                            (campo × campo). Nasce `on`.
 * - `contrato_textual`     — régua de claims de oferta na copy e no HTML
 *                            final (regex). Nasce `shadow`.
 * - `auditoria_estruturador` — auditoria dos `requisitos` do Estruturador.
 *                            Nasce `on`.
 *
 * `off` = não roda; `shadow` = roda e grava em `_contrato` sem bloquear;
 * `on` = bloqueia (retentativa, depois `failed` nomeado).
 *
 * Uma leitura só para os três (a mesma linha de `email_generation_settings`).
 * Falha de leitura, coluna ausente (a migration é aplicada à mão) ou loja
 * sem org caem nos DEFAULTS e dizem isso no log — não em silêncio.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("ContratoMode")

export const CONTRATO_MODES = ["off", "shadow", "on"] as const
export type ContratoMode = (typeof CONTRATO_MODES)[number]

export interface ContratoModes {
  estrutural: ContratoMode
  textual: ContratoMode
  auditoria: ContratoMode
}

export const CONTRATO_MODES_PADRAO: Readonly<ContratoModes> = Object.freeze({
  estrutural: "on" as const,
  textual: "shadow" as const,
  auditoria: "on" as const,
})

export function normalizarContratoMode(valor: unknown, padrao: ContratoMode): ContratoMode {
  return (CONTRATO_MODES as readonly string[]).includes(valor as string) ? (valor as ContratoMode) : padrao
}

/** Em `on` a violação bloqueia; em `shadow` só grava; em `off` nem roda. */
export function bloqueia(modo: ContratoMode): boolean {
  return modo === "on"
}
export function roda(modo: ContratoMode): boolean {
  return modo !== "off"
}

export async function loadContratoModes(storeId: string): Promise<ContratoModes> {
  try {
    const admin = createAdminClient()
    const { data: store } = await admin.from("client_stores").select("org_id").eq("id", storeId).maybeSingle()
    const orgId = (store as { org_id?: string | null } | null)?.org_id
    if (!orgId) return { ...CONTRATO_MODES_PADRAO }
    const { data, error } = await admin
      .from("email_generation_settings")
      .select("contrato_estrutural, contrato_textual, auditoria_estruturador")
      .eq("org_id", orgId)
      .maybeSingle()
    if (error) {
      log.warn("contrato_mode.load_failed", { storeId, error: error.message, hint: "aplicar a migration 20261145" })
      return { ...CONTRATO_MODES_PADRAO }
    }
    const row = (data ?? {}) as { contrato_estrutural?: unknown; contrato_textual?: unknown; auditoria_estruturador?: unknown }
    return {
      estrutural: normalizarContratoMode(row.contrato_estrutural, CONTRATO_MODES_PADRAO.estrutural),
      textual: normalizarContratoMode(row.contrato_textual, CONTRATO_MODES_PADRAO.textual),
      auditoria: normalizarContratoMode(row.auditoria_estruturador, CONTRATO_MODES_PADRAO.auditoria),
    }
  } catch (err) {
    log.warn("contrato_mode.load_failed", { storeId, error: err instanceof Error ? err.message : String(err) })
    return { ...CONTRATO_MODES_PADRAO }
  }
}
