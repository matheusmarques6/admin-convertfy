/**
 * POST  /api/admin/stores/[id]/briefing
 *   Cria a primeira versão de briefing (manual ou via IA).
 *
 * PATCH /api/admin/stores/[id]/briefing
 *   Atualiza o briefing atual (cria nova versão se source !== 'edited').
 *   Aceita patches parciais em marca / briefing.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("StoreBriefing")

export const dynamic = "force-dynamic"

const writeSchema = z.object({
  raw_input: z.record(z.string(), z.unknown()).optional().nullable(),
  marca: z.record(z.string(), z.unknown()).optional(),
  briefing: z.record(z.string(), z.unknown()).optional(),
  source: z
    .enum(["ai_treatment", "manual", "edited"])
    .optional()
    .default("edited"),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = writeSchema.parse(body)

    // Pega a ultima versão pra incrementar
    const { data: last } = await admin
      .from("store_briefings")
      .select("version")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = (last?.version ?? 0) + 1

    const { data, error } = await admin
      .from("store_briefings")
      .insert({
        store_id: storeId,
        version: nextVersion,
        raw_input: parsed.raw_input ?? null,
        marca: parsed.marca ?? {},
        briefing: parsed.briefing ?? {},
        source: parsed.source,
        created_by: user.id,
      })
      .select("*")
      .single()

    if (error) throw error
    return successResponse(request, { briefing: data })
  } catch (error) {
    log.error("Briefing POST error:", error)
    return errorResponse(request, error, "briefing-post")
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = writeSchema.parse(body)

    // Pega versão atual + cria nova com merge
    const { data: current } = await admin
      .from("store_briefings")
      .select("version, marca, briefing, raw_input")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = (current?.version ?? 0) + 1

    const { data, error } = await admin
      .from("store_briefings")
      .insert({
        store_id: storeId,
        version: nextVersion,
        raw_input: parsed.raw_input ?? current?.raw_input ?? null,
        marca: parsed.marca ?? current?.marca ?? {},
        briefing: parsed.briefing ?? current?.briefing ?? {},
        source: parsed.source,
        created_by: user.id,
      })
      .select("*")
      .single()

    if (error) throw error
    return successResponse(request, { briefing: data })
  } catch (error) {
    log.error("Briefing PATCH error:", error)
    return errorResponse(request, error, "briefing-patch")
  }
}
