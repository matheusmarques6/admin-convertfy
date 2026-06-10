/**
 * GET/PUT /api/settings/implementation-flow
 *
 * Config global do "Setup de Implementação" por flow type (Gatilho, Público,
 * Evento, UTM). Persistido na tabela global `settings` (key
 * `implementation_flow_setup`, value JSONB de overrides). GET devolve o efetivo
 * (override sobre os defaults de flow-meta/utm). PUT (admin) salva os overrides.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireOnboardingPermission } from "@/lib/api/onboarding-permissions"
import { logger } from "@/lib/logger"
import type { FlowType } from "@/types/email-workspace"
import { IMPLEMENTATION_FLOW_TYPES } from "@/lib/email-workspace/implementation/flow-meta"
import {
  FLOW_SETUP_SETTINGS_KEY,
  resolveFlowSetup,
  type FlowSetupOverrides,
} from "@/lib/email-workspace/implementation/flow-settings"

const log = logger.child("ImplementationFlowSettings")

export const dynamic = "force-dynamic"

const fieldSchema = z.object({
  trigger: z.string().max(280),
  audience: z.string().max(280),
  metricEvent: z.string().max(120),
  utmSource: z.string().max(80),
  utmMedium: z.string().max(80),
  utmCampaign: z.string().max(120),
})

const putSchema = z.object({
  flows: z.record(z.string(), fieldSchema),
})

async function readOverrides(
  admin: ReturnType<typeof createAdminClient>,
): Promise<FlowSetupOverrides> {
  const { data } = await admin
    .from("settings")
    .select("value")
    .eq("key", FLOW_SETUP_SETTINGS_KEY)
    .maybeSingle()
  return ((data?.value as FlowSetupOverrides) ?? {}) as FlowSetupOverrides
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)
    const admin = createAdminClient()
    const overrides = await readOverrides(admin)
    return successResponse(request, { flows: resolveFlowSetup(overrides) })
  } catch (error) {
    return errorResponse(request, error, "implementation-flow-get")
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireOnboardingPermission(user.id, "admin")

    const parsed = putSchema.safeParse(await request.json())
    if (!parsed.success) {
      throw new AppError("Dados inválidos", 400)
    }

    // Só persiste flow types conhecidos (ignora chaves estranhas).
    const allowed = new Set<string>(IMPLEMENTATION_FLOW_TYPES as string[])
    const overrides: FlowSetupOverrides = {}
    for (const [ft, cfg] of Object.entries(parsed.data.flows)) {
      if (allowed.has(ft)) overrides[ft as FlowType] = cfg
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from("settings")
      .upsert(
        { key: FLOW_SETUP_SETTINGS_KEY, value: overrides, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      )
    if (error) {
      log.error("upsert settings falhou", { code: error.code, msg: error.message })
      throw new AppError("Erro ao salvar configuração", 500)
    }

    return successResponse(request, { flows: resolveFlowSetup(overrides) })
  } catch (error) {
    return errorResponse(request, error, "implementation-flow-put")
  }
}
