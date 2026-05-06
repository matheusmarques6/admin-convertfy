/**
 * GET    /api/crm/ai-actions/[id]
 * PATCH  /api/crm/ai-actions/[id]   (incrementa version se prompts/schema mudaram)
 * DELETE /api/crm/ai-actions/[id]   (soft is_active=false)
 *
 * Tambem expoe ultimas execucoes em GET (audit + telemetria).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"

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

    const { data: action, error } = await admin
      .from("crm_ai_actions")
      .select("id, name, description, version, is_active, model, max_tokens, temperature, use_case, system_prompt, user_prompt_template, output_schema, created_at, updated_at")
      .eq("id", id)
      .single()

    if (error || !action) {
      return errorResponse(request, new Error("AI action nao encontrada"), "not-found", 404)
    }

    const { data: runs } = await admin
      .from("crm_ai_action_runs")
      .select("id, status, tokens_input, tokens_output, cost_cents, duration_ms, error_message, created_at")
      .eq("ai_action_id", id)
      .order("created_at", { ascending: false })
      .limit(50)

    return successResponse(request, { ai_action: action, runs: runs || [] })
  } catch (error) {
    return errorResponse(request, error, "crm-ai-action-detail")
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(240).optional(),
  description: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  model: z.string().optional(),
  max_tokens: z.number().int().min(1).max(8192).optional(),
  temperature: z.number().min(0).max(2).optional(),
  system_prompt: z.string().min(1).optional(),
  user_prompt_template: z.string().min(1).optional(),
  output_schema: z.record(z.unknown()).optional(),
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

    const update: Record<string, unknown> = { ...parsed }

    // Se prompt/schema mudou, incrementa version
    if (parsed.system_prompt || parsed.user_prompt_template || parsed.output_schema) {
      const { data: current } = await admin
        .from("crm_ai_actions")
        .select("version")
        .eq("id", id)
        .single()
      update.version = (current?.version || 1) + 1
    }

    const { error } = await admin.from("crm_ai_actions").update(update).eq("id", id)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "crm-ai-action-patch")
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
    const { error } = await admin.from("crm_ai_actions").update({ is_active: false }).eq("id", id)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "crm-ai-action-delete")
  }
}
