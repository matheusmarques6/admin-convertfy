/**
 * POST /api/admin/agents/prompts/[id]/rollback
 *
 * Reativa uma versão antiga (do mesmo agent_type) usando `to_version`.
 * 404 se a versão alvo não existe; 409 se já é a ativa.
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
  rollbackToVersion,
} from "@/lib/services/prompt-management.service"

const log = logger.child("AgentsPromptsRollback")

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  to_version: z.number().int().positive(),
})

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

    const body = await request.json()
    const { to_version } = bodySchema.parse(body)

    const result = await rollbackToVersion(id, to_version, user.id)
    return successResponse(request, result)
  } catch (error) {
    log.error("rollback prompt error", error)
    return errorResponse(request, error, "agents-prompts-rollback")
  }
}
