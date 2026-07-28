/**
 * POST /api/admin/image-studio/results/[id]
 *
 * Regera UM resultado (loja × variação), opcionalmente com nota de ajuste
 * ("Regerar com ajuste" / "Tentar de novo").
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import {
  errorResponse,
  parseAndValidate,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { handleCorsPreFlight } from "@/lib/cors"
import { regenerateResult } from "@/lib/services/image-studio.service"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const bodySchema = z
  .object({ adjustment_notes: z.string().max(2000).nullable().optional() })
  .strict()

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const body = await parseAndValidate(request, bodySchema)
    const result = await regenerateResult(id, orgId, body.adjustment_notes ?? null)
    return successResponse(request, { result })
  } catch (error) {
    return errorResponse(request, error, "ImageStudioRegenerate")
  }
}
