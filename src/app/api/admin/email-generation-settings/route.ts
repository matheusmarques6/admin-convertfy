import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("EmailGenerationSettings")

export const dynamic = "force-dynamic"

/**
 * A org NÃO vem do cliente.
 *
 * A tela mandava um `org_id` constante e sintético
 * (`00000000-…-0001`) enquanto o pipeline lê a settings pela org REAL da
 * loja (`client_stores.org_id`). Resultado: tudo que era salvo aqui —
 * blueprint_mode, merge_verifier_mode, max_blocks_per_email, default_model,
 * qa_vision_enabled, câmbio, alerta de custo — ia para uma linha que
 * ninguém lia. A tabela vazia era a prova. Resolver no servidor, pelo
 * usuário autenticado, também impede gravar settings de outra org.
 */
const patchSchema = z.object({
  auto_trigger: z.boolean().optional(),
  max_parallel: z.number().int().min(1).max(10).optional(),
  generate_images: z.boolean().optional(),
  notify_on_error: z.boolean().optional(),
  notify_on_success: z.boolean().optional(),
  notify_emails: z.array(z.string().email()).optional(),
  // Parâmetros globais do pipeline (migration 20261005)
  qa_vision_enabled: z.boolean().nullable().optional(),
  refiner_enabled: z.boolean().optional(),
  max_blocks_per_email: z.number().int().min(3).max(15).optional(),
  default_model: z.string().min(1).nullable().optional(),
  usd_brl_rate: z.number().positive().max(100).nullable().optional(),
  cost_alert_usd: z.number().positive().max(1000).nullable().optional(),
  blueprint_mode: z.enum(["auto", "llm", "deterministic"]).optional(),
  // Verificador de merge (7b, migration 20261043): on_flag = só quando o
  // relatório do copy_merge acusa algo; always = toda geração; off = fila
  // mecânica (kill-switch sem deploy).
  merge_verifier_mode: z.enum(["always", "on_flag", "off"]).optional(),
  // Estruturador (fase 2): off = nem roda; shadow = roda e grava o
  // embasamento sem alterar o pipeline; on = consumo (fase 3).
  estruturador_mode: z.enum(["off", "shadow", "on"]).optional(),
  // Montador (migration 20261107): off = rank 1 do Curador vai direto para
  // a montagem; on = o agente escolhe entre os finalistas.
  montador_mode: z.enum(["off", "on"]).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const orgId = await resolveOrgId(user.id)

    const { data, error } = await admin
      .from("email_generation_settings")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle()

    if (error) throw error

    return successResponse(request, { settings: data })
  } catch (error) {
    log.error("GenerationSettings GET error:", error)
    return errorResponse(request, error, "gen-settings-get")
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const body = await request.json()
    const fields = patchSchema.parse(body)
    const orgId = await resolveOrgId(user.id)

    const { data, error } = await admin
      .from("email_generation_settings")
      .upsert(
        {
          org_id: orgId,
          ...fields,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: "org_id" },
      )
      .select("*")
      .single()

    if (error) throw error

    return successResponse(request, { settings: data })
  } catch (error) {
    log.error("GenerationSettings PATCH error:", error)
    return errorResponse(request, error, "gen-settings-patch")
  }
}
