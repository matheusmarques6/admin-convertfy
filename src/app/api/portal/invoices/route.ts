import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalInvoices")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - Get invoices for portal user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Get portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id, client_id, permissions")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    // Check permission
    const permissions = portalUser.permissions as { view_invoices?: boolean }
    if (!permissions?.view_invoices) {
      throw new AppError("Sem permissão", 403)
    }

    // Use admin client for data queries (RLS bypass policies will be removed in 18.1.2)
    const adminClient = createAdminClient()

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status")
    const year = searchParams.get("year")

    // Build query (adminClient bypasses RLS; isolation via client_id filter)
    let query = adminClient
      .from("invoices")
      .select("id, client_id, asaas_id, amount, due_date, payment_date, status, description, created_at")
      .eq("client_id", portalUser.client_id)
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
      .eq("id", portalUser.client_id)
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
          invoice_url: invoiceUrl,
          bank_slip_url: bankSlipUrl,
          pix_qr_code: pixQrCode,
          billing_type: billingType,
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

    const stats = {
      total: processedInvoices.length,
      pending: pending.length,
      overdue: overdue.length,
      paid: paid.length,
      totalPending: pending.reduce((sum, i) => sum + i.amount, 0),
      totalOverdue: overdue.reduce((sum, i) => sum + i.amount, 0),
      totalPaid: paid.reduce((sum, i) => sum + i.amount, 0),
    }

    // Log activity (table does not exist yet -- GAP-6 / Story 18.1.6)
    await adminClient.from("client_portal_activity").insert({
      portal_user_id: portalUser.id,
      client_id: portalUser.client_id,
      action: "view_invoices",
      metadata: { status, year },
    })

    return NextResponse.json(
      {
        invoices: processedInvoices,
        nextInvoice: nextInvoice || overdueInvoice || null,
        stats,
      },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "PortalInvoices")
  }
}
