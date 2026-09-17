/**
 * GET /api/admin/emails/[emailId]/conformidade
 *
 * Decisão × entregue de um e-mail (B6): por posição, o que o Estruturador
 * pediu, o que o Curador escolheu, o que o blueprint gravou, o que a
 * montagem colocou e o que o bloco entregue carrega — mais as violações dos
 * validadores e o nó responsável pela primeira divergência.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { conformidadeDoEmail } from "@/lib/services/conformidade.service"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ emailId: string }> },
) {
  try {
    const { emailId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    await assertCanManagePrompts(createAdminClient(), user.id)
    return successResponse(request, await conformidadeDoEmail(emailId))
  } catch (error) {
    return errorResponse(request, error, "email-conformidade")
  }
}
