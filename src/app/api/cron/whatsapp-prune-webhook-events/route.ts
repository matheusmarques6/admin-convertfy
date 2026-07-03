/**
 * Vercel Cron — limpa eventos de webhook processados com sucesso.
 *
 * Schedule: 0 3 * * * (03h UTC, diário)
 *
 * Deleta eventos done com mais de 7 dias (RPC prune_crm_webhook_events).
 * failed/dead ficam pra debug.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"

const log = logger.child("CronWhatsAppPrune")

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc("prune_crm_webhook_events")
    if (error) throw error

    const pruned = (data as Array<{ events_pruned: number }> | null)?.[0]?.events_pruned ?? 0
    log.info("prune concluído", { pruned })
    return NextResponse.json({ success: true, pruned })
  } catch (error) {
    log.error("prune cron falhou", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
