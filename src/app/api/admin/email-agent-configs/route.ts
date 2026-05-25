import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailAgentConfigs")

export const dynamic = "force-dynamic"

const postSchema = z.object({
  agent_type: z.enum(["copy", "image", "html"]),
  model: z.string().min(1).default("claude-sonnet-4-6"),
  system_prompt: z.string().min(1),
  user_template: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().int().min(100).max(16384).default(2048),
  output_schema: z.record(z.string(), z.unknown()).nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const agentType = request.nextUrl.searchParams.get("agent_type")
    const activeOnly = request.nextUrl.searchParams.get("active_only") !== "false"

    let query = admin
      .from("email_agent_configs")
      .select("*")
      .order("agent_type")
      .order("version", { ascending: false })

    if (agentType) {
      query = query.eq("agent_type", agentType)
    }

    if (activeOnly) {
      query = query.eq("is_active", true)
    }

    const { data, error } = await query

    if (error) throw error

    return successResponse(request, { configs: data ?? [] })
  } catch (error) {
    log.error("AgentConfigs GET error:", error)
    return errorResponse(request, error, "agent-configs-get")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = postSchema.parse(body)

    const { data, error } = await admin
      .from("email_agent_configs")
      .insert({
        ...parsed,
        version: 1,
        is_active: true,
        created_by: user.id,
      })
      .select("*")
      .single()

    if (error) throw error

    return successResponse(request, { config: data }, { status: 201 })
  } catch (error) {
    log.error("AgentConfig POST error:", error)
    return errorResponse(request, error, "agent-config-post")
  }
}
