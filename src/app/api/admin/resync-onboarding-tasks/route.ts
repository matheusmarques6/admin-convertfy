/**
 * POST /api/admin/resync-onboarding-tasks
 *
 * Reconciliacao destrutiva de tasks legadas com o template atual de cada
 * coluna. DELETA tasks cujo slug sumiu do template (mesmo completed),
 * CRIA tasks faltantes, MANTEM as que existem em ambos. Owner/manager only.
 *
 * Use quando o SEED_COLUMNS foi alterado e voce quer que onboardings em
 * progresso recebam o template novo (versus o snapshot antigo).
 *
 * AVISO: destrutivo. Apaga task_deliverables linkados via FK cascade.
 * Rode em horario de baixa atividade.
 *
 * GET /api/admin/resync-onboarding-tasks  (read-only)
 * Auditoria do impacto destrutivo: lista as tasks que seriam deletadas e
 * quais tem deliverables com file_url (arquivos que o cascade apagaria).
 * Rode ANTES do POST pra decidir com seguranca.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { requireOnboardingPermission } from "@/lib/api/onboarding-permissions"
import {
  resyncAllOnboardingTasks,
  auditResyncImpact,
} from "@/lib/services/onboarding-tasks-resync.service"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    await requireOnboardingPermission(user.id, "admin")
    const result = await auditResyncImpact()
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "resync-onboarding-tasks-audit")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    await requireOnboardingPermission(user.id, "admin")
    const result = await resyncAllOnboardingTasks()
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "resync-onboarding-tasks")
  }
}
