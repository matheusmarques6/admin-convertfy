import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("AsaasClientsStatus")

export const dynamic = "force-dynamic"
export const maxDuration = 30

// Cache for client status (5 minutes)
let statusCache: { data: Record<string, unknown> | null; timestamp: number } = { data: null, timestamp: 0 }
const CACHE_TTL = 5 * 60 * 1000

// GET - Get payment status for all clients
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const now = Date.now()
    if (statusCache.data && (now - statusCache.timestamp) < CACHE_TTL) {
      return successResponse(request, { connected: true, clientsStatus: statusCache.data, cached: true })
    }

    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .single()

    if (!integration) {
      return successResponse(request, { connected: false, clientsStatus: {} })
    }

    const credentials = decryptCredentialsJson(integration.credentials)
    const asaas = createAsaasService(credentials)
    const baseUrl = (credentials.environment as string) === "production"
      ? "https://api.asaas.com/v3"
      : "https://sandbox.asaas.com/api/v3"

    const { data: clients } = await supabase.from("clients").select("id, custom_fields")

    const clientMap: Record<string, string> = {}
    for (const client of clients || []) {
      const asaasId = (client.custom_fields as Record<string, string>)?.asaas_customer_id
      if (asaasId) clientMap[asaasId] = client.id
    }

    const asaasIds = Object.keys(clientMap)
    if (asaasIds.length === 0) {
      return successResponse(request, { connected: true, clientsStatus: {} })
    }

    const clientsStatus: Record<string, {
      asaasId: string; hasOverdue: boolean; overdueCount: number; overdueValue: number;
      pendingCount: number; pendingValue: number;
      subscription?: { value: number; cycle: string; status: string };
    }> = {}

    for (const asaasId of asaasIds) {
      const clientId = clientMap[asaasId]
      clientsStatus[clientId] = { asaasId, hasOverdue: false, overdueCount: 0, overdueValue: 0, pendingCount: 0, pendingValue: 0 }
    }

    try {
      let allOverduePayments: Array<{ customer: string; value: number }> = []
      let overdueOffset = 0
      let overdueHasMore = true
      while (overdueHasMore) {
        const { data: overdueData, totalCount: overdueTotalCount } = await asaas.listPayments({
          status: "OVERDUE", offset: overdueOffset, limit: 100,
        })
        allOverduePayments = [...allOverduePayments, ...overdueData]
        overdueOffset += 100
        overdueHasMore = overdueOffset < overdueTotalCount
      }
      for (const payment of allOverduePayments) {
        const clientId = clientMap[payment.customer]
        if (clientId && clientsStatus[clientId]) {
          clientsStatus[clientId].hasOverdue = true
          clientsStatus[clientId].overdueCount++
          clientsStatus[clientId].overdueValue += payment.value
        }
      }
    } catch (err) {
      log.error("Error fetching overdue payments", { error: err instanceof Error ? err.message : "unknown" })
    }

    try {
      const { data: pendingPayments } = await asaas.listPayments({ status: "PENDING", limit: 100 })
      for (const payment of pendingPayments || []) {
        const clientId = clientMap[payment.customer]
        if (clientId && clientsStatus[clientId]) {
          clientsStatus[clientId].pendingCount++
          clientsStatus[clientId].pendingValue += payment.value
        }
      }
    } catch (err) {
      log.error("Error fetching pending payments", { error: err instanceof Error ? err.message : "unknown" })
    }

    try {
      const subsResponse = await fetch(`${baseUrl}/subscriptions?status=ACTIVE&limit=100`, {
        headers: { "Content-Type": "application/json", access_token: credentials.api_key as string },
      })
      const subsData = await subsResponse.json()
      for (const sub of subsData.data || []) {
        const clientId = clientMap[sub.customer]
        if (clientId && clientsStatus[clientId]) {
          clientsStatus[clientId].subscription = { value: sub.value, cycle: sub.cycle, status: sub.status }
        }
      }
    } catch (err) {
      log.error("Error fetching subscriptions", { error: err instanceof Error ? err.message : "unknown" })
    }

    statusCache = { data: clientsStatus, timestamp: now }

    return successResponse(request, { connected: true, clientsStatus })
  } catch (error) {
    return errorResponse(request, error, "AsaasClientsStatus GET")
  }
}
