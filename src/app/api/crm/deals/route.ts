/**
 * GET  /api/crm/deals    — lista com filtros (pipeline, stage, owner, status, tags, busca)
 * POST /api/crm/deals    — cria deal
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmDeals")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const pipeline_id = sp.get("pipeline_id")
    const stage_id = sp.get("stage_id")
    const owner_id = sp.get("owner_id")
    const status = sp.get("status")
    const search = sp.get("search")
    const client_id = sp.get("client_id")
    const store_id = sp.get("store_id")
    const lead_id = sp.get("lead_id")
    const limit = Math.min(parseInt(sp.get("limit") || "200", 10), 500)

    let q = admin
      .from("deals")
      .select(`
        id, pipeline_id, stage_id, client_id, store_id, lead_id,
        title, value, currency, probability, expected_close_date,
        status, source, tags, owner_id, position, last_stage_changed_at,
        won_at, lost_at, created_at, updated_at,
        owner:profiles!deals_owner_id_fkey (id, name, avatar_url),
        client:clients (id, name, company),
        store:client_stores (id, store_name)
      `)
      .neq("status", "archived")
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(limit)

    if (pipeline_id) q = q.eq("pipeline_id", pipeline_id)
    if (stage_id) q = q.eq("stage_id", stage_id)
    if (owner_id) q = q.eq("owner_id", owner_id)
    if (status) q = q.eq("status", status)
    if (client_id) q = q.eq("client_id", client_id)
    if (store_id) q = q.eq("store_id", store_id)
    if (lead_id) q = q.eq("lead_id", lead_id)
    if (search) q = q.ilike("title", `%${search}%`)

    const { data, error } = await q
    if (error) throw error

    return successResponse(request, { deals: data || [] })
  } catch (error) {
    log.error("Deals GET error:", error)
    return errorResponse(request, error, "crm-deals-get")
  }
}

const createDealSchema = z.object({
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  title: z.string().min(1).max(240),
  value: z.number().min(0).optional().default(0),
  currency: z.string().length(3).optional().default("BRL"),
  probability: z.number().int().min(0).max(100).optional().default(50),
  expected_close_date: z.string().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  store_id: z.string().uuid().nullable().optional(),
  lead_id: z.string().uuid().nullable().optional(),
  source: z.string().nullable().optional(),
  utm: z.record(z.unknown()).optional().default({}),
  tags: z.array(z.string()).optional().default([]),
  owner_id: z.string().uuid(),
  referrer_partner_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = createDealSchema.parse(body)

    // Posicao no fim da etapa (maior position + 1)
    const { data: maxPos } = await admin
      .from("deals")
      .select("position")
      .eq("stage_id", parsed.stage_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextPos = (maxPos?.position ?? 0) + 10

    const { data: deal, error } = await admin
      .from("deals")
      .insert({
        ...parsed,
        position: nextPos,
        status: "open",
      })
      .select("id")
      .single()

    if (error) throw error

    // Activity de criacao
    await admin.from("crm_deal_activities").insert({
      deal_id: deal.id,
      type: "system",
      content: `Deal criado: ${parsed.title}`,
      created_by: parsed.owner_id,
      is_internal: true,
    })

    log.info("[Deals] created", { id: deal.id, title: parsed.title })
    return successResponse(request, { id: deal.id })
  } catch (error) {
    log.error("Deals POST error:", error)
    return errorResponse(request, error, "crm-deals-post")
  }
}
