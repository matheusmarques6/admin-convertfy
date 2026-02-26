import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"
import type { AsaasPaymentStatus } from "@/lib/integrations/types"
import { decryptCredentialsJson } from "@/lib/crypto"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status")
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")

    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .single()

    if (!integration) {
      throw new AppError("Integração Asaas não ativa", 400)
    }

    const asaas = createAsaasService(decryptCredentialsJson(integration.credentials))

    const { data: clients } = await supabase.from("clients").select("id, name, company, custom_fields")
    const customerToClient = new Map<string, { id: string; name: string; company?: string }>()
    clients?.forEach(c => {
      const asaasId = (c.custom_fields as Record<string, string>)?.asaas_customer_id
      if (asaasId) customerToClient.set(asaasId, { id: c.id, name: c.name, company: c.company })
    })

    const params: {
      limit: number; offset: number; status?: AsaasPaymentStatus;
      "dueDate[ge]"?: string; "dueDate[le]"?: string;
    } = { limit: 100, offset: 0 }
    if (status && status !== "all") params.status = status as AsaasPaymentStatus
    if (startDate) params["dueDate[ge]"] = startDate
    if (endDate) params["dueDate[le]"] = endDate

    interface AsaasPayment {
      id: string; customer: string; value: number; netValue?: number; status: string;
      billingType: string; dueDate: string; paymentDate?: string; description?: string;
      invoiceUrl?: string; bankSlipUrl?: string; originalDueDate?: string;
    }

    let allPayments: AsaasPayment[] = []
    let hasMore = true
    let offset = 0

    while (hasMore) {
      params.offset = offset
      const { data: payments, totalCount } = await asaas.listPayments(params)
      allPayments = [...allPayments, ...payments]
      offset += 100
      hasMore = offset < totalCount
    }

    allPayments.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const overduePayments = allPayments.filter(p =>
      p.status === "OVERDUE" || (p.status === "PENDING" && new Date(p.dueDate) < today)
    )
    const pendingPayments = allPayments.filter(p => p.status === "PENDING" && new Date(p.dueDate) >= today)
    const upcomingPayments = pendingPayments.filter(p => {
      const dueDate = new Date(p.dueDate)
      const nextWeek = new Date(today)
      nextWeek.setDate(nextWeek.getDate() + 7)
      return dueDate <= nextWeek
    })
    const receivedPayments = allPayments.filter(p => ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status))

    const mapPayment = (p: AsaasPayment) => {
      const client = customerToClient.get(p.customer)
      return {
        id: p.id, value: p.value, netValue: p.netValue, status: p.status,
        statusLabel: getStatusLabel(p.status), billingType: p.billingType,
        billingTypeLabel: getBillingTypeLabel(p.billingType), dueDate: p.dueDate,
        paymentDate: p.paymentDate, description: p.description, invoiceUrl: p.invoiceUrl,
        client: client ? { id: client.id, name: client.name, company: client.company } : null,
        isOverdue: p.status === "OVERDUE" || (p.status === "PENDING" && new Date(p.dueDate) < today),
        daysOverdue: p.status === "OVERDUE" || (p.status === "PENDING" && new Date(p.dueDate) < today)
          ? Math.floor((today.getTime() - new Date(p.dueDate).getTime()) / (1000 * 60 * 60 * 24)) : 0,
      }
    }

    const summary = {
      overdue: { count: overduePayments.length, value: overduePayments.reduce((sum, p) => sum + p.value, 0) },
      pending: { count: pendingPayments.length, value: pendingPayments.reduce((sum, p) => sum + p.value, 0) },
      upcoming: { count: upcomingPayments.length, value: upcomingPayments.reduce((sum, p) => sum + p.value, 0) },
      received: { count: receivedPayments.length, value: receivedPayments.reduce((sum, p) => sum + p.value, 0) },
      total: { count: allPayments.length, value: allPayments.reduce((sum, p) => sum + p.value, 0) },
    }

    return successResponse(request, {
      connected: true, summary,
      overdue: overduePayments.map(mapPayment),
      pending: pendingPayments.map(mapPayment),
      upcoming: upcomingPayments.map(mapPayment),
      received: receivedPayments.map(mapPayment),
      all: allPayments.map(mapPayment),
    })
  } catch (error) {
    return errorResponse(request, error, "AsaasChargesList GET")
  }
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: "Pendente", RECEIVED: "Recebido", CONFIRMED: "Confirmado", OVERDUE: "Vencido",
    REFUNDED: "Estornado", RECEIVED_IN_CASH: "Recebido em dinheiro",
    REFUND_REQUESTED: "Estorno solicitado", REFUND_IN_PROGRESS: "Estorno em andamento",
    CHARGEBACK_REQUESTED: "Chargeback solicitado", CHARGEBACK_DISPUTE: "Disputa de chargeback",
    AWAITING_CHARGEBACK_REVERSAL: "Aguardando reversão",
    DUNNING_REQUESTED: "Negativação solicitada", DUNNING_RECEIVED: "Negativação recebida",
    AWAITING_RISK_ANALYSIS: "Análise de risco",
  }
  return labels[status] || status
}

function getBillingTypeLabel(type: string): string {
  const labels: Record<string, string> = { BOLETO: "Boleto", CREDIT_CARD: "Cartão de Crédito", PIX: "PIX", UNDEFINED: "Indefinido" }
  return labels[type] || type
}
