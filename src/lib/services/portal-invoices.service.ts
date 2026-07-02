/**
 * Portal Invoices Service
 *
 * Builds the portal invoices payload (unified invoices + Asaas payment links
 * + stats) and the lightweight invoice status payload for a client.
 *
 * Extracted from portal/invoices/route.ts and portal/invoices/status/route.ts
 * so Server Components can call them directly without an HTTP hop.
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { AppError } from "@/lib/api/errors"
import { createAsaasService } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { logger } from "@/lib/logger"

const log = logger.child("PortalInvoices")

// ─── buildPortalInvoices: full invoices payload (list + nextInvoice + stats) ─

export async function buildPortalInvoices(opts: {
  clientId: string
  portalUserId: string
  status: string | null
  year: string | null
  adminClient: SupabaseClient
}) {
  const { clientId, portalUserId, status, year, adminClient } = opts

  // Build query (adminClient bypasses RLS; isolation via client_id filter)
  let query = adminClient
    .from("unified_invoices")
    .select("id, client_id, asaas_id, amount, due_date, payment_date, status, description, created_at, source, payment_method, actual_payment_method, subscription_id, notes, refund_total, net_amount")
    .eq("client_id", clientId)
    .order("due_date", { ascending: false })

  if (status && status !== "all") {
    query = query.eq("status", status)
  }

  if (year) {
    const startOfYear = `${year}-01-01`
    const endOfYear = `${year}-12-31`
    query = query.gte("due_date", startOfYear).lte("due_date", endOfYear)
  }

  const { data: invoices, error } = await query

  if (error) {
    log.error("[Portal Invoices] Error:", error)
    throw new AppError("Erro ao buscar faturas", 500)
  }

  // Get org_id for scoping integrations query
  const { data: clientData } = await adminClient
    .from("clients")
    .select("org_id")
    .eq("id", clientId)
    .single()

  // Get Asaas integration for fetching payment links (scoped by org_id)
  let integration = null
  if (clientData?.org_id) {
    const { data } = await adminClient
      .from("integrations")
      .select("credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .eq("org_id", clientData.org_id)
      .single()
    integration = data
  }

  let asaas: ReturnType<typeof createAsaasService> | null = null
  if (integration) {
    try {
      asaas = createAsaasService(decryptCredentialsJson(integration.credentials))
    } catch {
      log.debug("[Portal Invoices] Could not create Asaas service")
    }
  }

  // Calculate stats and check for overdue invoices
  const allInvoices = invoices || []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Process invoices and fetch payment links for pending ones
  const processedInvoices = await Promise.all(
    allInvoices.map(async (i) => {
      // Check if invoice is overdue
      const dueDate = new Date(i.due_date)
      dueDate.setHours(0, 0, 0, 0)
      const isOverdue = i.status === "pending" && dueDate < today

      // Fetch payment details from Asaas for pending/overdue invoices
      let invoiceUrl: string | undefined
      let bankSlipUrl: string | undefined
      let pixQrCode: { encodedImage: string; payload: string } | undefined
      let billingType: string | undefined

      if (asaas && i.asaas_id && (i.status === "pending" || isOverdue)) {
        try {
          const payment = await asaas.getPayment(i.asaas_id)
          invoiceUrl = payment.invoiceUrl
          bankSlipUrl = payment.bankSlipUrl
          billingType = payment.billingType

          // Try to get PIX QR code if billing type is PIX
          if (payment.billingType === "PIX" || payment.billingType === "UNDEFINED") {
            try {
              pixQrCode = await asaas.getPaymentPixQrCode(i.asaas_id)
            } catch {
              // PIX QR code might not be available
            }
          }

          // Try to get bank slip URL if billing type is BOLETO
          if (payment.billingType === "BOLETO" || payment.billingType === "UNDEFINED") {
            try {
              const slipData = await asaas.getPaymentBankSlip(i.asaas_id)
              bankSlipUrl = slipData.url
            } catch {
              // Bank slip might not be available
            }
          }
        } catch (err) {
          log.debug(`[Portal Invoices] Could not fetch Asaas payment ${i.asaas_id}:`, err)
        }
      }

      return {
        id: i.id,
        amount: Number(i.amount),
        due_date: i.due_date,
        payment_date: i.payment_date,
        status: isOverdue ? "overdue" : i.status,
        description: i.description || "Mensalidade Convertfy",
        asaas_id: i.asaas_id,
        created_at: i.created_at,
        source: i.source,
        payment_method: i.payment_method,
        actual_payment_method: i.actual_payment_method,
        invoice_url: invoiceUrl,
        bank_slip_url: bankSlipUrl,
        pix_qr_code: pixQrCode,
        billing_type: billingType,
        refund_total: Number(i.refund_total) || 0,
        net_amount: Number(i.net_amount) || Number(i.amount) || 0,
      }
    })
  )

  // Sort by due_date ascending for finding next invoice
  const sortedByDueDate = [...processedInvoices].sort(
    (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  )

  // Find next pending invoice (closest future due date)
  const nextInvoice = sortedByDueDate.find(
    (i) => i.status === "pending" && new Date(i.due_date) >= today
  )

  // Find current overdue invoice (if any)
  const overdueInvoice = sortedByDueDate.find((i) => i.status === "overdue")

  // Calculate stats
  const pending = processedInvoices.filter((i) => i.status === "pending")
  const overdue = processedInvoices.filter((i) => i.status === "overdue")
  const paid = processedInvoices.filter((i) => i.status === "paid")
  const refunded = processedInvoices.filter((i) => i.status === "refunded")

  const stats = {
    total: processedInvoices.length,
    pending: pending.length,
    overdue: overdue.length,
    paid: paid.length,
    refunded: refunded.length,
    totalPending: pending.reduce((sum, i) => sum + i.amount, 0),
    totalOverdue: overdue.reduce((sum, i) => sum + i.amount, 0),
    totalPaid: paid.reduce((sum, i) => sum + i.amount, 0),
    totalRefunded: refunded.reduce((sum, i) => sum + i.refund_total, 0),
  }

  // Log portal activity
  await adminClient.from("client_portal_activity").insert({
    portal_user_id: portalUserId,
    client_id: clientId,
    action: "view_invoices",
    metadata: { status, year },
  })

  return {
    invoices: processedInvoices,
    nextInvoice: nextInvoice || overdueInvoice || null,
    stats,
  }
}

// ─── getPortalInvoicesStatus: lightweight status payload for the banner ─────

export async function getPortalInvoicesStatus(opts: {
  clientId: string
  adminClient: SupabaseClient
}) {
  const { clientId, adminClient } = opts

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Fetch all pending invoices for this client
  const { data: invoices, error: invoicesError } = await adminClient
    .from("unified_invoices")
    .select("id, amount, due_date, status")
    .eq("client_id", clientId)
    .eq("status", "pending")
    .order("due_date", { ascending: true })

  if (invoicesError) {
    throw new AppError("Erro ao buscar faturas", 500)
  }

  const allInvoices = invoices || []

  // Classify pending vs overdue
  const pending: typeof allInvoices = []
  const overdue: typeof allInvoices = []

  for (const inv of allInvoices) {
    const dueDate = new Date(inv.due_date + "T12:00:00")
    dueDate.setHours(0, 0, 0, 0)
    if (dueDate < today) {
      overdue.push(inv)
    } else {
      pending.push(inv)
    }
  }

  const totalPending = pending.reduce((sum, i) => sum + Number(i.amount), 0)
  const totalOverdue = overdue.reduce((sum, i) => sum + Number(i.amount), 0)
  const totalInvoices = totalPending + totalOverdue

  // No pending or overdue invoices — nothing to show
  if (pending.length === 0 && overdue.length === 0) {
    return { show: false as const }
  }

  // Find earliest due date and oldest overdue date
  const earliestDueDate = pending.length > 0 ? pending[0].due_date : null
  const oldestOverdueDate = overdue.length > 0 ? overdue[0].due_date : null

  // Fetch revenue from cache (store_revenue_summary, period 30d)
  // Chain: client_id -> client_stores -> store_revenue_summary
  let revenueGenerated = 0
  let showRevenue = false

  const { data: stores } = await adminClient
    .from("client_stores")
    .select("id")
    .eq("client_id", clientId)
    .eq("is_active", true)

  if (stores && stores.length > 0) {
    const storeIds = stores.map((s) => s.id)

    const { data: revenueSummaries } = await adminClient
      .from("store_revenue_summary")
      .select("klaviyo_total_revenue, currency")
      .in("store_id", storeIds)
      .eq("period_label", "30d")
      .in("sync_status", ["ok", "partial"])

    if (revenueSummaries && revenueSummaries.length > 0) {
      // Sum revenue (only BRL or treat all as same currency for now)
      revenueGenerated = revenueSummaries.reduce(
        (sum, r) => sum + Number(r.klaviyo_total_revenue || 0),
        0
      )
      // Guard: only show revenue if it's >= total invoices
      showRevenue = revenueGenerated >= totalInvoices
    }
  }

  return {
    show: true as const,
    pendingCount: pending.length,
    overdueCount: overdue.length,
    totalPending,
    totalOverdue,
    earliestDueDate,
    oldestOverdueDate,
    revenueGenerated: showRevenue ? revenueGenerated : undefined,
    showRevenue,
  }
}
