/**
 * Cron diário: reminder Etapa 2 (cliente_formulario).
 *
 * Cria task pro CS "Cobrar formulário do cliente" quando o onboarding
 * está há mais de 24h na coluna 2 sem submit. Idempotente — só cria se
 * não existe task aberta com mesmo título nas últimas 24h pra mesma loja.
 *
 * Agendado: 09:00 UTC (06:00 BRT) — vercel.json
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingFormReminderCron")

export const dynamic = "force-dynamic"
export const maxDuration = 60

const REMINDER_TITLE = "Cobrar formulário do cliente"
const STUCK_HOURS = 24

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()

    // Lista onboardings em "cliente_formulario" (position 2) há > 24h sem
    // form_submitted_at preenchido.
    const cutoff = new Date(Date.now() - STUCK_HOURS * 60 * 60 * 1000).toISOString()

    const { data: stuckRows, error } = await admin
      .from("onboardings")
      .select(
        "id, org_id, client_id, store_id, last_column_change_at, form_submitted_at, " +
          "current_column:operational_pipeline_columns!onboardings_current_column_id_fkey(id, position), " +
          "client:clients!onboardings_client_id_fkey(id, name, owner_id), " +
          "store:client_stores(id, store_name)",
      )
      .eq("status", "in_progress")
      .is("form_submitted_at", null)
      .lt("last_column_change_at", cutoff)
      .limit(200)

    if (error) {
      log.error("Falha ao listar onboardings travados", { error: error.message })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (stuckRows ?? []) as unknown as Array<{
      id: string
      org_id: string
      client_id: string
      store_id: string
      last_column_change_at: string
      current_column: { position: number } | { position: number }[] | null
      client: { id: string; name: string; owner_id: string | null } | null
      store: { id: string; store_name: string } | null
    }>

    const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    let created = 0
    let skipped = 0

    for (const row of rows) {
      const col = Array.isArray(row.current_column) ? row.current_column[0] : row.current_column
      if (!col || col.position !== 2) continue

      const client = row.client
      const csOwnerId = client?.owner_id
      if (!csOwnerId) {
        log.warn("Onboarding sem CS owner — pulando reminder", { onboardingId: row.id })
        skipped += 1
        continue
      }

      // Idempotência: já criou reminder nas últimas 24h?
      const { data: existing } = await admin
        .from("tasks")
        .select("id, status")
        .eq("onboarding_id", row.id)
        .eq("title", REMINDER_TITLE)
        .gte("created_at", recentCutoff)
        .limit(1)
        .maybeSingle()

      if (existing) {
        skipped += 1
        continue
      }

      // Cria task pro CS
      const { error: insertErr } = await admin.from("tasks").insert({
        org_id: row.org_id,
        onboarding_id: row.id,
        title: REMINDER_TITLE,
        description: `Cliente ${client?.name ?? ""} (loja ${row.store?.store_name ?? ""}) está no formulário há mais de ${STUCK_HOURS}h sem submeter. Cobrar via WhatsApp.`,
        status: "pending",
        priority: "high",
        assignee_id: csOwnerId,
        created_by: csOwnerId,
        source_type: "onboarding",
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })

      if (insertErr) {
        log.error("Falha ao criar reminder task", {
          onboardingId: row.id,
          error: insertErr.message,
        })
        skipped += 1
      } else {
        created += 1
      }
    }

    log.info("[FormReminder] done", {
      total: rows.length,
      created,
      skipped,
    })

    return NextResponse.json({
      success: true,
      total: rows.length,
      created,
      skipped,
    })
  } catch (e) {
    log.error("Form reminder cron failed", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
