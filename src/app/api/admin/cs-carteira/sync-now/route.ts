/**
 * POST /api/admin/cs-carteira/sync-now
 *
 * Dispara resync manual de Gestao de Carteira pra todas lojas do org
 * do user logado. Util pra popular o pipeline sem esperar o cron das
 * 5h UTC ou apos backfill manual.
 *
 * Itera client_stores ativos do org e chama syncCarteiraDeal pra cada
 * um, criando/movendo deals conforme health_score atual.
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  requireAuth,
  successResponse,
  AppError,
} from "@/lib/api/errors"
import { syncCarteiraDeal } from "@/lib/services/cs-pipelines-sync.service"
import { logger } from "@/lib/logger"

const log = logger.child("AdminCarteiraSyncNow")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: member } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!member) throw new AppError("Usuario sem organizacao ativa", 403)

    const { data: stores } = await admin
      .from("client_stores")
      .select("id, health_score")
      .eq("org_id", member.org_id)

    const list = stores ?? []
    let ok = 0
    let errors = 0

    for (const s of list) {
      try {
        await syncCarteiraDeal({
          storeId: s.id as string,
          healthScore: (s.health_score as number | null) ?? null,
        })
        ok += 1
      } catch (err) {
        log.error("sync error", { store_id: s.id, err })
        errors += 1
      }
    }

    log.info("Carteira sync manual", {
      org_id: member.org_id,
      total: list.length,
      ok,
      errors,
    })

    return successResponse(request, {
      total: list.length,
      ok,
      errors,
    })
  } catch (error) {
    return errorResponse(request, error, "admin-carteira-sync-now")
  }
}
