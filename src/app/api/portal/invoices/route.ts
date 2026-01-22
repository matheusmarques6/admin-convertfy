import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// GET - Get invoices for portal user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    // Get portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id, client_id, permissions")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    // Check permission
    const permissions = portalUser.permissions as { view_invoices?: boolean }
    if (!permissions?.view_invoices) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403, headers: corsHeaders() })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status")
    const year = searchParams.get("year")

    // Build query
    let query = supabase
      .from("invoices")
      .select("*")
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
      console.error("[Portal Invoices] Error:", error)
      return NextResponse.json({ error: "Erro ao buscar faturas" }, { status: 500, headers: corsHeaders() })
    }

    // Calculate stats
    const allInvoices = invoices || []
    const pending = allInvoices.filter((i) => i.status === "pending")
    const overdue = allInvoices.filter((i) => i.status === "overdue")
    const paid = allInvoices.filter((i) => i.status === "paid")

    const stats = {
      total: allInvoices.length,
      pending: pending.length,
      overdue: overdue.length,
      paid: paid.length,
      totalPending: pending.reduce((sum, i) => sum + (i.amount || 0), 0),
      totalOverdue: overdue.reduce((sum, i) => sum + (i.amount || 0), 0),
      totalPaid: paid.reduce((sum, i) => sum + (i.amount || 0), 0),
    }

    // Log activity
    await supabase.from("client_portal_activity").insert({
      portal_user_id: portalUser.id,
      client_id: portalUser.client_id,
      action: "view_invoices",
      metadata: { status, year },
    })

    return NextResponse.json(
      {
        invoices: allInvoices.map((i) => ({
          id: i.id,
          amount: i.amount,
          dueDate: i.due_date,
          paymentDate: i.payment_date,
          status: i.status,
          description: i.description,
          asaasId: i.asaas_id,
          createdAt: i.created_at,
        })),
        stats,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Portal Invoices] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
