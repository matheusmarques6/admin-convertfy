/**
 * GET    /api/crm/leads/[id]            — ficha + atividades
 * PATCH  /api/crm/leads/[id]            — atualiza
 * DELETE /api/crm/leads/[id]            — soft (status=lost)
 *
 * POST  /api/crm/leads/[id]/convert     — converte em deal
 * (rota separada em ./convert/route.ts)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmLeadDetail")

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

    const { data: lead, error } = await admin
      .from("crm_leads")
      .select(`
        id, name, email, phone, company, role, source, utm, status,
        converted_to_client_id, converted_to_deal_id,
        enrichment, ai_qualification_score, ai_qualification_reason,
        notes, assigned_to, tags, custom_fields, last_contacted_at,
        created_at, updated_at,
        assignee:profiles!crm_leads_assigned_to_fkey (id, name, avatar_url, email)
      `)
      .eq("id", id)
      .single()

    if (error || !lead) {
      throw new AppError("Lead nao encontrado", 404, "not-found")
    }

    const { data: activities } = await admin
      .from("crm_deal_activities")
      .select(`
        id, type, content, metadata, due_at, completed_at, is_internal, created_at,
        creator:profiles!crm_deal_activities_created_by_fkey (id, name, avatar_url)
      `)
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(100)

    return successResponse(request, { lead, activities: activities || [] })
  } catch (error) {
    log.error("Lead detail error:", error)
    return errorResponse(request, error, "crm-lead-detail")
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(240).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  status: z.enum(["new", "qualified", "unqualified", "converted", "lost"]).optional(),
  notes: z.string().nullable().optional(),
  assigned_to: uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  ai_qualification_score: z.number().int().min(0).max(100).nullable().optional(),
  ai_qualification_reason: z.string().nullable().optional(),
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

    const { error } = await admin
      .from("crm_leads")
      .update(parsed)
      .eq("id", id)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Lead patch error:", error)
    return errorResponse(request, error, "crm-lead-patch")
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
      .from("crm_leads")
      .update({ status: "lost" })
      .eq("id", id)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Lead delete error:", error)
    return errorResponse(request, error, "crm-lead-delete")
  }
}
