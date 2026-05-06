/**
 * GET   /api/crm/automations/[id]  — detalhe + ultimos runs
 * PATCH /api/crm/automations/[id]  — atualiza (incrementa version)
 * DELETE /api/crm/automations/[id] — soft (is_active=false)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmAutomationDetail")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data: automation, error } = await admin
      .from("automations")
      .select("id, name, description, scope, is_active, version, dag, trigger, created_at, updated_at")
      .eq("id", id)
      .single()

    if (error || !automation) {
      return errorResponse(request, new Error("Automacao nao encontrada"), "not-found", 404)
    }

    const { data: runs } = await admin
      .from("crm_automation_runs")
      .select("id, status, trigger_type, started_at, completed_at, error_message, deal_id, lead_id, thread_id")
      .eq("automation_id", id)
      .order("created_at", { ascending: false })
      .limit(50)

    return successResponse(request, { automation, runs: runs || [] })
  } catch (error) {
    log.error("Automation detail error:", error)
    return errorResponse(request, error, "crm-automation-detail")
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(240).optional(),
  description: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  trigger: z.record(z.unknown()).optional(),
  dag: z
    .object({
      nodes: z.array(z.unknown()),
      edges: z.array(z.unknown()),
    })
    .optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    // Quando dag muda, incrementa version
    const update: Record<string, unknown> = { ...parsed }
    if (parsed.dag) {
      const { data: current } = await admin
        .from("automations")
        .select("version")
        .eq("id", id)
        .single()
      update.version = (current?.version || 1) + 1
    }

    const { error } = await admin.from("automations").update(update).eq("id", id)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Automation patch error:", error)
    return errorResponse(request, error, "crm-automation-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()
    const { error } = await admin.from("automations").update({ is_active: false }).eq("id", id)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "crm-automation-delete")
  }
}
