/**
 * POST /api/admin/agents/prompts/[id]/activate
 *
 * Ativa a versão de prompt. Idempotente: se já ativa, retorna 200 sem
 * mudanças. Transição é "atômica" via 2 UPDATEs em sequência, protegidos
 * pelo unique index parcial `idx_agent_config_active`.
 */
import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  ForbiddenError,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import {
  activatePrompt,
  canManagePrompts,
} from "@/lib/services/prompt-management.service"

const log = logger.child("AgentsPromptsActivate")

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from("profiles")
      .select("role, tags")
      .eq("id", user.id)
      .maybeSingle()
    const actor = {
      id: user.id,
      role: (profile as { role?: string | null } | null)?.role ?? null,
      tags: ((profile as { tags?: string[] } | null)?.tags ?? []) as string[],
    }
    if (!canManagePrompts(actor)) throw new ForbiddenError()

    const result = await activatePrompt(id, user.id)
    return successResponse(request, {
      prompt: result.activated,
      was_already_active: result.was_already_active,
      deactivated_version: result.deactivated_version,
    })
  } catch (error) {
    log.error("activate prompt error", error)
    return errorResponse(request, error, "agents-prompts-activate")
  }
}
