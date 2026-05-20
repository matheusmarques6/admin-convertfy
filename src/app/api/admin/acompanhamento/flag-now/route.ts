/**
 * POST /api/admin/acompanhamento/flag-now
 *   Roda manualmente a logica de flagging que o cron domingo 22h UTC
 *   executa. Util para:
 *    - Adiantar a populacao do pipeline antes do cron
 *    - Demo / testes com lojas reais
 *    - Re-flag depois de mudancas no banco (ex: novas weekly_reports)
 *
 *   Body opcional:
 *    - week (YYYY-MM-DD): semana alvo. Default: segunda da semana corrente.
 *    - force (boolean): se true, flag TODAS as lojas mesmo healthy.
 *
 *   Limita ao org do usuario autenticado.
 */

import { NextRequest } from "next/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { flagStoresForWeek } from "@/lib/services/acompanhamento-flagging.service"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const admin = createAdminClient()
    const { data: member } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!member) throw new AppError("Usuário sem organização ativa", 403)

    const body = (await request.json().catch(() => ({}))) as {
      week?: string
      force?: boolean
    }

    const result = await flagStoresForWeek({
      admin,
      week: body.week,
      orgId: member.org_id as string,
      force: body.force === true,
    })

    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "AcompanhamentoFlagNow")
  }
}
