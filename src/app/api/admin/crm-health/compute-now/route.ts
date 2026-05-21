/**
 * POST /api/admin/crm-health/compute-now
 *
 * Dispara manualmente o calculo de health score (mesmo que o cron
 * diario /api/cron/crm-health-compute faz as 5h UTC). Util pra:
 *  - Testar fluxo health -> health_alert lead sem esperar amanha
 *  - Recalcular apos mudancas em weights/components
 *  - Demo / debug
 *
 * Diferenca pro cron:
 *  - Auth via usuario logado (requireAuth) em vez de CRON_SECRET
 *  - Limita aos org_id do user autenticado (multi-tenant safe)
 *
 * Cria leads CS health_alert automaticamente se a loja cair pra <50.
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  requireAuth,
  successResponse,
  AppError,
} from "@/lib/api/errors"
import { computeStoreHealth } from "@/lib/services/crm-health.service"
import { logger } from "@/lib/logger"

const log = logger.child("AdminHealthComputeNow")

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
      .select("id, org_id")
      .eq("org_id", member.org_id)
      .eq("is_active", true)

    const list = stores ?? []
    let ok = 0
    let errors = 0
    let alertsCreated = 0

    for (const s of list) {
      try {
        // Conta store_alerts health_critical ativos ANTES de computar
        const { count: beforeCount } = await admin
          .from("store_alerts")
          .select("id", { count: "exact", head: true })
          .eq("store_id", s.id)
          .eq("type", "health_critical")
          .eq("status", "active")

        const result = await computeStoreHealth(s.id, s.org_id as string)
        if (result) {
          ok += 1
          // Conta DEPOIS pra ver se foi criado alerta novo
          const { count: afterCount } = await admin
            .from("store_alerts")
            .select("id", { count: "exact", head: true })
            .eq("store_id", s.id)
            .eq("type", "health_critical")
            .eq("status", "active")
          if ((afterCount ?? 0) > (beforeCount ?? 0)) {
            alertsCreated += 1
          }
        } else {
          errors += 1
        }
      } catch (err) {
        log.error("compute error", { store_id: s.id, err })
        errors += 1
      }
    }

    log.info("Health recompute manual", {
      org_id: member.org_id,
      total: list.length,
      ok,
      errors,
      alertsCreated,
    })

    return successResponse(request, {
      total: list.length,
      ok,
      errors,
      alerts_created: alertsCreated,
    })
  } catch (error) {
    return errorResponse(request, error, "admin-health-compute-now")
  }
}
