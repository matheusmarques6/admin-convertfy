import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"

export const dynamic = "force-dynamic"
export const maxDuration = 30 // Allow up to 30 seconds for this route

// Cache for client status (5 minutes)
let statusCache: {
  data: Record<string, unknown> | null
  timestamp: number
} = {
  data: null,
  timestamp: 0,
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// GET - Get payment status for all clients
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    // Check cache
    const now = Date.now()
    if (statusCache.data && (now - statusCache.timestamp) < CACHE_TTL) {
      return NextResponse.json({
        success: true,
        connected: true,
        clientsStatus: statusCache.data,
        cached: true,
      })
    }

    // Get Asaas integration
    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .single()

    if (!integration) {
      return NextResponse.json({
        success: true,
        connected: false,
        clientsStatus: {}
      })
    }

    const asaas = createAsaasService(integration.credentials)
    const baseUrl = integration.credentials.environment === "production"
      ? "https://api.asaas.com/v3"
      : "https://sandbox.asaas.com/api/v3"

    // Get all clients with asaas_customer_id
    const { data: clients } = await supabase
      .from("clients")
      .select("id, custom_fields")

    // Build a map of asaas_id -> client_id
    const clientMap: Record<string, string> = {}
    for (const client of clients || []) {
      const asaasId = (client.custom_fields as Record<string, string>)?.asaas_customer_id
      if (asaasId) {
        clientMap[asaasId] = client.id
      }
    }

    const asaasIds = Object.keys(clientMap)
    if (asaasIds.length === 0) {
      return NextResponse.json({
        success: true,
        connected: true,
        clientsStatus: {}
      })
    }

    const clientsStatus: Record<string, {
      asaasId: string
      hasOverdue: boolean
      overdueCount: number
      overdueValue: number
      pendingCount: number
      pendingValue: number
      subscription?: {
        value: number
        cycle: string
        status: string
      }
    }> = {}

    // Initialize all clients with default values
    for (const asaasId of asaasIds) {
      const clientId = clientMap[asaasId]
      clientsStatus[clientId] = {
        asaasId,
        hasOverdue: false,
        overdueCount: 0,
        overdueValue: 0,
        pendingCount: 0,
        pendingValue: 0,
      }
    }

    // Fetch all overdue payments in one call
    try {
      const { data: overduePayments } = await asaas.listPayments({
        status: "OVERDUE",
        limit: 100,
      } as never)

      for (const payment of overduePayments || []) {
        const clientId = clientMap[payment.customer]
        if (clientId && clientsStatus[clientId]) {
          clientsStatus[clientId].hasOverdue = true
          clientsStatus[clientId].overdueCount++
          clientsStatus[clientId].overdueValue += payment.value
        }
      }
    } catch (err) {
      console.error("Error fetching overdue payments:", err)
    }

    // Fetch all pending payments in one call
    try {
      const { data: pendingPayments } = await asaas.listPayments({
        status: "PENDING",
        limit: 100,
      } as never)

      for (const payment of pendingPayments || []) {
        const clientId = clientMap[payment.customer]
        if (clientId && clientsStatus[clientId]) {
          clientsStatus[clientId].pendingCount++
          clientsStatus[clientId].pendingValue += payment.value
        }
      }
    } catch (err) {
      console.error("Error fetching pending payments:", err)
    }

    // Fetch all active subscriptions in one call
    try {
      const subsResponse = await fetch(
        `${baseUrl}/subscriptions?status=ACTIVE&limit=100`,
        {
          headers: {
            "Content-Type": "application/json",
            access_token: integration.credentials.api_key,
          },
        }
      )
      const subsData = await subsResponse.json()

      for (const sub of subsData.data || []) {
        const clientId = clientMap[sub.customer]
        if (clientId && clientsStatus[clientId]) {
          clientsStatus[clientId].subscription = {
            value: sub.value,
            cycle: sub.cycle,
            status: sub.status,
          }
        }
      }
    } catch (err) {
      console.error("Error fetching subscriptions:", err)
    }

    // Update cache
    statusCache = {
      data: clientsStatus,
      timestamp: now,
    }

    return NextResponse.json({
      success: true,
      connected: true,
      clientsStatus,
    })
  } catch (error) {
    console.error("Error fetching clients status:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    )
  }
}
