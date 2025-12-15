import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status") // PENDING, OVERDUE, RECEIVED, all
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")

    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .single()

    if (!integration) {
      return NextResponse.json({
        success: false,
        connected: false,
        error: "Integração Asaas não ativa"
      }, { status: 400 })
    }

    const asaas = createAsaasService(integration.credentials)

    // Get all clients to map customer IDs to names
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name, company, custom_fields")

    const customerToClient = new Map<string, { id: string; name: string; company?: string }>()
    clients?.forEach(c => {
      const asaasId = (c.custom_fields as Record<string, string>)?.asaas_customer_id
      if (asaasId) {
        customerToClient.set(asaasId, { id: c.id, name: c.name, company: c.company })
      }
    })

    // Fetch payments from Asaas with status filter
    const params: Record<string, string | number> = { limit: 100, offset: 0 }
    if (status && status !== "all") {
      params.status = status
    }

    interface AsaasPayment {
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
      originalDueDate?: string
    }

    let allPayments: AsaasPayment[] = []
    let hasMore = true
    let offset = 0

    while (hasMore) {
      params.offset = offset
      const { data: payments, totalCount } = await asaas.listPayments(params as never)
      allPayments = [...allPayments, ...payments]
      offset += 100
      hasMore = offset < totalCount
    }

    // Filter by date range if provided
    if (startDate || endDate) {
      allPayments = allPayments.filter(p => {
        const dueDate = new Date(p.dueDate)
        if (startDate && dueDate < new Date(startDate)) return false
        if (endDate && dueDate > new Date(endDate)) return false
        return true
      })
    }

    // Sort by due date
    allPayments.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())

    // Categorize payments
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const overduePayments = allPayments.filter(p =>
      p.status === "OVERDUE" ||
      (p.status === "PENDING" && new Date(p.dueDate) < today)
    )

    const pendingPayments = allPayments.filter(p =>
      p.status === "PENDING" && new Date(p.dueDate) >= today
    )

    const upcomingPayments = pendingPayments.filter(p => {
      const dueDate = new Date(p.dueDate)
      const nextWeek = new Date(today)
      nextWeek.setDate(nextWeek.getDate() + 7)
      return dueDate <= nextWeek
    })

    const receivedPayments = allPayments.filter(p =>
      ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status)
    )

    // Map payments with client info
    const mapPayment = (p: AsaasPayment) => {
      const client = customerToClient.get(p.customer)
      return {
        id: p.id,
        value: p.value,
        netValue: p.netValue,
        status: p.status,
        statusLabel: getStatusLabel(p.status),
        billingType: p.billingType,
        billingTypeLabel: getBillingTypeLabel(p.billingType),
        dueDate: p.dueDate,
        paymentDate: p.paymentDate,
        description: p.description,
        invoiceUrl: p.invoiceUrl,
        client: client ? {
          id: client.id,
          name: client.name,
          company: client.company,
        } : null,
        isOverdue: p.status === "OVERDUE" || (p.status === "PENDING" && new Date(p.dueDate) < today),
        daysOverdue: p.status === "OVERDUE" || (p.status === "PENDING" && new Date(p.dueDate) < today)
          ? Math.floor((today.getTime() - new Date(p.dueDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0,
      }
    }

    // Calculate summaries
    const summary = {
      overdue: {
        count: overduePayments.length,
        value: overduePayments.reduce((sum, p) => sum + p.value, 0),
      },
      pending: {
        count: pendingPayments.length,
        value: pendingPayments.reduce((sum, p) => sum + p.value, 0),
      },
      upcoming: {
        count: upcomingPayments.length,
        value: upcomingPayments.reduce((sum, p) => sum + p.value, 0),
      },
      received: {
        count: receivedPayments.length,
        value: receivedPayments.reduce((sum, p) => sum + p.value, 0),
      },
      total: {
        count: allPayments.length,
        value: allPayments.reduce((sum, p) => sum + p.value, 0),
      },
    }

    return NextResponse.json({
      success: true,
      connected: true,
      summary,
      overdue: overduePayments.map(mapPayment),
      pending: pendingPayments.map(mapPayment),
      upcoming: upcomingPayments.map(mapPayment),
      received: receivedPayments.map(mapPayment),
      all: allPayments.map(mapPayment),
    })
  } catch (error) {
    console.error("Error fetching charges:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao buscar cobranças" },
      { status: 500 }
    )
  }
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: "Pendente",
    RECEIVED: "Recebido",
    CONFIRMED: "Confirmado",
    OVERDUE: "Vencido",
    REFUNDED: "Estornado",
    RECEIVED_IN_CASH: "Recebido em dinheiro",
    REFUND_REQUESTED: "Estorno solicitado",
    REFUND_IN_PROGRESS: "Estorno em andamento",
    CHARGEBACK_REQUESTED: "Chargeback solicitado",
    CHARGEBACK_DISPUTE: "Disputa de chargeback",
    AWAITING_CHARGEBACK_REVERSAL: "Aguardando reversão",
    DUNNING_REQUESTED: "Negativação solicitada",
    DUNNING_RECEIVED: "Negativação recebida",
    AWAITING_RISK_ANALYSIS: "Análise de risco",
  }
  return labels[status] || status
}

function getBillingTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    BOLETO: "Boleto",
    CREDIT_CARD: "Cartão de Crédito",
    PIX: "PIX",
    UNDEFINED: "Indefinido",
  }
  return labels[type] || type
}
