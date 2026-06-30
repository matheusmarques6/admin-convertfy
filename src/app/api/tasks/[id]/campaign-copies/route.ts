/**
 * GET   /api/tasks/[id]/campaign-copies  — copies (produção) por loja da campanha
 * PATCH /api/tasks/[id]/campaign-copies  — { store_id } grava a loja base (designer)
 *
 * Alimenta o painel "Copy da campanha (Handoff)" dentro da task de design.
 * Acesso é o da PRÓPRIA task (requireTaskAccess) — o designer não precisa do
 * endpoint do COO. Só vale pra task de campanha (source_type='campaign_suggestion').
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import {
  AppError,
  errorResponse,
  parseAndValidate,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import {
  getCampaignHandoff,
  setHandoffPilot,
} from "@/lib/services/campaign-central/campaign-handoff.service"

export const dynamic = "force-dynamic"

const pilotSchema = z.object({ store_id: z.string().uuid() })

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await requireTaskAccess(user.id, id, "read")

    const { source_type, source_id } = ctx.task
    if (source_type !== "campaign_suggestion" || !source_id) {
      throw new AppError("Task não é de campanha", 400)
    }

    const payload = await getCampaignHandoff(source_id, ctx.member.orgId)
    return successResponse(request, payload)
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-copies")
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await requireTaskAccess(user.id, id, "work")

    const { source_type, source_id } = ctx.task
    if (source_type !== "campaign_suggestion" || !source_id) {
      throw new AppError("Task não é de campanha", 400)
    }

    const body = await parseAndValidate(request, pilotSchema)
    const result = await setHandoffPilot(source_id, ctx.member.orgId, body.store_id)
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-copies")
  }
}
