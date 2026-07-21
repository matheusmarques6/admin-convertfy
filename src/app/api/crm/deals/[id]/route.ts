/**
 * GET    /api/crm/deals/[id]   — ficha completa
 * PATCH  /api/crm/deals/[id]   — atualiza
 * DELETE /api/crm/deals/[id]   — soft delete (status=archived)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmDealDetail")

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

    const { data: deal, error } = await admin
      .from("deals")
      .select(`
        id, pipeline_id, stage_id, client_id, store_id, lead_id,
        title, value, currency, probability, expected_close_date,
        status, source, utm, tags, lost_reason, won_reason,
        owner_id, referrer_partner_id, position, last_stage_changed_at,
        won_at, lost_at, custom_fields, notes, created_at, updated_at,
        owner:profiles!deals_owner_id_fkey (id, name, avatar_url, email),
        client:clients (id, name, company, email, phone),
        store:client_stores (id, store_name, store_url, platform, currency, mrr_cents, health_score),
        pipeline:pipelines (id, name, scope, color, layout),
        stage:pipeline_stages!deals_stage_id_fkey (id, name, color, stage_type),
        lead:crm_leads!deals_lead_id_fkey (
          id, name, email, phone, company, source, status, utm,
          ai_qualification_score, ai_qualification_reason
        )
      `)
      .eq("id", id)
      .single()

    if (error || !deal) {
      // Log detalhado pra distinguir 3 cenarios:
      //   1. ID nao existe no DB (PGRST116 / no rows)
      //   2. UUID malformado (22P02 / invalid syntax)
      //   3. Erro real de query
      log.warn("[Deals] GET 404 ou erro", {
        id,
        idLength: id?.length,
        idPattern: typeof id === "string" ? id.replace(/[a-fA-F0-9]/g, "x") : "n/a",
        errorCode: error?.code,
        errorMessage: error?.message,
      })
      throw new AppError("Deal nao encontrado", 404, "not-found")
    }

    // Activities (timeline)
    const { data: activities } = await admin
      .from("crm_deal_activities")
      .select(`
        id, type, content, metadata, due_at, completed_at, is_internal, created_at,
        creator:profiles!crm_deal_activities_created_by_fkey (id, name, avatar_url)
      `)
      .eq("deal_id", id)
      .order("created_at", { ascending: false })
      .limit(100)

    // History (audit log)
    const { data: history } = await admin
      .from("crm_deal_history")
      .select(`
        id, field, old_value, new_value, changed_at,
        changer:profiles!crm_deal_history_changed_by_fkey (id, name)
      `)
      .eq("deal_id", id)
      .order("changed_at", { ascending: false })
      .limit(50)

    return successResponse(request, {
      deal,
      activities: activities || [],
      history: history || [],
    })
  } catch (error) {
    log.error("Deal detail error:", error)
    return errorResponse(request, error, "crm-deal-detail")
  }
}

const patchSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  value: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expected_close_date: z.string().nullable().optional(),
  stage_id: uuid().optional(),
  status: z.enum(["open", "won", "lost", "archived"]).optional(),
  lost_reason: z.string().nullable().optional(),
  won_reason: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  owner_id: uuid().optional(),
  client_id: uuid().nullable().optional(),
  store_id: uuid().nullable().optional(),
  lead_id: uuid().nullable().optional(),
  referrer_partner_id: uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  position: z.number().int().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
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

    const { data, error } = await admin
      .from("deals")
      .update(parsed)
      .eq("id", id)
      .select("id, status")
      .single()

    if (error) throw error

    return successResponse(request, { deal: data })
  } catch (error) {
    log.error("Deal patch error:", error)
    return errorResponse(request, error, "crm-deal-patch")
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

    const { error } = await admin
      .from("deals")
      .update({ status: "archived" })
      .eq("id", id)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Deal delete error:", error)
    return errorResponse(request, error, "crm-deal-delete")
  }
}
