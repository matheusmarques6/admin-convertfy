import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService, mapAsaasStatusToInternal } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  isMissingClassificationColumn,
  stripClassification,
} from "@/lib/services/charge-classification"
import { logger } from "@/lib/logger"

const log = logger.child("AsaasPayments")

// GET - Get payments for a client or all payments
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const searchParams = request.nextUrl.searchParams
    const clientId = searchParams.get("client_id")
    const year = searchParams.get("year") || new Date().getFullYear().toString()

    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .eq("org_id", orgId)
      .single()

    if (!integration) {
      throw new AppError("Integração Asaas não ativa", 400)
    }

    const asaas = createAsaasService(decryptCredentialsJson(integration.credentials))
    let asaasCustomerId: string | undefined

    if (clientId) {
      const { data: client } = await supabase.from("clients").select("custom_fields").eq("id", clientId).single()
      asaasCustomerId = (client?.custom_fields as Record<string, string>)?.asaas_customer_id
    }

    // Security: if client_id provided but no asaas_customer_id, return empty (not ALL payments)
    if (clientId && !asaasCustomerId) {
      return successResponse(request, { year, summary: { total: 0, totalValue: 0, paid: 0, paidValue: 0, pending: 0, pendingValue: 0, overdue: 0, overdueValue: 0 }, payments: [], byMonth: {} })
    }

    let allPayments: Array<{
      id: string; customer: string; value: number; netValue?: number; status: string;
      billingType: string; dueDate: string; paymentDate?: string; description?: string;
      invoiceUrl?: string; bankSlipUrl?: string; pixQrCodeUrl?: string;
    }> = []

    // Filter by dueDate range on the API side to avoid fetching ALL payments
    let offset = 0
    const limit = 100
    const MAX_PAGES = 20 // Safety limit: max 2000 payments per year

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await asaas.listPayments({
        offset,
        limit,
        customer: asaasCustomerId,
        "dueDate[ge]": `${year}-01-01`,
        "dueDate[le]": `${year}-12-31`,
      })
      if (!result?.data?.length) break
      allPayments = [...allPayments, ...result.data]
      offset += limit
      if (offset >= (result.totalCount || 0)) break
    }

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

    const byMonth: Record<string, typeof allPayments> = {}
    for (const payment of allPayments) {
      const month = payment.dueDate.substring(0, 7)
      if (!byMonth[month]) byMonth[month] = []
      byMonth[month].push(payment)
    }

    return successResponse(request, { year, summary, payments: allPayments, byMonth })
  } catch (error) {
    return errorResponse(request, error, "AsaasPayments GET")
  }
}

// POST - Sync payments to local database
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const { data: integration } = await supabase
      .from("integrations")
      .select("id, credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .eq("org_id", orgId)
      .single()

    if (!integration) {
      throw new AppError("Integração Asaas não ativa", 400)
    }

    const asaas = createAsaasService(decryptCredentialsJson(integration.credentials))

    const { data: clients } = await supabase.from("clients").select("id, custom_fields")
    const clientMap = new Map<string, string>()
    clients?.forEach(c => {
      const asaasId = (c.custom_fields as Record<string, string>)?.asaas_customer_id
      if (asaasId) clientMap.set(asaasId, c.id)
    })

    let allPayments: Array<{
      id: string; customer: string; value: number; status: string;
      billingType: string; dueDate: string; paymentDate?: string; description?: string;
      subscription?: string;
    }> = []

    let offset = 0
    const limit = 100
    const MAX_PAGES = 50 // Safety limit for sync

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await asaas.listPayments({ offset, limit })
      if (!result?.data?.length) break
      allPayments = [...allPayments, ...result.data]
      offset += limit
      if (offset >= (result.totalCount || 0)) break
    }

    let synced = 0, updated = 0, errors = 0

    for (const payment of allPayments) {
      try {
        const clientId = clientMap.get(payment.customer)
        const status = mapAsaasStatusToInternal(payment.status as never)
        const invoiceData: Record<string, unknown> = {
          asaas_id: payment.id, client_id: clientId || null, amount: payment.value,
          due_date: payment.dueDate, payment_date: payment.paymentDate || null,
          status, description: payment.description || `Assinatura #${payment.id}`,
        }

        const { data: existing } = await supabase
          .from("invoices")
          .select("id, charge_type")
          .eq("asaas_id", payment.id)
          .single()

        // Pagamento de assinatura: grava o sub_… e classifica como
        // assinatura sem sobrescrever classificação manual.
        if (payment.subscription) {
          invoiceData.asaas_subscription_id = payment.subscription
          const current = (existing as { charge_type?: string } | null)?.charge_type
          if (!existing || !current || current === "other") invoiceData.charge_type = "subscription"
        }

        const write = (row: Record<string, unknown>) =>
          existing
            ? supabase.from("invoices").update({ ...row, updated_at: new Date().toISOString() }).eq("id", existing.id)
            : supabase.from("invoices").insert(row)
        let { error } = await write(invoiceData)
        if (error && isMissingClassificationColumn(error)) {
          ;({ error } = await write(stripClassification(invoiceData)))
        }
        if (error) errors++
        else if (existing) updated++
        else synced++
      } catch { errors++ }
    }

    await supabase.from("integrations").update({ last_sync: new Date().toISOString() }).eq("id", integration.id)

    log.info("Payment sync completed", { total: allPayments.length, synced, updated, errors })

    return successResponse(request, { stats: { total: allPayments.length, synced, updated, errors } })
  } catch (error) {
    return errorResponse(request, error, "AsaasPayments POST")
  }
}
