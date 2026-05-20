import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { onboardingMirrorService } from "@/lib/services/onboarding-mirror.service"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/stores/[id]/sync-from-onboarding
 *
 * Força o espelhamento de `onboardings.form_responses` + `store_onboarding_data`
 * para `client_stores.*` e `store_brand_identity`. Só preenche colunas vazias —
 * edições manuais nunca são sobrescritas.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    await requireAuth(sb)

    const result = await onboardingMirrorService.syncStoreFromOnboarding(storeId)
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "store-sync-from-onboarding")
  }
}
