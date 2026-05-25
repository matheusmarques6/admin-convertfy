import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailAgentConfig")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  model: z.string().min(1).optional(),
  system_prompt: z.string().min(1).optional(),
  user_template: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(100).max(16384).optional(),
  output_schema: z.record(z.string(), z.unknown()).nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    const { data: existing, error: fetchErr } = await admin
      .from("email_agent_configs")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchErr) throw fetchErr

    await admin
      .from("email_agent_configs")
      .update({ is_active: false })
      .eq("id", id)

    const { data: newConfig, error: insertErr } = await admin
      .from("email_agent_configs")
      .insert({
        agent_type: existing.agent_type,
        model: parsed.model ?? existing.model,
        system_prompt: parsed.system_prompt ?? existing.system_prompt,
        user_template: parsed.user_template ?? existing.user_template,
        temperature: parsed.temperature ?? existing.temperature,
        max_tokens: parsed.max_tokens ?? existing.max_tokens,
        output_schema: parsed.output_schema !== undefined ? parsed.output_schema : existing.output_schema,
        version: (existing.version as number) + 1,
        is_active: true,
        created_by: user.id,
      })
      .select("*")
      .single()

    if (insertErr) throw insertErr

    return successResponse(request, { config: newConfig })
  } catch (error) {
    log.error("AgentConfig PATCH error:", error)
    return errorResponse(request, error, "agent-config-patch")
  }
}
