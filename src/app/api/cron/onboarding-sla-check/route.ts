/**
 * Cron diario: verifica onboardings cuja coluna ultrapassou o sla_hours
 * e dispara notifyStuck (uma vez por dia, ate sair da coluna).
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { notifyStuck } from "@/lib/services/onboarding-notifications.service"
import { reconcileStuckHandoffs } from "@/lib/services/onboarding-task-completion.service"
import { getOnboardingStageResponsibleRole } from "@/lib/permissions/onboarding-stage-access"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingSLACron")

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()

    // Reconciliador da janela de corrida do auto-advance: re-tenta o handoff
    // em onboardings ativos cuja etapa esteja concluida mas que ficaram
    // parados por leituras concorrentes "ainda pendente". Idempotente e
    // protegido por CAS (ver reconcileStuckHandoffs). Roda ANTES da checagem
    // de SLA para nao notificar como "travado" um onboarding que acabou de
    // ser destravado nesta mesma passagem.
    const reconcile = await reconcileStuckHandoffs()

    const { data: rows } = await admin
      .from("onboardings")
      .select(
        `id, org_id, last_column_change_at, current_column_id,
         column:operational_pipeline_columns!onboardings_current_column_id_fkey(
           id, name, slug, sla_hours, default_assignee_role
         )`,
      )
      .eq("status", "in_progress")
      .limit(500)

    const now = Date.now()
    let notified = 0
    for (const r of rows ?? []) {
      const col = (
        Array.isArray(r.column) ? r.column[0] : r.column
      ) as
        | {
            sla_hours: number
            slug: string
            default_assignee_role: string | null
            name: string
          }
        | null
      if (!col || !col.sla_hours) continue
      const ms = now - new Date(r.last_column_change_at).getTime()
      const hours = ms / (1000 * 60 * 60)
      if (hours < col.sla_hours) continue

      const daysStuck = Math.floor(hours / 24)
      // Função responsável canônica da etapa (matriz); fallback pro
      // default_assignee_role. notifyStuck normaliza e resolve por multi-função.
      const responsibleRole =
        getOnboardingStageResponsibleRole(col.slug) ??
        col.default_assignee_role ??
        null
      await notifyStuck({
        onboardingId: r.id,
        orgId: r.org_id,
        daysStuck,
        assigneeRole: responsibleRole,
      })
      notified += 1
    }

    log.info("SLA check done", {
      total: rows?.length ?? 0,
      notified,
      reconcile,
    })
    return NextResponse.json({
      success: true,
      total: rows?.length ?? 0,
      notified,
      reconcile,
    })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}
