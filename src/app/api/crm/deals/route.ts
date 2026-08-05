/**
 * GET  /api/crm/deals    — lista com filtros (pipeline, stage, owner, status, tags, busca)
 * POST /api/crm/deals    — cria deal
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { uuid } from "@/lib/validations/uuid"
import { logger } from "@/lib/logger"
import { dispatchTrigger } from "@/lib/services/crm-trigger-dispatcher.service"
import {
  dealTotals,
  normalizeDiscount,
  normalizeQuantity,
} from "@/lib/services/crm-deal-products"

const log = logger.child("CrmDeals")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const pipeline_id = sp.get("pipeline_id")
    const stage_id = sp.get("stage_id")
    const owner_id = sp.get("owner_id")
    const status = sp.get("status")
    const search = sp.get("search")
    const client_id = sp.get("client_id")
    const store_id = sp.get("store_id")
    const lead_id = sp.get("lead_id")
    const limit = Math.min(parseInt(sp.get("limit") || "200", 10), 500)

    let q = admin
      .from("deals")
      .select(`
        id, pipeline_id, stage_id, client_id, store_id, lead_id,
        title, value, currency, probability, expected_close_date,
        status, source, tags, owner_id, position, last_stage_changed_at,
        won_at, lost_at, created_at, updated_at,
        owner:profiles!deals_owner_id_fkey (id, name, avatar_url),
        client:clients (id, name, company),
        store:client_stores (id, store_name)
      `)
      .neq("status", "archived")
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(limit)

    if (pipeline_id) q = q.eq("pipeline_id", pipeline_id)
    if (stage_id) q = q.eq("stage_id", stage_id)
    if (owner_id) q = q.eq("owner_id", owner_id)
    if (status) q = q.eq("status", status)
    if (client_id) q = q.eq("client_id", client_id)
    if (store_id) q = q.eq("store_id", store_id)
    if (lead_id) q = q.eq("lead_id", lead_id)
    if (search) q = q.ilike("title", `%${search}%`)

    const { data, error } = await q
    if (error) throw error

    return successResponse(request, { deals: data || [] })
  } catch (error) {
    log.error("Deals GET error:", error)
    return errorResponse(request, error, "crm-deals-get")
  }
}

const createDealSchema = z.object({
  pipeline_id: uuid(),
  stage_id: uuid(),
  title: z.string().min(1).max(240),
  value: z.number().min(0).optional().default(0),
  currency: z.string().length(3).optional().default("BRL"),
  probability: z.number().int().min(0).max(100).optional().default(50),
  expected_close_date: z.string().nullable().optional(),
  client_id: uuid().nullable().optional(),
  store_id: uuid().nullable().optional(),
  lead_id: uuid().nullable().optional(),
  source: z.string().nullable().optional(),
  source_type: z.string().nullable().optional(),
  source_referrer: z.string().nullable().optional(),
  utm: z.record(z.string(), z.unknown()).optional().default({}),
  tags: z.array(z.string()).optional().default([]),
  // owner_id opcional — se nao vier, usa o user autenticado (default).
  // Frontend pode sobrescrever pra delegar pra outro vendedor.
  owner_id: uuid().optional(),
  referrer_partner_id: uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
  /**
   * Itens de produto lançados junto com o negócio (estilo Datacrazy).
   * Com itens, o value enviado é IGNORADO — vale a soma das linhas.
   */
  products: z
    .array(
      z.object({
        product_id: uuid().nullable().optional(),
        name: z.string().min(1).max(160).optional(),
        quantity: z.number().positive().max(999_999).optional().default(1),
        unit_price: z.number().min(0).max(999_999_999).optional(),
        discount_pct: z.number().min(0).max(100).optional().default(0),
        billing_type: z.enum(["one_time", "recurring"]).optional(),
        recurring_interval: z
          .enum(["monthly", "quarterly", "semiannual", "yearly"])
          .nullable()
          .optional(),
      }),
    )
    .max(50)
    .optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const { products, ...parsed } = createDealSchema.parse(body)

    // owner_id default = current user (frontend pode sobrescrever)
    const ownerId = parsed.owner_id ?? user.id

    // Resolve itens de produto ANTES do insert: com itens, o value do
    // deal nasce como a soma das linhas (snapshot de nome/preço vem do
    // catálogo quando product_id foi informado).
    let resolvedItems: Array<{
      product_id: string | null
      name: string
      quantity: number
      unit_price: number
      discount_pct: number
      billing_type: string
      recurring_interval: string | null
    }> = []
    if (products && products.length > 0) {
      const catalogIds = products
        .map((p) => p.product_id)
        .filter((v): v is string => !!v)
      const catalog = new Map<
        string,
        { name: string; unit_price: number; billing_type: string; recurring_interval: string | null }
      >()
      if (catalogIds.length > 0) {
        const { data: rows } = await admin
          .from("crm_products")
          .select("id, name, unit_price, billing_type, recurring_interval")
          .in("id", catalogIds)
        for (const r of rows ?? []) {
          catalog.set(r.id, {
            name: r.name,
            unit_price: Number(r.unit_price) || 0,
            billing_type: r.billing_type,
            recurring_interval: (r.recurring_interval as string | null) ?? null,
          })
        }
      }
      resolvedItems = products.flatMap((p) => {
        const fromCatalog = p.product_id ? catalog.get(p.product_id) : undefined
        const name = p.name?.trim() || fromCatalog?.name || ""
        if (!name) return [] // linha sem produto nem nome: ignora
        const billing =
          p.billing_type ??
          (fromCatalog?.billing_type === "recurring" ? "recurring" : "one_time")
        return [
          {
            product_id: p.product_id ?? null,
            name,
            quantity: normalizeQuantity(p.quantity),
            unit_price: p.unit_price ?? fromCatalog?.unit_price ?? 0,
            discount_pct: normalizeDiscount(p.discount_pct),
            billing_type: billing,
            // Snapshot do intervalo (como nome/preço) — só recorrente tem.
            recurring_interval:
              billing === "recurring"
                ? (p.recurring_interval ?? fromCatalog?.recurring_interval ?? null)
                : null,
          },
        ]
      })
    }
    const effectiveValue =
      resolvedItems.length > 0 ? dealTotals(resolvedItems).total : parsed.value

    // Posicao no fim da etapa (maior position + 1)
    const { data: maxPos } = await admin
      .from("deals")
      .select("position")
      .eq("stage_id", parsed.stage_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextPos = (maxPos?.position ?? 0) + 10

    const dealPayload: Record<string, unknown> = {
      ...parsed,
      value: effectiveValue,
      owner_id: ownerId,
      position: nextPos,
      status: "open",
    }
    let { data: deal, error } = await admin
      .from("deals")
      .insert(dealPayload)
      .select("id")
      .single()

    // source_type/source_referrer vêm da migration 20261070 — sem ela o
    // insert inteiro morreria em 42703 e criar negócio quebraria.
    if (error && /source_type|source_referrer/i.test(error.message ?? "")) {
      delete dealPayload.source_type
      delete dealPayload.source_referrer
      const retry = await admin.from("deals").insert(dealPayload).select("id").single()
      deal = retry.data
      error = retry.error
    }

    if (error) throw error
    if (!deal) throw new AppError("Falha ao criar o negócio", 500)

    // Itens de produto — fail-open: se a migration 20261067 não rodou,
    // o deal já existe e a seção de produtos avisa; não desfaz a criação.
    if (resolvedItems.length > 0) {
      const rows = resolvedItems.map((item, i) => ({
        ...item,
        deal_id: deal.id,
        position: (i + 1) * 10,
      }))
      let { error: itemsErr } = await admin.from("crm_deal_products").insert(rows)
      // Coluna recurring_interval ausente (migration 20261069 pendente):
      // regrava sem ela — perder os itens por causa do intervalo seria pior.
      if (itemsErr && /column .* does not exist|42703/i.test(`${itemsErr.code} ${itemsErr.message}`)) {
        const stripped = rows.map(({ recurring_interval: _omit, ...rest }) => rest)
        const retry = await admin.from("crm_deal_products").insert(stripped)
        itemsErr = retry.error
      }
      if (itemsErr) {
        log.warn("[Deals] itens de produto não gravados (migration 20261067?)", {
          dealId: deal.id,
          error: itemsErr.message,
        })
      }
    }

    // Activity de criacao
    await admin.from("crm_deal_activities").insert({
      deal_id: deal.id,
      type: "system",
      content: `Deal criado: ${parsed.title}`,
      created_by: ownerId,
      is_internal: true,
    })

    log.info("[Deals] created", { id: deal.id, title: parsed.title })

    // Dispara trigger deal_created
    const { data: ownerOrg } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", ownerId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    if (ownerOrg?.org_id) {
      dispatchTrigger({
        trigger_type: "deal_created",
        org_id: ownerOrg.org_id,
        trigger_data: { deal_id: deal.id },
        context: {
          trigger_type: "deal_created",
          trigger_data: { deal_id: deal.id },
          deal: { id: deal.id, ...parsed, owner_id: ownerId },
          org_id: ownerOrg.org_id,
        },
        idempotency_key: `deal_created:${deal.id}`,
      }).catch((err) => log.error("[Deals] dispatch error", err))
    }

    return successResponse(request, { id: deal.id })
  } catch (error) {
    log.error("Deals POST error:", error)
    return errorResponse(request, error, "crm-deals-post")
  }
}
