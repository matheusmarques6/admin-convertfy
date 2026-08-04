/**
 * POST /api/crm/deals/[id]/duplicate
 *
 * Clona o negócio na MESMA etapa (padrão Pipedrive): título com
 * sufixo "(cópia)", campos comerciais, tags, custom_fields e os ITENS
 * de produto. Não copia: atividades/timeline (histórico é do original),
 * won/lost (a cópia nasce aberta) e conversas vinculadas.
 *
 * Caso de uso: renovação/upsell do mesmo cliente sem redigitar tudo.
 */

import { NextRequest } from "next/server"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmDealDuplicate")

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    uuid().parse(id)
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    // source_type/source_referrer não existem em todo ambiente — o
    // SELECT precisa do retry, senão o erro de coluna vira um falso
    // "Negócio não encontrado" e duplicar nunca funciona.
    let { data: source, error: srcErr } = await admin
      .from("deals")
      .select(
        `pipeline_id, stage_id, client_id, store_id, lead_id, title, value,
         currency, probability, expected_close_date, source, source_type,
         source_referrer, utm, tags, notes, custom_fields, referrer_partner_id`,
      )
      .eq("id", id)
      .maybeSingle()

    if (srcErr && /column .* does not exist|42703/i.test(`${srcErr.code} ${srcErr.message}`)) {
      const retry = await admin
        .from("deals")
        .select(
          `pipeline_id, stage_id, client_id, store_id, lead_id, title, value,
           currency, probability, expected_close_date, source, utm, tags,
           notes, custom_fields, referrer_partner_id`,
        )
        .eq("id", id)
        .maybeSingle()
      source = retry.data as typeof source
      srcErr = retry.error
    }
    if (srcErr) throw srcErr
    if (!source) throw new AppError("Negócio não encontrado", 404, "not-found")

    const { data: maxPos } = await admin
      .from("deals")
      .select("position")
      .eq("stage_id", source.stage_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()

    const insertPayload: Record<string, unknown> = {
      ...source,
      title: `${source.title} (cópia)`.slice(0, 240),
      status: "open",
      owner_id: user.id,
      position: (maxPos?.position ?? 0) + 10,
    }

    let { data: copy, error } = await admin
      .from("deals")
      .insert(insertPayload)
      .select("id")
      .single()

    // Ambientes sem alguma coluna opcional (source_type etc): retry
    // enxuto — duplicar não pode falhar por campo acessório.
    if (error && /column .* does not exist/i.test(error.message)) {
      log.warn("[DealDuplicate] retry sem colunas opcionais", { error: error.message })
      for (const k of ["source_type", "source_referrer", "referrer_partner_id", "utm"]) {
        delete insertPayload[k]
      }
      const retry = await admin.from("deals").insert(insertPayload).select("id").single()
      copy = retry.data
      error = retry.error
    }
    if (error || !copy) throw error ?? new Error("Falha ao duplicar")

    // Copia os itens de produto (snapshot integral). Fail-open.
    const { data: items } = await admin
      .from("crm_deal_products")
      .select("product_id, name, quantity, unit_price, discount_pct, billing_type, note, position")
      .eq("deal_id", id)
    if (items && items.length > 0) {
      const { error: itemsErr } = await admin.from("crm_deal_products").insert(
        items.map((item) => ({ ...item, deal_id: copy.id })),
      )
      if (itemsErr) {
        log.warn("[DealDuplicate] itens não copiados", { error: itemsErr.message })
      }
    }

    await admin.from("crm_deal_activities").insert({
      deal_id: copy.id,
      type: "system",
      content: `Negócio duplicado a partir de "${source.title}"`,
      created_by: user.id,
      is_internal: true,
    })

    log.info("[DealDuplicate] criado", { from: id, to: copy.id })
    return successResponse(request, { id: copy.id }, { status: 201 })
  } catch (error) {
    log.error("Deal duplicate error:", error)
    return errorResponse(request, error, "crm-deal-duplicate")
  }
}
