/**
 * GET /api/admin/campaign-central/production/[id]/preview?store_id=...
 *
 * Retorna o HTML real (pipeline AE) de UMA loja da campanha em produção
 * (pipeline item [id]). CONSOME — nunca enfileira/dispara o pipeline.
 *
 * O vínculo loja → HTML é o campo opcional `email_flow_email_id` no JSONB
 * target_stores, hoje SEMPRE vazio (será populado pelo "email-espelho"
 * futuro). Sem vínculo, ou email não-'ready', a resposta vem com
 * `available=false` e o workspace cai no fallback gracioso.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { getProductionStorePreview } from "@/lib/services/campaign-central/production.service"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const storeId = request.nextUrl.searchParams.get("store_id")
    if (!storeId) {
      return errorResponse(
        request,
        new Error("store_id é obrigatório"),
        "production:preview",
      )
    }

    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "production:preview")

    const preview = await getProductionStorePreview({
      orgId: ctx.orgId,
      itemId: id,
      storeId,
    })

    return successResponse(request, { preview })
  } catch (error) {
    return errorResponse(request, error, "production:preview")
  }
}
