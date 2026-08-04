/**
 * GET  /api/crm/deals/[id]/products — itens do negócio + totais
 * POST /api/crm/deals/[id]/products — adiciona item (do catálogo ou avulso)
 *
 * Toda mutação recalcula deals.value = soma dos itens (fonte: produtos
 * vencem valor manual, regra Datacrazy/Pipedrive).
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

const log = logger.child("CrmDealProductsApi")

export const dynamic = "force-dynamic"

function isMissingSchema(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204") return true
  return (e.message || "").toLowerCase().includes("does not exist")
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    uuid().parse(id)
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { items, error } = await fetchDealProducts(admin, id)
    if (error) {
      if (isMissingSchema(error)) {
        return successResponse(request, {
          items: [],
          totals: dealTotals([]),
          schema_missing: true,
        })
      }
      throw error
    }

    return successResponse(request, { items, totals: dealTotals(items) })
  } catch (error) {
    log.error("DealProducts GET error:", error)
    return errorResponse(request, error, "crm-deal-products-get")
  }
}

const addItemSchema = z.object({
  /** Produto do catálogo (opcional — item avulso só precisa de name). */
  product_id: uuid().nullable().optional(),
  name: z.string().min(1).max(160).optional(),
  quantity: z.number().positive().max(999_999).optional().default(1),
  /** Sem preço explícito, herda o do catálogo. */
  unit_price: z.number().min(0).max(999_999_999).optional(),
  discount_pct: z.number().min(0).max(100).optional().default(0),
  billing_type: z.enum(["one_time", "recurring"]).optional(),
  note: z.string().max(600).nullable().optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    uuid().parse(id)
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = addItemSchema.parse(body)

    // Deal existe?
    const { data: deal } = await admin
      .from("deals")
      .select("id")
      .eq("id", id)
      .maybeSingle()
    if (!deal) throw new AppError("Negócio não encontrado", 404, "not-found")

    // Resolve snapshot a partir do catálogo quando product_id veio.
    let name = parsed.name?.trim() || ""
    let unitPrice = parsed.unit_price
    let billing = parsed.billing_type

    if (parsed.product_id) {
      const { data: product, error: pErr } = await admin
        .from("crm_products")
        .select("id, name, unit_price, billing_type")
        .eq("id", parsed.product_id)
        .maybeSingle()
      if (pErr && !isMissingSchema(pErr)) throw pErr
      if (!product) throw new AppError("Produto não encontrado no catálogo", 404, "not-found")
      if (!name) name = product.name
      if (unitPrice === undefined) unitPrice = Number(product.unit_price) || 0
      if (!billing) billing = product.billing_type === "recurring" ? "recurring" : "one_time"
    }

    if (!name) {
      throw new AppError("Informe o produto (ou um nome para item avulso).", 422, "validation-error")
    }

    // Posição no fim da lista
    const { data: maxPos } = await admin
      .from("crm_deal_products")
      .select("position")
      .eq("deal_id", id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()

    const insertPayload: Record<string, unknown> = {
      deal_id: id,
      product_id: parsed.product_id ?? null,
      name,
      quantity: normalizeQuantity(parsed.quantity),
      unit_price: unitPrice ?? 0,
      discount_pct: normalizeDiscount(parsed.discount_pct),
      billing_type: billing ?? "one_time",
      position: (maxPos?.position ?? 0) + 10,
    }
    if (parsed.note !== undefined) insertPayload.note = parsed.note?.trim() || null

    let { data: item, error } = await admin
      .from("crm_deal_products")
      .insert(insertPayload)
      .select(DEAL_PRODUCT_FIELDS)
      .single()

    // Coluna note ausente (migration 20261068 pendente): não perde a
    // adição por causa da observação — regrava sem ela e avisa no log.
    if (error && "note" in insertPayload && /column .*note.* does not exist|42703/i.test(`${error.code} ${error.message}`)) {
      log.warn("[DealProducts] coluna note ausente — item salvo sem observação (migration 20261068)")
      delete insertPayload.note
      const retry = await admin
        .from("crm_deal_products")
        .insert(insertPayload)
        .select("id, deal_id, product_id, name, quantity, unit_price, discount_pct, billing_type, position, created_at")
        .single()
      item = retry.data as typeof item
      error = retry.error
    }

    if (error) {
      if (isMissingSchema(error)) {
        throw new AppError(
          "Produtos no negócio ainda não habilitados no banco (migration 20261067).",
          422,
          "validation-error",
        )
      }
      throw error
    }

    const newValue = await recalcDealValue(admin, id)
    const { items } = await fetchDealProducts(admin, id)

    log.info("[DealProducts] item adicionado", { dealId: id, name, value: newValue })
    return successResponse(
      request,
      { item, items, totals: dealTotals(items), deal_value: newValue },
      { status: 201 },
    )
  } catch (error) {
    log.error("DealProducts POST error:", error)
    return errorResponse(request, error, "crm-deal-products-post")
  }
}
