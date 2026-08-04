/**
 * PATCH  /api/crm/deals/[id]/products/[itemId] — edita qtd/preço/desconto
 * DELETE /api/crm/deals/[id]/products/[itemId] — remove item
 *
 * Ambos recalculam deals.value. Remover o ÚLTIMO item não zera o valor
 * (volta ao modo manual — ver crm-deal-products.service).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import {
  DEAL_PRODUCT_FIELDS,
  fetchDealProducts,
  recalcDealValue,
} from "@/lib/services/crm-deal-products.service"
import { dealTotals, normalizeDiscount, normalizeQuantity } from "@/lib/services/crm-deal-products"

const log = logger.child("CrmDealProductItem")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  quantity: z.number().positive().max(999_999).optional(),
  unit_price: z.number().min(0).max(999_999_999).optional(),
  discount_pct: z.number().min(0).max(100).optional(),
  billing_type: z.enum(["one_time", "recurring"]).optional(),
  name: z.string().min(1).max(160).optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { id, itemId } = await context.params
    uuid().parse(id)
    uuid().parse(itemId)
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    const updates: Record<string, unknown> = {}
    if (parsed.quantity !== undefined) updates.quantity = normalizeQuantity(parsed.quantity)
    if (parsed.unit_price !== undefined) updates.unit_price = parsed.unit_price
    if (parsed.discount_pct !== undefined)
      updates.discount_pct = normalizeDiscount(parsed.discount_pct)
    if (parsed.billing_type !== undefined) updates.billing_type = parsed.billing_type
    if (parsed.name !== undefined) updates.name = parsed.name.trim()

    if (Object.keys(updates).length === 0) {
      throw new AppError("Nada para atualizar", 422, "validation-error")
    }

    const { data: item, error } = await admin
      .from("crm_deal_products")
      .update(updates)
      .eq("id", itemId)
      .eq("deal_id", id)
      .select(DEAL_PRODUCT_FIELDS)
      .single()

    if (error) throw error
    if (!item) throw new AppError("Item não encontrado", 404, "not-found")

    const newValue = await recalcDealValue(admin, id)
    const { items } = await fetchDealProducts(admin, id)

    return successResponse(request, {
      item,
      items,
      totals: dealTotals(items),
      deal_value: newValue,
    })
  } catch (error) {
    log.error("DealProductItem PATCH error:", error)
    return errorResponse(request, error, "crm-deal-product-item-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { id, itemId } = await context.params
    uuid().parse(id)
    uuid().parse(itemId)
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { error } = await admin
      .from("crm_deal_products")
      .delete()
      .eq("id", itemId)
      .eq("deal_id", id)
    if (error) throw error

    const newValue = await recalcDealValue(admin, id)
    const { items } = await fetchDealProducts(admin, id)

    return successResponse(request, {
      deleted: true,
      items,
      totals: dealTotals(items),
      deal_value: newValue,
    })
  } catch (error) {
    log.error("DealProductItem DELETE error:", error)
    return errorResponse(request, error, "crm-deal-product-item-delete")
  }
}
