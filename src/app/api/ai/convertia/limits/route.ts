/**
 * GET /api/ai/convertia/limits — limite diário vigente da ConvertIA
 *      (settings.convertia_limits) + gasto de hoje do usuário.
 * PUT /api/ai/convertia/limits — {daily_user_cost_usd} altera o limite
 *      sem deploy (a rota do chat relê a cada 60 s por instância).
 *
 * Auth: mesmo gate do dashboard de Custo de IA (admin/owner OU tag 'dev').
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import {
  CONVERTIA_LIMITS_KEY,
  getConvertiaBudget,
  getConvertiaLimits,
  resetConvertiaLimitsCache,
} from "@/lib/ai/convertia-limits"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)
    const [limits, budget] = await Promise.all([getConvertiaLimits(), getConvertiaBudget(admin, user.id)])
    return successResponse(request, {
      daily_user_cost_cents: limits.daily_user_cost_cents,
      today_cost_cents: budget.today_cost_cents,
    })
  } catch (error) {
    return errorResponse(request, error, "convertia-limits-get")
  }
}

const putSchema = z.object({
  /** US$ por usuário por dia (0,50 a 10.000). */
  daily_user_cost_usd: z.number().min(0.5).max(10_000),
})

export async function PUT(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)
    const body = putSchema.parse(await request.json())
    const cents = Math.round(body.daily_user_cost_usd * 100)
    const { error } = await admin
      .from("settings")
      .upsert(
        { key: CONVERTIA_LIMITS_KEY, value: { daily_user_cost_cents: cents }, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      )
    if (error) throw error
    resetConvertiaLimitsCache()
    return successResponse(request, { daily_user_cost_cents: cents })
  } catch (error) {
    return errorResponse(request, error, "convertia-limits-put")
  }
}
