/**
 * Vercel Cron — daily CRM snapshot (BI-first).
 *
 * Schedule: 0 6 * * * (6h UTC = 3h America/Sao_Paulo)
 *
 * Popula crm_pipeline_snapshots, crm_org_snapshots e
 * crm_lead_funnel_snapshots pra todas orgs ativas. Idempotente:
 * UPSERT por (org_id, [pipeline_id], day).
 */

import { NextRequest, NextResponse } from "next/server"
import { computeAllOrgSnapshots } from "@/lib/services/crm-snapshot.service"
import { avaliarSnapshot } from "@/lib/crm/snapshot-saude"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"

const log = logger.child("CronCrmSnapshot")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    log.info("CRM snapshot cron started")
    const result = await computeAllOrgSnapshots()
    // Zero com `success: true` se lê como "não havia o que fazer" — foi
    // assim que este cron rodou por meses sem gravar UMA linha, com as
    // três tabelas vazias e a tela de Reports em branco. O veredicto é
    // do módulo puro, e a rodada sem escrita responde 500: cron que
    // falha tem de aparecer como falha no painel da plataforma.
    const veredicto = avaliarSnapshot(result)
    if (!veredicto.ok) {
      log.error("CRM snapshot cron não gravou", { motivo: veredicto.motivo, ...result })
      return NextResponse.json({ success: false, error: veredicto.motivo, ...result }, { status: 500 })
    }
    log.info("CRM snapshot cron completed", { motivo: veredicto.motivo, ...result })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    log.error("CRM snapshot cron failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
