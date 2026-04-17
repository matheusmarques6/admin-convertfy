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

  // Tenta ler email_platform + omnisend_api_key (migration 20260417+).
  // Se colunas nao existem, faz fallback para ler apenas Klaviyo e detectar
  // Omnisend separadamente, evitando falha silenciosa.
  const withNew = await supabase
    .from("client_stores")
    .select("email_platform, omnisend_api_key, klaviyo_private_key, klaviyo_api_key")
    .eq("id", storeId)
    .maybeSingle()

  if (!withNew.error && withNew.data) {
    const rec = withNew.data as Record<string, unknown>
    const declared = rec.email_platform as string | null | undefined
    if (declared === "klaviyo" || declared === "omnisend") return declared
    if (rec.omnisend_api_key) return "omnisend"
    if (rec.klaviyo_private_key || rec.klaviyo_api_key) return "klaviyo"
    return "none"
  }

  // Fallback: tentar omnisend_api_key sem email_platform
  if (withNew.error && /email_platform/.test(withNew.error.message || "")) {
    log.warn("[detectStorePlatform] email_platform column missing, trying omnisend-only", { storeId })
    const withOmnisend = await supabase
      .from("client_stores")
      .select("omnisend_api_key, klaviyo_private_key, klaviyo_api_key")
      .eq("id", storeId)
      .maybeSingle()

    if (!withOmnisend.error && withOmnisend.data) {
      const rec = withOmnisend.data as Record<string, unknown>
      if (rec.omnisend_api_key) return "omnisend"
      if (rec.klaviyo_private_key || rec.klaviyo_api_key) return "klaviyo"
      return "none"
    }

    // Ultimo fallback: apenas klaviyo (omnisend_api_key tambem ausente)
    if (withOmnisend.error && /omnisend_api_key/.test(withOmnisend.error.message || "")) {
      log.warn("[detectStorePlatform] omnisend_api_key also missing, klaviyo-only fallback", { storeId })
      const legacyOnly = await supabase
        .from("client_stores")
        .select("klaviyo_private_key, klaviyo_api_key")
        .eq("id", storeId)
        .maybeSingle()

      if (legacyOnly.data) {
        const rec = legacyOnly.data as Record<string, unknown>
        if (rec.klaviyo_private_key || rec.klaviyo_api_key) return "klaviyo"
      }
    }
  }

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
