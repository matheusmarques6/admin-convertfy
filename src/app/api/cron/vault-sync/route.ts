/**
 * GET /api/cron/vault-sync — rede de segurança do sync do vault (30 em 30
 * min). O SHA curto-circuita: sem push novo, é um no-op de 1 chamada.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { syncVault } from "@/lib/vault/vault-sync.service"
import { syncKnowledge } from "@/lib/ai/convertia/knowledge-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError
  const [result, knowledge] = await Promise.all([
    syncVault({ trigger: "cron" }),
    syncKnowledge({ trigger: "cron" }).catch((err) => ({
      status: "error" as const,
      error: err instanceof Error ? err.message : String(err),
    })),
  ])
  return NextResponse.json({ ...result, knowledge })
}
