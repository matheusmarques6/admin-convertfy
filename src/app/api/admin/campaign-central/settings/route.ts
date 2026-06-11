/**
 * GET  /api/admin/campaign-central/settings  → settings da org corrente
 * PUT  /api/admin/campaign-central/settings  → atualiza (upsert)
 *
 * Settings ficam em campaign_central_settings; defaults vivem em
 * settings.service.ts (espelho das constantes históricas dos services).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  parseAndValidate,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { getSettings, updateSettings } from "@/lib/services/campaign-central/settings.service"

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  date_window_days: z.number().int().min(7).max(90).optional(),
  max_trends_per_cluster: z.number().int().min(1).max(12).optional(),
  max_web_searches_per_cluster: z.number().int().min(1).max(10).optional(),
  max_stores_per_cluster: z.number().int().min(2).max(12).optional(),
  max_concurrent_clusters: z.number().int().min(1).max(5).optional(),
  benchmark_min_recipients: z.number().int().min(0).optional(),
  benchmark_top_n: z.number().int().min(3).max(20).optional(),
  health_critical_threshold: z.number().int().min(0).max(100).optional(),
  health_warn_threshold: z.number().int().min(0).max(100).optional(),
  revenue_drop_pct: z.number().int().min(-90).max(0).optional(),
  auto_cycle_enabled: z.boolean().optional(),
  trends_enabled: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "cc-settings:get")

    const settings = await getSettings(ctx.orgId)
    return successResponse(request, { settings })
  } catch (error) {
    return errorResponse(request, error, "cc-settings:get")
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "cc-settings:put")

    const patch = await parseAndValidate(request, patchSchema)

    // Validação cruzada: warn > critical
    if (
      patch.health_warn_threshold !== undefined &&
      patch.health_critical_threshold !== undefined &&
      patch.health_warn_threshold < patch.health_critical_threshold
    ) {
      return errorResponse(
        request,
        new Error("health_warn_threshold deve ser >= health_critical_threshold"),
        "cc-settings:put",
      )
    }

    const settings = await updateSettings({
      orgId: ctx.orgId,
      userId: user.id,
      patch,
    })
    return successResponse(request, { settings })
  } catch (error) {
    return errorResponse(request, error, "cc-settings:put")
  }
}
