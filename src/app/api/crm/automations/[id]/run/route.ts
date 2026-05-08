/**
 * POST /api/crm/automations/[id]/run
 *
 * Dispara manualmente uma automacao. Recebe trigger_data + opcional
 * deal_id/lead_id/thread_id e monta o context completo antes de
 * executar.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { executeAutomation } from "@/lib/services/crm-automation-executor.service"

const log = logger.child("CrmAutomationRun")

export const dynamic = "force-dynamic"
export const maxDuration = 60

const runSchema = z.object({
  trigger_data: z.record(z.string(), z.unknown()).optional().default({}),
  deal_id: uuid().optional(),
  lead_id: uuid().optional(),
  thread_id: uuid().optional(),
  store_id: uuid().optional(),
  idempotency_key: z.string().optional(),
})

async function resolveOrgId(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string> {
  const { data } = await admin
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single()
  if (!data?.org_id) throw new AppError("Acesso negado: usuario sem organizacao", 403)
  return data.org_id
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(admin, user.id)

    const body = await request.json().catch(() => ({}))
    const parsed = runSchema.parse(body)

    // Monta o context com base nos IDs fornecidos
    const ctx: Record<string, unknown> = {
      trigger_type: "manual",
      trigger_data: parsed.trigger_data,
      org_id: orgId,
    }

    if (parsed.deal_id) {
      const { data: deal } = await admin
        .from("deals")
        .select("id, title, value, status, stage_id, pipeline_id, owner_id, client_id")
        .eq("id", parsed.deal_id)
        .single()
      ctx.deal = deal
    }
    if (parsed.lead_id) {
      const { data: lead } = await admin
        .from("crm_leads")
        .select("id, name, email, phone, company, source, status, ai_qualification_score")
        .eq("id", parsed.lead_id)
        .single()
      ctx.lead = lead
    }
    if (parsed.thread_id) {
      const { data: thread } = await admin
        .from("crm_threads")
        .select("id, contact_name, contact_external_id, status, last_message_preview")
        .eq("id", parsed.thread_id)
        .single()
      ctx.thread = thread
    }

    const result = await executeAutomation({
      automation_id: id,
      trigger_type: "manual",
      trigger_data: parsed.trigger_data,
      idempotency_key: parsed.idempotency_key,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context: ctx as any,
    })

    log.info("[AutomationRun] executed", {
      automation_id: id,
      run_id: result.run_id,
      status: result.status,
    })

    return successResponse(request, result)
  } catch (error) {
    log.error("Automation run error:", error)
    return errorResponse(request, error, "crm-automation-run")
  }
}
