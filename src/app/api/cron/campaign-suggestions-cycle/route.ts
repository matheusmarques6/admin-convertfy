/**
 * Vercel Cron — Ciclo semanal da Central de Campanhas.
 *
 * Schedule (vercel.json): "0 1 * * 1" — segunda 01h UTC = domingo 22h BRT.
 *
 * Para cada org com lojas Omnisend ativas, roda runSuggestionCycle
 * (contexto 100% de tabelas locais + chamadas IA por cluster).
 *
 * Query params:
 *   ?dry_run=1 — monta o contexto e loga sem chamar a IA nem criar ciclo.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { runSuggestionCycle } from "@/lib/services/campaign-central/suggestion-engine.service"
import { getSettings } from "@/lib/services/campaign-central/settings.service"
import { logger } from "@/lib/logger"

const log = logger.child("CronCampaignSuggestions")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  const dryRun = request.nextUrl.searchParams.get("dry_run") === "1"

  try {
    const admin = createAdminClient()

    // Orgs com pelo menos uma loja elegível (ativa + Omnisend)
    const { data: storeOrgs, error } = await admin
      .from("client_stores")
      .select("org_id")
      .eq("is_active", true)
      .not("omnisend_api_key", "is", null)
      .not("org_id", "is", null)
    if (error) throw error

    const orgIds = Array.from(new Set((storeOrgs ?? []).map((s) => s.org_id as string)))
    log.info("cron.start", { orgs: orgIds.length, dryRun })

    const results = []
    for (const orgId of orgIds) {
      const settings = await getSettings(orgId)
      if (!settings.auto_cycle_enabled) {
        log.info("cron.skipped_disabled", { orgId })
        results.push({ orgId, status: "skipped_disabled" as const, suggestionsCreated: 0 })
        continue
      }
      const result = await runSuggestionCycle({ orgId, triggeredBy: "cron", dryRun })
      results.push({ orgId, ...result })
    }

    const created = results.reduce((sum, r) => sum + r.suggestionsCreated, 0)
    log.info("cron.done", { orgs: orgIds.length, suggestionsCreated: created })

    return NextResponse.json({ success: true, dryRun, results })
  } catch (err) {
    log.error("cron.error", err)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
