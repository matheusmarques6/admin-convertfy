/**
 * GET    /api/crm/pipelines/[id]      — pipeline + stages + deals
 * PATCH  /api/crm/pipelines/[id]      — atualiza nome/cor/etc
 * DELETE /api/crm/pipelines/[id]      — soft delete (is_archived=true)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmPipelineDetail")

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

    const { data: pipeline, error: pErr } = await admin
      .from("pipelines")
      .select(`
        id, name, description, scope, color, layout,
        is_default, is_archived, default_assignee_id, created_at, updated_at,
        pipeline_stages (
          id, name, color, "order", stage_type, sla_hours, description, exit_criteria
        )
      `)
      .eq("id", id)
      .single()

    if (pErr || !pipeline) {
      log.error("Pipeline GET — query falhou", {
        id,
        error: pErr?.message,
        code: pErr?.code,
        details: pErr?.details,
      })
      throw new AppError("Pipeline nao encontrada", 404, "not-found")
    }

    const stages = (pipeline.pipeline_stages || []).sort(
      (a: { order: number }, b: { order: number }) => a.order - b.order,
    )

    // Query principal SEM join com crm_leads (pra evitar issues de FK
     // em ambientes onde a migration nao rodou completa). Buscamos os
     // leads em query separada via lead_id.
    const { data: deals, error: dErr } = await admin
      .from("deals")
      .select(`
        id, pipeline_id, stage_id, client_id, store_id, lead_id,
        title, value, currency, probability, expected_close_date,
        status, source, tags, owner_id, position, last_stage_changed_at,
        won_at, lost_at, lost_reason, created_at, updated_at,
        owner:profiles!deals_owner_id_fkey (id, name, avatar_url),
        client:clients (id, name, company, email, phone),
        store:client_stores (id, store_name)
      `)
      .eq("pipeline_id", id)
      .neq("status", "archived")
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })

    if (dErr) throw dErr

    const dealIds = (deals || []).map((d) => d.id)
    const leadIds = Array.from(
      new Set(
        (deals || [])
          .map((d) => d.lead_id)
          .filter((v): v is string => !!v),
      ),
    )

    // Buscas auxiliares em paralelo (todas tolerantes a erro — se uma
    // falhar nao quebra a renderizacao do kanban).
    const [pendingRes, leadsRes] = await Promise.all([
      dealIds.length > 0
        ? admin
            .from("crm_deal_activities")
            .select("deal_id")
            .in("deal_id", dealIds)
            .not("due_at", "is", null)
            .is("completed_at", null)
        : Promise.resolve({ data: [], error: null }),
      leadIds.length > 0
        ? admin
            .from("crm_leads")
            .select("id, name, email, phone, ai_qualification_score")
            .in("id", leadIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    const pendingMap = new Map<string, number>()
    for (const a of pendingRes.data || []) {
      if (a.deal_id) pendingMap.set(a.deal_id, (pendingMap.get(a.deal_id) || 0) + 1)
    }

    const leadMap = new Map<
      string,
      {
        id: string
        name: string
        email: string | null
        phone: string | null
        ai_qualification_score: number | null
      }
    >()
    for (const l of leadsRes.data || []) {
      leadMap.set(l.id, l)
    }

    type RawDeal = NonNullable<typeof deals>[number]
    const enrichedDeals = (deals || []).map((d: RawDeal) => {
      const client = Array.isArray(d.client) ? d.client[0] : d.client
      const lead = d.lead_id ? leadMap.get(d.lead_id) : null
      return {
        ...d,
        contact_phone: client?.phone || lead?.phone || null,
        contact_email: client?.email || lead?.email || null,
        ai_score: lead?.ai_qualification_score ?? null,
        activities_pending: pendingMap.get(d.id) || 0,
      }
    })

    return successResponse(request, {
      pipeline: { ...pipeline, stages, pipeline_stages: undefined },
      deals: enrichedDeals,
    })
  } catch (error) {
    log.error("Pipeline detail error:", error)
    return errorResponse(request, error, "crm-pipeline-detail")
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().nullable().optional(),
  color: z.string().optional(),
  default_assignee_id: z.string().uuid().nullable().optional(),
  is_archived: z.boolean().optional(),
  layout: z.enum(["kanban", "state"]).optional(),
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

    const { error } = await admin
      .from("pipelines")
      .update(parsed)
      .eq("id", id)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Pipeline patch error:", error)
    return errorResponse(request, error, "crm-pipeline-patch")
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

    // Soft delete: marca is_archived. Deals continuam existindo mas
    // queries default filtram por is_archived=false.
    const { error } = await admin
      .from("pipelines")
      .update({ is_archived: true })
      .eq("id", id)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Pipeline delete error:", error)
    return errorResponse(request, error, "crm-pipeline-delete")
  }
}
