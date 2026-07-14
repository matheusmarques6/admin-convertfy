/**
 * GET    /api/crm/pipelines/[id]      — pipeline + stages + deals
 * PATCH  /api/crm/pipelines/[id]      — atualiza nome/cor/etc
 * DELETE /api/crm/pipelines/[id]      — soft delete (is_archived=true)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
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

    // Select com * pra ser resiliente caso a migration de category/is_favorite
    // ainda nao tenha rodado.
    const { data: pipeline, error: pErr } = await admin
      .from("pipelines")
      .select(`
        *,
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
        store:client_stores (id, store_name, health_score, mrr_cents, next_feedback_date, last_feedback_date, additional_notes)
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
            .select("deal_id, type, content, due_at, completed_at")
            .in("deal_id", dealIds)
            .not("due_at", "is", null)
            .is("completed_at", null)
            .order("due_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      leadIds.length > 0
        ? admin
            .from("crm_leads")
            .select("id, name, email, phone, ai_qualification_score")
            .in("id", leadIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    // Mapeia o NEXT step de cada deal (atividade pendente com due_at
    // mais proxima do agora). Tambem conta total de pendentes.
    type PendingActivity = {
      deal_id: string | null
      type: string | null
      content: string | null
      due_at: string | null
    }
    const pendingMap = new Map<string, number>()
    const nextStepMap = new Map<
      string,
      { label: string; when: string; tone: "info" | "warn" | "neg" | "pos" }
    >()
    const now = Date.now()
    for (const raw of pendingRes.data || []) {
      const a = raw as PendingActivity
      if (!a.deal_id) continue
      pendingMap.set(a.deal_id, (pendingMap.get(a.deal_id) || 0) + 1)
      // So pega a primeira (mais proxima) — query ja vem ordenada ASC
      if (nextStepMap.has(a.deal_id)) continue
      if (!a.due_at) continue
      const dueMs = new Date(a.due_at).getTime()
      const diffDays = Math.floor((dueMs - now) / 86400000)
      let when: string
      let tone: "info" | "warn" | "neg" | "pos" = "info"
      if (diffDays < -1) {
        when = `há ${-diffDays}d`
        tone = "neg"
      } else if (diffDays === -1) {
        when = "ontem"
        tone = "warn"
      } else if (diffDays === 0) {
        const hour = new Date(a.due_at).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
        when = `Hoje ${hour}`
      } else if (diffDays === 1) {
        when = "Amanhã"
      } else if (diffDays < 7) {
        when = `em ${diffDays}d`
      } else {
        when = new Date(a.due_at).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
        })
      }
      // Label: usa primeiros 40 chars do content
      const label = (a.content || "Próxima ação").slice(0, 40).trim()
      nextStepMap.set(a.deal_id, { label, when, tone })
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
        next_step: nextStepMap.get(d.id) ?? null,
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
  default_assignee_id: uuid().nullable().optional(),
  is_archived: z.boolean().optional(),
  is_default: z.boolean().optional(),
  is_favorite: z.boolean().optional(),
  category: z.string().max(64).nullable().optional(),
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

    // Quando marca como default, desmarca os outros do mesmo scope.
    if (parsed.is_default === true) {
      const { data: current } = await admin
        .from("pipelines")
        .select("scope")
        .eq("id", id)
        .single()
      if (current?.scope) {
        await admin
          .from("pipelines")
          .update({ is_default: false })
          .eq("scope", current.scope)
          .neq("id", id)
      }
    }

    // Resiliente caso migration de category/is_favorite nao tenha rodado:
    // tenta primeiro com o payload completo, retry omitindo os campos novos.
    const updatePayload: Record<string, unknown> = { ...parsed }
    let { error } = await admin
      .from("pipelines")
      .update(updatePayload)
      .eq("id", id)

    if (error && /column .* does not exist/i.test(error.message)) {
      log.warn("[Pipelines] PATCH retrying without category/is_favorite (migration pending)")
      delete updatePayload.category
      delete updatePayload.is_favorite
      const retry = await admin
        .from("pipelines")
        .update(updatePayload)
        .eq("id", id)
      error = retry.error
    }

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
