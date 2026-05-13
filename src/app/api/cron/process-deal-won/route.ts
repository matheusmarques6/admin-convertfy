/**
 * Cron processor: events `deal.won` -> criar onboardings.
 * Roda a cada minuto via vercel.json.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { processDealWonEvents } from "@/lib/services/deal-won-watcher.service"
import { logger } from "@/lib/logger"

const log = logger.child("DealWonCron")

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const result = await processDealWonEvents()
    log.info("Processed deal.won events", result)
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}
