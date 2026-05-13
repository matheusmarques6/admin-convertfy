import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { requestBriefingRevision } from "@/lib/services/onboarding-pipeline.service"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const body = await request.json()
    if (!body.justification || body.justification.length < 10) {
      throw new AppError("justificativa obrigatoria (>=10 chars)", 400)
    }
    const result = await requestBriefingRevision(id, body.justification, user.id)
    if (!result.ok) throw new AppError("Falha", 400)
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "request-briefing-revision")
  }
}
