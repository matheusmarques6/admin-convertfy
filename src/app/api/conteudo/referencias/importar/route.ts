/**
 * POST /api/conteudo/referencias/importar — { igMediaId } importa um
 * carrossel real: lê os slides na Graph API, guarda no Storage da org e
 * pede a transcrição à ConvertIA. Idempotente por post.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { importarDoInstagram } from "@/lib/services/conteudo-referencias.service"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const parsed = z.object({ igMediaId: z.string().uuid() }).safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Informe o post a importar.", 400)
    const ref = await importarDoInstagram(admin, orgId, user.id, parsed.data.igMediaId)
    return successResponse(request, { referencia: ref }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "conteudo-referencias-importar")
  }
}
