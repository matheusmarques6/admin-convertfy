/**
 * GET /api/cron/operational-overdue
 *
 * Cron diario (ex: 09h UTC) que identifica tasks operationals
 * atrasadas (due_date < now, status != completed/cancelled) e
 * dispara as automacoes do trigger task_overdue. Usa o mesmo
 * engine das outras automacoes pra reaproveitar logica.
 *
 * Pra evitar disparar a mesma automacao repetidamente todo dia,
 * marcamos `tasks.metadata.overdue_notified_at` ao disparar e
 * filtramos no proximo run.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { executeAutomations } from "@/lib/services/operational-automation.service"
import { logger } from "@/lib/logger"

const log = logger.child("OperationalOverdueCron")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()
    const now = new Date()
    const nowIso = now.toISOString()

    const { data: tasks, error } = await admin
      .from("tasks")
      .select("id, operational_pipeline_id, assignee_id, operational_column_id, due_date, status, metadata")
      .lt("due_date", nowIso)
      .not("operational_pipeline_id", "is", null)
      .not("status", "in", "(completed,cancelled)")

    if (error) throw error

    let processed = 0
    let skipped = 0

    for (const task of tasks ?? []) {
      const meta = (task.metadata ?? {}) as Record<string, unknown>
      const lastNotified = meta.overdue_notified_at as string | undefined
      if (lastNotified) {
        const lastDate = new Date(lastNotified)
        // Re-dispara a cada 24h, nao todo run
        if (now.getTime() - lastDate.getTime() < 23 * 3600 * 1000) {
          skipped++
          continue
        }
      }

      void executeAutomations(task.operational_pipeline_id!, "task_overdue", {
        taskId: task.id,
        assigneeId: task.assignee_id,
        columnId: task.operational_column_id,
      })

      await admin
        .from("tasks")
        .update({
          metadata: { ...meta, overdue_notified_at: nowIso },
        })
        .eq("id", task.id)
      processed++
    }

    log.info("Overdue scan", { processed, skipped })
    return NextResponse.json({
      success: true,
      total: (tasks ?? []).length,
      processed,
      skipped,
    })
  } catch (error) {
    log.error("Overdue cron error", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    )
  }
}
