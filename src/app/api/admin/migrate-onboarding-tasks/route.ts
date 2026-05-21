/**
 * POST /api/admin/migrate-onboarding-tasks
 *
 * Migra tasks legadas de onboardings em progresso pra incluir sub_items
 * no metadata (necessario pra Etapa 05 mostrar checklist de emails).
 *
 * Aditivo e idempotente: nao apaga nem altera tasks existentes alem de
 * preencher metadata.sub_items quando o template tem sub_items mas a
 * task ainda nao. Owner/manager only.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { requireOnboardingPermission } from "@/lib/api/onboarding-permissions"
import { migrateLegacyTasksAddSubItems } from "@/lib/services/onboarding-tasks-migration.service"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    await requireOnboardingPermission(user.id, "admin")
    const result = await migrateLegacyTasksAddSubItems()
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "migrate-onboarding-tasks")
  }
}
