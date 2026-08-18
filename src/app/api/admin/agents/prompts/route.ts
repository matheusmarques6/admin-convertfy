/**
 * Prompts versionados (AE-8) — GET (lista) + POST (cria nova versão).
 *
 * Convive em paralelo com `/api/admin/email-agent-configs` (legacy).
 * Ambos os endpoints terminam chamando `prompt-management.service.ts`.
 */
import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  ForbiddenError,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import {
  canManagePrompts,
  createPromptVersion,
  listPrompts,
} from "@/lib/services/prompt-management.service"
import type { AgentType } from "@/types/email-generation"

const log = logger.child("AgentsPromptsRoute")

export const dynamic = "force-dynamic"

async function authorize(supabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, tags")
    .eq("id", userId)
    .maybeSingle()
  const actor = {
    id: userId,
    role: (profile as { role?: string | null } | null)?.role ?? null,
    tags: ((profile as { tags?: string[] } | null)?.tags ?? []) as string[],
  }
  if (!canManagePrompts(actor)) throw new ForbiddenError()
  return actor
}

const postSchema = z.object({
  // Cobre também os agentes da cadeia de formatação (split do HTML,
  // migration 20261039) — sem eles o Estúdio de Agentes não salva a
  // config de hero/text/image/color/merge_verifier.
  agent_type: z.enum(["copy", "image", "html", "qa", "blueprint", "assembler", "assembler_chooser", "campaign_suggestion", "campaign_trends", "campaign_architect", "campaign_image", "refiner", "component_test", "subject", "hero_section", "text_format", "image_format", "color_format", "component_tagger", "merge_verifier"]),
  model: z.string().min(3),
  system_prompt: z.string().min(10).max(20000),
  user_template: z.string().min(10).max(20000),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().int().min(100).max(8000).default(2048),
  output_schema: z.unknown().nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await authorize(admin, user.id)

    const at = request.nextUrl.searchParams.get("agent_type") as AgentType | null
    const result = await listPrompts({
      agentType: at ?? undefined,
      truncatePreview: true,
    })
    return successResponse(request, result)
  } catch (error) {
    log.error("GET prompts error", error)
    return errorResponse(request, error, "agents-prompts-get")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await authorize(admin, user.id)

    const body = await request.json()
    const parsed = postSchema.parse(body)

    const created = await createPromptVersion({
      agentType: parsed.agent_type,
      model: parsed.model,
      systemPrompt: parsed.system_prompt,
      userTemplate: parsed.user_template,
      temperature: parsed.temperature,
      maxTokens: parsed.max_tokens,
      outputSchema: parsed.output_schema ?? null,
      createdBy: user.id,
    })

    return successResponse(request, { prompt: created }, { status: 201 })
  } catch (error) {
    log.error("POST prompts error", error)
    return errorResponse(request, error, "agents-prompts-post")
  }
}
