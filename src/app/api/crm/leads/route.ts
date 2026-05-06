/**
 * GET  /api/crm/leads      — lista com filtros
 * POST /api/crm/leads      — cria lead
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { dispatchTrigger } from "@/lib/services/crm-trigger-dispatcher.service"

const log = logger.child("CrmLeads")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const status = sp.get("status")
    const assigned_to = sp.get("assigned_to")
    const search = sp.get("search")
    const source = sp.get("source")
    const limit = Math.min(parseInt(sp.get("limit") || "100", 10), 500)
    const offset = parseInt(sp.get("offset") || "0", 10)

    let q = admin
      .from("crm_leads")
      .select(`
        id, name, email, phone, company, role, source, status,
        ai_qualification_score, assigned_to, tags, last_contacted_at, created_at, updated_at,
        assignee:profiles!crm_leads_assigned_to_fkey (id, name, avatar_url)
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) q = q.eq("status", status)
    if (assigned_to) q = q.eq("assigned_to", assigned_to)
    if (source) q = q.eq("source", source)
    if (search) {
      q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%,phone.ilike.%${search}%`)
    }

    const { data, error, count } = await q
    if (error) throw error

    return successResponse(request, { leads: data || [], total: count ?? 0 })
  } catch (error) {
    log.error("Leads GET error:", error)
    return errorResponse(request, error, "crm-leads-get")
  }
}

const createLeadSchema = z.object({
  name: z.string().min(1).max(240),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  utm: z.record(z.string(), z.unknown()).optional().default({}),
  notes: z.string().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = createLeadSchema.parse(body)

    const { data, error } = await admin
      .from("crm_leads")
      .insert({
        ...parsed,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (error) throw error

    log.info("[Leads] created", { id: data.id, name: parsed.name })

    // Dispara trigger lead_created
    const { data: userOrg } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    if (userOrg?.org_id) {
      dispatchTrigger({
        trigger_type: "lead_created",
        org_id: userOrg.org_id,
        trigger_data: { lead_id: data.id },
        context: {
          trigger_type: "lead_created",
          trigger_data: { lead_id: data.id },
          lead: { id: data.id, ...parsed },
          org_id: userOrg.org_id,
        },
        idempotency_key: `lead_created:${data.id}`,
      }).catch((err) => log.error("[Leads] dispatch error", err))
    }

    return successResponse(request, { id: data.id })
  } catch (error) {
    log.error("Leads POST error:", error)
    return errorResponse(request, error, "crm-leads-post")
  }
}
