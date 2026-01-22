import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService, mapAsaasStatusToInternal } from "@/lib/integrations/asaas"

// GET - Get payments for a client or all payments
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const clientId = searchParams.get("client_id")
    const year = searchParams.get("year") || new Date().getFullYear().toString()

    // Get Asaas integration
    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .single()

    if (!integration) {
      return NextResponse.json({ error: "Integração Asaas não ativa" }, { status: 400 })
    }

    const asaas = createAsaasService(integration.credentials)

    // If clientId provided, get asaas_customer_id from client
    let asaasCustomerId: string | undefined

    if (clientId) {
      const { data: client } = await supabase
        .from("clients")
        .select("custom_fields")
        .eq("id", clientId)
        .single()

      asaasCustomerId = (client?.custom_fields as Record<string, string>)?.asaas_customer_id
    }

    // Fetch payments from Asaas
    let allPayments: Array<{
      id: string
      customer: string
      value: number
      netValue?: number
      status: string
      billingType: string
      dueDate: string
      paymentDate?: string
      description?: string
      invoiceUrl?: string
      bankSlipUrl?: string
      pixQrCodeUrl?: string
    }> = []

    let offset = 0
    const limit = 100
    let hasMore = true

    while (hasMore) {
      const params: Record<string, string | number> = { offset, limit }
      if (asaasCustomerId) params.customer = asaasCustomerId

      const { data: payments, totalCount } = await asaas.listPayments(params as never)

      // Filter by year
      const filteredPayments = payments.filter((p: { dueDate: string }) => {
        const paymentYear = new Date(p.dueDate).getFullYear().toString()
        return paymentYear === year
      })

      allPayments = [...allPayments, ...filteredPayments]
      offset += limit
      hasMore = offset < totalCount && filteredPayments.length === payments.length
    }

    // Calculate summary
    const summary = {
      total: allPayments.length,
      totalValue: allPayments.reduce((sum, p) => sum + p.value, 0),
      paid: allPayments.filter(p => ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status)).length,
      paidValue: allPayments.filter(p => ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status)).reduce((sum, p) => sum + p.value, 0),
      pending: allPayments.filter(p => p.status === "PENDING").length,
      pendingValue: allPayments.filter(p => p.status === "PENDING").reduce((sum, p) => sum + p.value, 0),
      overdue: allPayments.filter(p => p.status === "OVERDUE").length,
      overdueValue: allPayments.filter(p => p.status === "OVERDUE").reduce((sum, p) => sum + p.value, 0),
    }

    // Group by month
    const byMonth: Record<string, typeof allPayments> = {}
    for (const payment of allPayments) {
      const month = payment.dueDate.substring(0, 7) // YYYY-MM
      if (!byMonth[month]) byMonth[month] = []
      byMonth[month].push(payment)
    }

    return NextResponse.json({
      success: true,
      year,
      summary,
      payments: allPayments,
      byMonth,
    })
  } catch (error) {
    console.error("Error fetching payments:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao buscar pagamentos" },
      { status: 500 }
    )
  }
}

// POST - Sync payments to local database
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { data: integration } = await supabase
      .from("integrations")
      .select("id, credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .single()

    if (!integration) {
      return NextResponse.json({ error: "Integração Asaas não ativa" }, { status: 400 })
    }

    const asaas = createAsaasService(integration.credentials)

    // Get all clients with asaas_customer_id
    const { data: clients } = await supabase
      .from("clients")
      .select("id, custom_fields")

    const clientMap = new Map<string, string>()
    clients?.forEach(c => {
      const asaasId = (c.custom_fields as Record<string, string>)?.asaas_customer_id
      if (asaasId) clientMap.set(asaasId, c.id)
    })

    // Fetch all payments
    let allPayments: Array<{
      id: string
      customer: string
      value: number
      status: string
      billingType: string
      dueDate: string
      paymentDate?: string
      description?: string
    }> = []

    let offset = 0
    const limit = 100
    let hasMore = true

    while (hasMore) {
      const { data: payments, totalCount } = await asaas.listPayments({ offset, limit })
      allPayments = [...allPayments, ...payments]
      offset += limit
      hasMore = offset < totalCount
    }

    let synced = 0
    let updated = 0
    let errors = 0

    for (const payment of allPayments) {
      try {
        const clientId = clientMap.get(payment.customer)
        const status = mapAsaasStatusToInternal(payment.status as never)

        const invoiceData = {
          asaas_id: payment.id,
          client_id: clientId || null,
          amount: payment.value,
          due_date: payment.dueDate,
          payment_date: payment.paymentDate || null,
          status,
          description: payment.description || `Cobrança #${payment.id}`,
        }

        // Check if exists
        const { data: existing } = await supabase
          .from("invoices")
          .select("id")
          .eq("asaas_id", payment.id)
          .single()

        if (existing) {
          const { error } = await supabase
            .from("invoices")
            .update({ ...invoiceData, updated_at: new Date().toISOString() })
            .eq("id", existing.id)

          if (error) errors++
          else updated++
        } else {
          const { error } = await supabase
            .from("invoices")
            .insert(invoiceData)

          if (error) errors++
          else synced++
        }
      } catch {
        errors++
      }
    }

    // Update last sync
    await supabase
      .from("integrations")
      .update({ last_sync: new Date().toISOString() })
      .eq("id", integration.id)

    return NextResponse.json({
      success: true,
      stats: { total: allPayments.length, synced, updated, errors }
    })
  } catch (error) {
    console.error("Error syncing payments:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao sincronizar" },
      { status: 500 }
    )
  }
}
