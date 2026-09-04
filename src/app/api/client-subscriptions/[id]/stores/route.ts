/**
 * GET/PUT /api/client-subscriptions/[id]/stores — lojas cobertas por uma
 * assinatura (`client_subscription_stores`, migration 20261113).
 *
 * PUT substitui o conjunto inteiro (`store_ids: []` desvincula tudo).
 * Toda loja tem de ser do MESMO cliente da assinatura — é o que impede
 * a mensalidade de um cliente aparecer "paga" na loja de outro na
 * Gestão de Carteira.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireOrgRoles, FINANCIAL_REPORT_ROLES } from "@/lib/api/require-org-admin"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("SubscriptionStores")

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function loadSubscriptionInOrg(userId: string, subscriptionId: string) {
  const admin = createAdminClient()
  const orgId = await resolveOrgId(userId)
  const { data: sub } = await admin
    .from("client_subscriptions")
    .select("id, client_id, client:clients!inner(org_id)")
    .eq("id", subscriptionId)
    .maybeSingle()
  const client = Array.isArray(sub?.client) ? sub?.client[0] : sub?.client
  if (!sub || (client as { org_id?: string } | null)?.org_id !== orgId) {
    throw new AppError("Assinatura não encontrada", 404, "not-found")
  }
  return { admin, sub: { id: sub.id as string, client_id: sub.client_id as string } }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const { admin, sub } = await loadSubscriptionInOrg(user.id, id)

    const { data, error } = await admin
      .from("client_subscription_stores")
      .select("store_id, store:client_stores(id, store_name, is_active)")
      .eq("subscription_id", sub.id)
    if (error) {
      // Tabela ausente (migration pendente) → sem vínculo, sem quebrar.
      log.warn("client_subscription_stores indisponível", { error: error.message })
      return successResponse(request, { stores: [], schema_missing: true })
    }
    const stores = (data ?? []).map((r) => {
      const s = (Array.isArray(r.store) ? r.store[0] : r.store) as
        | { id: string; store_name: string; is_active: boolean | null }
        | null
      return { id: r.store_id as string, store_name: s?.store_name ?? "Loja", is_active: s?.is_active ?? null }
    })
    return successResponse(request, { stores })
  } catch (error) {
    return errorResponse(request, error, "subscription-stores")
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    await requireOrgRoles(user.id, FINANCIAL_REPORT_ROLES)
    const { admin, sub } = await loadSubscriptionInOrg(user.id, id)

    const body = (await request.json().catch(() => ({}))) as { store_ids?: unknown }
    if (!Array.isArray(body.store_ids) || !body.store_ids.every((s) => typeof s === "string" && UUID_RE.test(s))) {
      throw new AppError("store_ids deve ser uma lista de ids de loja", 400, "validation-error")
    }
    const storeIds = [...new Set(body.store_ids as string[])]

    if (storeIds.length > 0) {
      const { data: stores } = await admin
        .from("client_stores")
        .select("id, client_id")
        .in("id", storeIds)
      const ok = new Set((stores ?? []).filter((s) => s.client_id === sub.client_id).map((s) => s.id))
      const foreign = storeIds.filter((s) => !ok.has(s))
      if (foreign.length > 0) {
        throw new AppError("Toda loja vinculada precisa ser do cliente da assinatura", 422, "validation-error")
      }
    }

    const { error: delErr } = await admin
      .from("client_subscription_stores")
      .delete()
      .eq("subscription_id", sub.id)
    if (delErr) {
      if (delErr.code === "42P01") {
        throw new AppError(
          "Vínculo assinatura ↔ loja indisponível — aplique a migration 20261113_cobranca_tipo_meses_lojas.",
          422,
          "validation-error",
        )
      }
      throw delErr
    }
    if (storeIds.length > 0) {
      const { error: insErr } = await admin
        .from("client_subscription_stores")
        .insert(storeIds.map((store_id) => ({ subscription_id: sub.id, store_id })))
      if (insErr) throw insErr
    }

    log.info("assinatura vinculada a lojas", { subscriptionId: sub.id, stores: storeIds.length })
    return successResponse(request, { success: true, store_ids: storeIds })
  } catch (error) {
    return errorResponse(request, error, "subscription-stores")
  }
}
