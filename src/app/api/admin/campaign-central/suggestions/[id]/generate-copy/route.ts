/**
 * POST /api/admin/campaign-central/suggestions/[id]/generate-copy
 *
 * Body: { mode: 'test'|'production', store_ids: string[] }
 *
 * Dispara geração de copy via n8n: marca lojas-alvo como pending em
 * copy_results[mode], cria job de rastreio e envia webhook fire-and-forget.
 * Retorna 202 com { job_id, stores_count } — UI faz polling em
 * copy_results[mode][store_id].status pra atualizar incremental.
 *
 * Fallback (F3): watchdog promove jobs travados pra inline. Sem URL
 * configurada, o job é criado em status='failed' e o watchdog roda
 * generateCampaignCopy() inline no próximo tick.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  parseAndValidate,
  requireAuth,
  successResponse,
  AppError,
} from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { generateCopySchema } from "@/lib/validations/campaign-central"
import { dispatchCampaignCopyToN8n } from "@/lib/services/campaign-central/campaign-copy-dispatch.service"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "generate-copy")

    const body = await parseAndValidate(request, generateCopySchema)

    const result = await dispatchCampaignCopyToN8n({
      suggestionId: id,
      orgId: ctx.orgId,
      mode: body.mode,
      storeIds: body.store_ids,
      triggeredBy: user.id,
    })

    if (!result.ok && !result.job_id) {
      // Falha pré-dispatch (suggestion not found, missing master, no stores)
      const reasonMsg: Record<string, string> = {
        suggestion_not_found: "Sugestão não encontrada",
        missing_master_copy:
          "Esta campanha ainda não tem copy master. Gere a master primeiro no construtor de email.",
        no_valid_stores: "Nenhuma loja válida na lista",
        suggestion_query_failed: "Erro ao carregar sugestão",
        stores_query_failed: "Erro ao carregar lojas",
        suggestion_update_failed: "Erro ao marcar lojas como pending",
        job_insert_failed: "Erro ao criar job de rastreio",
      }
      throw new AppError(reasonMsg[result.reason ?? ""] ?? "Falha ao iniciar dispatch", 400)
    }

    // 202 — n8n vai responder via callback streaming por loja.
    return successResponse(
      request,
      {
        ok: result.ok,
        job_id: result.job_id,
        stores_count: result.stores_count,
        reason: result.reason,
      },
      { status: 202 },
    )
  } catch (error) {
    return errorResponse(request, error, "generate-copy")
  }
}
