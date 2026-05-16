/**
 * POST /api/webhooks/n8n/ads-analyzer/icp
 *
 * Callback do n8n com dados de demografia + inferências qualitativas do ICP.
 * Faz MERGE em icp_demographics (preserva chaves preexistentes) e UPDATE
 * direto nos demais campos.
 *
 * Auth: header x-secret == N8N_WEBHOOK_SECRET.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { errorResponse, successResponse, parseAndValidate } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

// Formato canônico esperado pelo UI (PesquisaSection):
//  - icp_persona  : { name, age, city, monogram }
//  - icp_demographics : { age_range, income, education, occupation, religion }
// O n8n deve produzir esses formatos. Campos individuais opcionais — o UI
// já lida com chaves faltantes mostrando "—".
const personaSchema = z.object({
  name: z.string().trim().min(1).max(120),
  age: z.string().trim().max(40).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  monogram: z.string().trim().max(4).optional().default(""),
})

const demographicsSchema = z.object({
  age_range: z.string().trim().max(60).optional().default(""),
  income: z.string().trim().max(120).optional().default(""),
  education: z.string().trim().max(120).optional().default(""),
  occupation: z.string().trim().max(160).optional().default(""),
  religion: z.string().trim().max(80).optional().default(""),
})

const schema = z.object({
  store_id: z.string().uuid(),
  persona: personaSchema.optional().nullable(),
  demographics: demographicsSchema.optional().nullable(),
  day_in_life: z.string().trim().optional().nullable(),
  motivations: z.array(z.string().trim().min(1)).max(20).optional().nullable(),
  frictions: z.array(z.string().trim().min(1)).max(20).optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request, "N8N_WEBHOOK_SECRET", "x-secret")
    const body = await parseAndValidate(request, schema)

    const admin = createAdminClient()

    // Merge demografia preservando chaves preexistentes (n8n pode só ter
    // alguns campos; o resto pode ter sido preenchido manualmente).
    let mergedDemographics: Record<string, unknown> | null = null
    if (body.demographics) {
      const { data: current } = await admin
        .from("client_stores")
        .select("icp_demographics")
        .eq("id", body.store_id)
        .single()
      const existing = (current?.icp_demographics ?? {}) as Record<string, unknown>
      const incoming: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(body.demographics)) {
        if (typeof v === "string" && v.length > 0) incoming[k] = v
      }
      mergedDemographics = { ...existing, ...incoming }
    }

    const update: Record<string, unknown> = {}
    if (mergedDemographics !== null) update.icp_demographics = mergedDemographics
    if (body.persona) {
      // Garante monogram não-vazio (UI usa pra avatar)
      const p = body.persona
      update.icp_persona = {
        name: p.name,
        age: p.age || "—",
        city: p.city || "—",
        monogram: p.monogram || p.name.slice(0, 2).toUpperCase(),
      }
    }
    if (body.day_in_life !== undefined && body.day_in_life !== null) {
      update.icp_day_in_life = body.day_in_life
    }
    if (body.motivations) update.icp_motivations = body.motivations
    if (body.frictions) update.icp_frictions = body.frictions

    if (Object.keys(update).length === 0) {
      return successResponse(request, { store_id: body.store_id, updated: [] })
    }

    const { error } = await admin
      .from("client_stores")
      .update(update)
      .eq("id", body.store_id)

    if (error) throw error

    return successResponse(request, { store_id: body.store_id, updated: Object.keys(update) })
  } catch (error) {
    return errorResponse(request, error, "ads-analyzer/icp")
  }
}
