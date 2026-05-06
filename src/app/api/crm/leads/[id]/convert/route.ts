/**
 * POST /api/crm/leads/[id]/convert
 *
 * Converte um lead em deal (e opcionalmente em client). Se body inclui
 * `create_client=true`, cria entry em `clients` e linka via
 * `converted_to_client_id`. Sempre cria o deal e linka via
 * `converted_to_deal_id` + `crm_deals.lead_id`.
 *
 * Body:
 *   {
 *     pipeline_id: uuid,
 *     stage_id: uuid,
 *     value?: number,
 *     owner_id: uuid,
 *     create_client?: boolean,
 *     deal_title?: string,
 *   }
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmLeadConvert")

export const dynamic = "force-dynamic"

const convertSchema = z.object({
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  value: z.number().min(0).optional().default(0),
  owner_id: z.string().uuid(),
  create_client: z.boolean().optional().default(false),
  deal_title: z.string().min(1).optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = convertSchema.parse(body)

    // Le o lead
    const { data: lead, error: leadErr } = await admin
      .from("crm_leads")
      .select("id, name, email, phone, company, source, utm, tags, notes, status")
      .eq("id", id)
      .single()

    if (leadErr || !lead) {
      return errorResponse(request, new Error("Lead nao encontrado"), "not-found", 404)
    }
    if (lead.status === "converted") {
      return errorResponse(request, new Error("Lead ja convertido"), "already-converted", 409)
    }

    let client_id: string | null = null

    // Cria client se solicitado
    if (parsed.create_client) {
      const { data: existing } = await admin
        .from("clients")
        .select("id")
        .eq("email", lead.email)
        .maybeSingle()

      if (existing) {
        client_id = existing.id
      } else {
        const { data: newClient, error: cErr } = await admin
          .from("clients")
          .insert({
            name: lead.company || lead.name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            status: "prospect",
            tags: lead.tags || [],
          })
          .select("id")
          .single()
        if (cErr) throw cErr
        client_id = newClient.id
      }
    }

    // Cria deal
    const { data: maxPos } = await admin
      .from("deals")
      .select("position")
      .eq("stage_id", parsed.stage_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: deal, error: dErr } = await admin
      .from("deals")
      .insert({
        pipeline_id: parsed.pipeline_id,
        stage_id: parsed.stage_id,
        title: parsed.deal_title || lead.company || lead.name,
        value: parsed.value,
        currency: "BRL",
        probability: 50,
        client_id,
        lead_id: lead.id,
        source: lead.source,
        utm: lead.utm || {},
        tags: lead.tags || [],
        owner_id: parsed.owner_id,
        notes: lead.notes,
        position: (maxPos?.position ?? 0) + 10,
        status: "open",
      })
      .select("id")
      .single()

    if (dErr) throw dErr

    // Atualiza lead
    await admin
      .from("crm_leads")
      .update({
        status: "converted",
        converted_to_deal_id: deal.id,
        converted_to_client_id: client_id,
      })
      .eq("id", id)

    // Activity de conversao
    await admin.from("crm_deal_activities").insert({
      deal_id: deal.id,
      lead_id: lead.id,
      type: "system",
      content: `Lead "${lead.name}" convertido em deal`,
      created_by: parsed.owner_id,
      is_internal: true,
    })

    log.info("[Leads] converted", {
      lead_id: lead.id,
      deal_id: deal.id,
      client_id,
    })

    return successResponse(request, {
      deal_id: deal.id,
      client_id,
    })
  } catch (error) {
    log.error("Lead convert error:", error)
    return errorResponse(request, error, "crm-lead-convert")
  }
}
