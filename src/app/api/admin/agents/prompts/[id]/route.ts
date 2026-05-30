/**
 * GET detalhe completo (sem truncate) de uma versão de prompt.
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
  canManagePrompts,
  getPromptDetail,
} from "@/lib/services/prompt-management.service"

const log = logger.child("AgentsPromptsDetailRoute")

export const dynamic = "force-dynamic"

export async function GET(
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

    const prompt = await getPromptDetail(id)
    return successResponse(request, { prompt })
  } catch (error) {
    log.error("GET prompt detail error", error)
    return errorResponse(request, error, "agents-prompts-detail")
  }
}
