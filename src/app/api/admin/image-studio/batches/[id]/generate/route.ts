/**
 * POST /api/admin/image-studio/batches/[id]/generate
 *
 * Gera o lote (loja × variação). Aceita `store_ids` opcional — subset da
 * seleção do lote, usado pelo frontend para FATIAR lotes grandes em várias
 * chamadas (proteção contra o teto de 300s da função serverless).
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
import { generateBatch } from "@/lib/services/image-studio.service"

export const dynamic = "force-dynamic"
// Pool 3 × ~15-60s por imagem — lote/chunk grande leva minutos.
export const maxDuration = 300

const bodySchema = z
  .object({ store_ids: z.array(z.string().uuid()).max(500).optional() })
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
    const batch = await generateBatch(id, orgId, body.store_ids)
    return successResponse(request, { batch })
  } catch (error) {
    return errorResponse(request, error, "ImageStudioGenerate")
  }
}
