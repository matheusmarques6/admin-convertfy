/**
 * Vínculo assinatura ↔ lojas (`client_subscription_stores`, migration
 * 20261113) — helpers compartilhados pelas rotas de assinatura local,
 * assinatura Asaas e fechamento do negócio.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("SubscriptionStores")

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `store_ids` do body: lista de uuids, ausente = []. */
export function parseStoreIds(v: unknown): string[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v) || !v.every((s) => typeof s === "string" && UUID_RE.test(s))) {
    throw new AppError("store_ids deve ser uma lista de ids de loja", 400, "validation-error")
  }
  return [...new Set(v as string[])]
}

/** Toda loja vinculada tem de ser do MESMO cliente da assinatura. */
export async function assertStoresOfClient(
  admin: SupabaseClient,
  storeIds: string[],
  clientId: string,
): Promise<void> {
  if (storeIds.length === 0) return
  const { data: stores } = await admin.from("client_stores").select("id, client_id").in("id", storeIds)
  const ok = new Set((stores ?? []).filter((s) => s.client_id === clientId).map((s) => s.id))
  if (storeIds.some((s) => !ok.has(s))) {
    throw new AppError("Toda loja vinculada precisa ser do cliente da assinatura", 422, "validation-error")
  }
}

/**
 * Grava o vínculo (aditivo, idempotente). Devolve false quando a
 * tabela não existe (migration pendente) — a assinatura já foi criada,
 * então isso é aviso, não erro.
 */
export async function linkSubscriptionStores(
  admin: SupabaseClient,
  subscriptionId: string,
  storeIds: string[],
): Promise<boolean> {
  if (storeIds.length === 0) return true
  const { error } = await admin
    .from("client_subscription_stores")
    .upsert(
      storeIds.map((store_id) => ({ subscription_id: subscriptionId, store_id })),
      { onConflict: "subscription_id,store_id", ignoreDuplicates: true },
    )
  if (error) {
    log.warn("vínculo assinatura ↔ loja não gravado", { subscriptionId, error: error.message })
    return false
  }
  return true
}
