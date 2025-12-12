import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"

// GET - Get payment status for all clients
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
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

    // Get all clients with asaas_customer_id
    const { data: clients } = await supabase
      .from("clients")
      .select("id, custom_fields")

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

    // Process each client
    for (const client of clients || []) {
      const asaasId = (client.custom_fields as Record<string, string>)?.asaas_customer_id
      if (!asaasId) continue

      try {
        // Get overdue payments
        const { data: payments } = await asaas.listPayments({
          customer: asaasId,
          status: "OVERDUE",
          limit: 100,
        } as never)

        const overduePayments = payments || []
        const overdueValue = overduePayments.reduce((sum: number, p: { value: number }) => sum + p.value, 0)

        // Get pending payments
        const { data: pendingPayments } = await asaas.listPayments({
          customer: asaasId,
          status: "PENDING",
          limit: 100,
        } as never)

        const pending = pendingPayments || []
        const pendingValue = pending.reduce((sum: number, p: { value: number }) => sum + p.value, 0)

        // Get subscription
        const subsResponse = await fetch(
          `https://api.asaas.com/v3/subscriptions?customer=${asaasId}&status=ACTIVE&limit=1`,
          {
            headers: {
              "Content-Type": "application/json",
              access_token: integration.credentials.api_key,
            },
          }
        )
        const subsData = await subsResponse.json()
        const activeSub = subsData.data?.[0]

        clientsStatus[client.id] = {
          asaasId,
          hasOverdue: overduePayments.length > 0,
          overdueCount: overduePayments.length,
          overdueValue,
          pendingCount: pending.length,
          pendingValue,
          subscription: activeSub ? {
            value: activeSub.value,
            cycle: activeSub.cycle,
            status: activeSub.status,
          } : undefined,
        }
      } catch (err) {
        console.error(`Error fetching status for client ${client.id}:`, err)
      }
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
