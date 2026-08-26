import { withTiming } from "@/lib/api/with-timing"
/**
 * GET /api/stores/alerts
 *
 * Alertas de loja, filtráveis por store_id/client_id/status/type/
 * severity/limit. Normalizada pro padrão do projeto (ago/2026):
 * requireAuth + resolveOrgId + successResponse — e, principalmente,
 * FILTRO DE ORG: a versão antiga listava alertas de qualquer org pra
 * qualquer autenticado.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
} from "@/lib/services/store-alert.service"

export const dynamic = "force-dynamic"

async function handleGet(request: NextRequest) {
  try {
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const storeId = sp.get("store_id")
    const clientId = sp.get("client_id")
    const status = sp.get("status") as AlertStatus | null
    const type = sp.get("type") as AlertType | null
    const severity = sp.get("severity") as AlertSeverity | null
    const limit = Math.min(parseInt(sp.get("limit") || "50", 10) || 50, 200)

    // store_alerts não tem org_id — o escopo entra pelas lojas da org.
    const { data: orgStores, error: storesError } = await admin
      .from("client_stores")
      .select("id")
      .eq("org_id", orgId)
      .limit(1000)
    if (storesError) throw storesError
    const orgStoreIds = (orgStores ?? []).map((s) => s.id)
    if (orgStoreIds.length === 0) {
      return successResponse(request, { alerts: [] })
    }

    let q = admin
      .from("store_alerts")
      .select("*, store:client_stores(id, store_name), client:clients(id, name)")
      .in("store_id", orgStoreIds)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (storeId) q = q.eq("store_id", storeId)
    if (clientId) q = q.eq("client_id", clientId)
    if (status) q = q.eq("status", status)
    if (type) q = q.eq("type", type)
    if (severity) q = q.eq("severity", severity)

    const { data, error } = await q
    if (error) throw error

    // Mesmo shape achatado do storeAlertService.getAlerts (store_name/
    // client_name no topo) — consumidores antigos seguem funcionando.
    const alerts = (data ?? []).map((row) => {
      const { store, client, ...rest } = row as Record<string, unknown> & {
        store?: { store_name?: string } | { store_name?: string }[] | null
        client?: { name?: string } | { name?: string }[] | null
      }
      const s = Array.isArray(store) ? store[0] : store
      const c = Array.isArray(client) ? client[0] : client
      return {
        ...rest,
        store_name: s?.store_name,
        client_name: c?.name ?? null,
      }
    })

    return successResponse(request, { alerts })
  } catch (error) {
    return errorResponse(request, error, "stores-alerts")
  }
}

export const GET = withTiming("stores/alerts", handleGet)
