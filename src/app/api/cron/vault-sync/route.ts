/**
 * GET /api/cron/vault-sync — rede de segurança do sync do vault (30 em 30
 * min). O SHA curto-circuita: sem push novo, é um no-op de 1 chamada.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { syncVault } from "@/lib/vault/vault-sync.service"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError
  const result = await syncVault({ trigger: "cron" })
  return NextResponse.json(result)
}
