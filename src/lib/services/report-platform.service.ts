/**
 * Report Platform Service
 *
 * Abstrai a escolha entre Klaviyo e Omnisend para geracao de reports.
 * Cada loja usa UMA plataforma (client_stores.email_platform).
 *
 * Retorna um UnifiedRevenueSummary — estrutura comum que funciona para
 * ambas plataformas — junto com o identificador da plataforma usada.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { getKlaviyoRevenueForStore } from "@/lib/integrations/klaviyo/report-summary"
import { getOmnisendRevenueForStore } from "@/lib/integrations/omnisend/report-summary"
import { type SyncResult } from "@/lib/shared/data-status"
import { logger } from "@/lib/logger"

const log = logger.child("ReportPlatformService")

export type EmailPlatform = "klaviyo" | "omnisend" | "none"

export interface UnifiedRevenueSummary {
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  storeRevenue: number
  currency: string
  platform: EmailPlatform
  campaignReportAvailable?: boolean
  flowReportAvailable?: boolean
  partial?: boolean
  missing?: string[]
}

/**
 * Detecta a plataforma de email de uma loja.
 * Prioridade:
 *   1. Campo client_stores.email_platform (se definido e != 'none')
 *   2. Presenca de credencial (omnisend_api_key / klaviyo_private_key / klaviyo_api_key)
 *   3. 'none' se nada
 */
export async function detectStorePlatform(storeId: string): Promise<EmailPlatform> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("client_stores")
    .select("email_platform, omnisend_api_key, klaviyo_private_key, klaviyo_api_key")
    .eq("id", storeId)
    .maybeSingle()

  if (!data) return "none"

  const declared = (data as Record<string, unknown>).email_platform as string | null | undefined
  if (declared === "klaviyo" || declared === "omnisend") return declared

  const rec = data as Record<string, unknown>
  if (rec.omnisend_api_key) return "omnisend"
  if (rec.klaviyo_private_key || rec.klaviyo_api_key) return "klaviyo"
  return "none"
}

/**
 * Busca resumo de receita da loja usando automaticamente a plataforma
 * correta (Klaviyo ou Omnisend).
 */
export async function getUnifiedRevenueSummary(
  storeId: string,
  period: string,
  customStartDate?: string | null,
  customEndDate?: string | null,
  orgId?: string | null
): Promise<SyncResult<UnifiedRevenueSummary>> {
  const platform = await detectStorePlatform(storeId)

  if (platform === "none") {
    return {
      success: false,
      data: null,
      error: "Loja sem plataforma de email configurada",
      source: "live",
      fetchedAt: new Date().toISOString(),
    }
  }

  if (platform === "omnisend") {
    const result = await getOmnisendRevenueForStore(
      storeId, period, customStartDate, customEndDate, orgId
    )
    if (!result.success || !result.data) {
      return {
        ...result,
        data: null,
      }
    }
    return {
      ...result,
      data: { ...result.data, platform: "omnisend" },
    }
  }

  // Klaviyo
  const result = await getKlaviyoRevenueForStore(
    storeId, period, customStartDate, customEndDate, orgId
  )
  if (!result.success || !result.data) {
    return {
      ...result,
      data: null,
    }
  }
  return {
    ...result,
    data: { ...result.data, platform: "klaviyo" },
  }
}

/**
 * Valida se uma loja tem qualquer plataforma de email configurada.
 * Usado em lugar de checks hardcoded 'has_klaviyo'.
 */
export async function storeHasEmailPlatform(storeId: string): Promise<boolean> {
  const platform = await detectStorePlatform(storeId)
  return platform !== "none"
}

export { log as _reportPlatformLog }
