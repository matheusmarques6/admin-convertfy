/**
 * Vercel Cron — sync diário dos insights de anúncios do funil comercial.
 *
 * Schedule: 40 6 * * * (logo após o crm-snapshot)
 *
 * Janela de 30 dias em toda execução: a Meta reprocessa atribuição
 * retroativamente (~7 dias), então reimportar mantém os números
 * alinhados ao Gerenciador de Anúncios. Idempotente — UPSERT por
 * (ad_account_id, day, level, entity_id).
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { syncAllAdAccounts } from "@/lib/services/crm-meta-ads-sync.service"
import { logger } from "@/lib/logger"

const log = logger.child("CronCrmAdsSync")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    log.info("CRM ads sync cron started")
    const results = await syncAllAdAccounts({ days: 30 })
    const failed = results.filter((r) => r.error)
    log.info("CRM ads sync cron completed", {
      accounts: results.length,
      failed: failed.length,
      rows: results.reduce((s, r) => s + r.rows, 0),
    })
    return NextResponse.json({
      success: true,
      accounts: results.length,
      failed: failed.length,
      results,
    })
  } catch (error) {
    log.error("CRM ads sync cron failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
