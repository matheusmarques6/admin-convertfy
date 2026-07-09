/**
 * Vercel Cron — fecha janelas de 24h expiradas.
 *
 * Schedule: a cada 10 minutos ("*&#47;10 * * * *" no vercel.json)
 *
 * RPC close_expired_crm_windows: is_window_open=FALSE onde
 * window_expires_at já passou. A UI usa is_window_open + countdown
 * local, então o delay de até 10min não afeta o gate de envio (a rota
 * de envio revalida window_expires_at contra o relógio).
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"

const log = logger.child("CronWhatsAppCloseWindows")

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc("close_expired_crm_windows")
    if (error) throw error

    const closed = (data as Array<{ threads_closed: number }> | null)?.[0]?.threads_closed ?? 0
    if (closed > 0) log.info("janelas fechadas", { closed })
    return NextResponse.json({ success: true, closed })
  } catch (error) {
    log.error("close-windows cron falhou", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
