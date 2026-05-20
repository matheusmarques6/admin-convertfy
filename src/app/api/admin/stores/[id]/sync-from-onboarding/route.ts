import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import {
  onboardingMirrorService,
  type MirrorMode,
} from "@/lib/services/onboarding-mirror.service"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/stores/[id]/sync-from-onboarding
 *
 * Força o espelhamento de `onboardings.form_responses` (com fallback em
 * `store_onboarding_data`) para `client_stores.*` e `store_brand_identity`.
 *
 * Como a chamada é manual pelo admin (botão "Sincronizar do formulário"),
 * o default é `mode=overwrite`: substitui valores divergentes em
 * client_stores e cria nova versão de store_brand_identity quando a URL
 * da logo no form é diferente. Aceita `mode=fill-empty` no body para o
 * comportamento conservador antigo.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    await requireAuth(sb)

    let mode: MirrorMode = "overwrite"
    try {
      const body = (await request.json()) as { mode?: MirrorMode } | null
      if (body?.mode === "fill-empty" || body?.mode === "overwrite") {
        mode = body.mode
      }
    } catch {
      // sem body / json inválido — usa default
    }

    const result = await onboardingMirrorService.syncStoreFromOnboarding(
      storeId,
      { mode },
    )
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "store-sync-from-onboarding")
  }
}
