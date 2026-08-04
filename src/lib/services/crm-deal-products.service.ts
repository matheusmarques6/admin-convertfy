/**
 * Recálculo do valor do negócio a partir dos itens de produto.
 *
 * Chamado pelas rotas que mudam itens (add/edit/remove) — regra no app,
 * não em trigger de banco: o incidente do trigger deal.won (migration
 * 20261066) firmou a regra de que lógica acoplada à ação do usuário
 * precisa ser observável e fail-open. Aqui, se o recálculo falhar, o
 * item já foi salvo e a rota loga o desvio em vez de desfazer a ação.
 */

import type { createAdminClient } from "@/lib/supabase/server"
import { dealTotals } from "./crm-deal-products"
import { logger } from "@/lib/logger"

const log = logger.child("CrmDealProducts")

type Admin = ReturnType<typeof createAdminClient>

export interface DealProductRow {
  id: string
  deal_id: string
  product_id: string | null
  name: string
  quantity: number
  unit_price: number
  discount_pct: number
  billing_type: string
  position: number
  created_at: string
}

export const DEAL_PRODUCT_FIELDS =
  "id, deal_id, product_id, name, quantity, unit_price, discount_pct, billing_type, position, created_at"

/** Lê os itens do deal (ordenados). */
export async function fetchDealProducts(
  admin: Admin,
  dealId: string,
): Promise<{ items: DealProductRow[]; error: unknown }> {
  const { data, error } = await admin
    .from("crm_deal_products")
    .select(DEAL_PRODUCT_FIELDS)
    .eq("deal_id", dealId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
  return { items: (data as DealProductRow[] | null) ?? [], error }
}

/**
 * Recalcula deals.value = soma dos itens. Com zero itens NÃO zera o
 * valor: remover o último produto devolve o deal ao modo manual, e
 * zerar apagaria um valor que o vendedor pode ter digitado antes.
 */
export async function recalcDealValue(admin: Admin, dealId: string): Promise<number | null> {
  const { items, error } = await fetchDealProducts(admin, dealId)
  if (error) {
    log.warn("[DealProducts] recálculo pulado — leitura falhou", { dealId })
    return null
  }
  if (items.length === 0) return null

  const totals = dealTotals(items)
  const { error: upErr } = await admin
    .from("deals")
    .update({ value: totals.total })
    .eq("id", dealId)
  if (upErr) {
    log.error("[DealProducts] falha ao gravar valor recalculado", {
      dealId,
      total: totals.total,
      error: upErr.message,
    })
    return null
  }
  return totals.total
}
