/**
 * POST /api/admin/resync-pipeline-templates
 *
 * Re-sincroniza checklist_template/deliverables_template/automation_rules
 * das colunas do pipeline de onboarding pra todas as orgs com onboarding
 * ativo. Nao destrutivo: nao mexe em tasks instanciadas. Owner/manager only.
 *
 * Use quando voce alterou o SEED_COLUMNS e precisa que onboardings em
 * progresso vejam o template novo (allow_other, options, etc) sem
 * reconciliar tasks.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { requireOnboardingPermission } from "@/lib/api/onboarding-permissions"
import { resyncAllPipelineTemplates } from "@/lib/services/onboarding-templates-resync.service"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    await requireOnboardingPermission(user.id, "admin")
    const result = await resyncAllPipelineTemplates()
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "resync-pipeline-templates")
  }
}
