import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - Lightweight invoice status for the portal banner
// Returns pending/overdue counts + revenue from cache (no Asaas/Klaviyo calls)
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
      throw new AppError("Nao autorizado", 401)
    }

    // Check permission
    const permissions = portalUser.permissions as { view_invoices?: boolean }
    if (!permissions?.view_invoices) {
      throw new AppError("Sem permissao", 403)
    }

    const adminClient = createAdminClient()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Fetch all pending invoices for this client
    const { data: invoices, error: invoicesError } = await adminClient
      .from("unified_invoices")
      .select("id, amount, due_date, status")
      .eq("client_id", portalUser.client_id)
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
      return NextResponse.json(
        { show: false },
        { headers: corsHeaders(request.headers.get("origin")) }
      )
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
      .eq("client_id", portalUser.client_id)
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

    return NextResponse.json(
      {
        show: true,
        pendingCount: pending.length,
        overdueCount: overdue.length,
        totalPending,
        totalOverdue,
        earliestDueDate,
        oldestOverdueDate,
        revenueGenerated: showRevenue ? revenueGenerated : undefined,
        showRevenue,
      },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "PortalInvoiceStatus")
  }
}
