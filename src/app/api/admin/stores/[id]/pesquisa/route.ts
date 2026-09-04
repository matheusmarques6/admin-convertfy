/**
 * DELETE /api/admin/stores/[id]/pesquisa
 *
 * Exclui a Pesquisa & Diagnóstico da loja DE VERDADE: zera os 5 pilares
 * (marca, loja, ICP, tom, ads) nas colunas de `client_stores`.
 *
 * Antes deste endpoint não existia exclusão — a pesquisa "excluída" na
 * cabeça do time continuava viva nas colunas e era reenviada em todo
 * webhook (briefing, copy), reproduzindo conteúdo contaminado (ex.:
 * pesquisa de OUTRA loja gravada pelo n8n no store_id errado).
 *
 * Não toca em `onboardings.briefing` (snapshot) — depois de limpar,
 * regenerar o briefing (agora com fresh_start) parte do link/loja.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  NotFoundError,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("StorePesquisaDelete")

export const dynamic = "force-dynamic"

/** Todas as colunas do documento Pesquisa & Diagnóstico. */
const PESQUISA_COLUMNS = [
  // 1. Perfil da Marca
  "brand_thesis",
  "brand_about",
  "brand_pillars",
  "brand_presence",
  // 2. Sobre a loja
  "store_story",
  "store_milestones",
  // 3. Cliente Ideal (+ blocos analíticos)
  "icp_persona",
  "icp_demographics",
  "icp_day_in_life",
  "icp_motivations",
  "icp_frictions",
  "icp_awareness",
  "icp_starving_crowd",
  "icp_unique_mechanism",
  "icp_objections",
  "icp_vocabulary",
  // Catálogo de argumento (Catalogador v2, set/2026) — a projeção é icp_objections.
  "objection_catalog",
  "objection_catalog_source",
  "objection_catalog_updated_at",
  // 4. Tom de Comunicação
  "tone_description",
  "tone_do",
  "tone_dont",
  "tone_use_words",
  "tone_avoid_words",
  // 5. Review dos Anúncios
  "ads_score",
  "ads_summary",
  "ads_sub_scores",
  "ads_strengths",
  "ads_opportunities",
  "ads_risks",
  "ads_reviewed_at",
] as const

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: store } = await admin
      .from("client_stores")
      .select("id, store_name")
      .eq("id", storeId)
      .maybeSingle()
    if (!store) throw new NotFoundError("Loja")

    const clear: Record<string, null> = {}
    for (const col of PESQUISA_COLUMNS) clear[col] = null

    const { error } = await admin
      .from("client_stores")
      .update(clear)
      .eq("id", storeId)
    if (error) throw error

    log.info("pesquisa.cleared", {
      storeId,
      storeName: (store as { store_name?: string }).store_name,
      by: user.id,
      columns: PESQUISA_COLUMNS.length,
    })

    return successResponse(request, {
      cleared: true,
      columns: PESQUISA_COLUMNS.length,
    })
  } catch (error) {
    log.error("DELETE pesquisa error", error)
    return errorResponse(request, error, "store-pesquisa-delete")
  }
}
