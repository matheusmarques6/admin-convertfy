import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("WiseReconcile")

export const dynamic = "force-dynamic"

// Store reconciliation data
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { transaction_reference, client_id, amount, currency, transaction_date, notes } = body

    if (!transaction_reference || !client_id) {
      throw new AppError("Transaction reference and client ID are required", 400)
    }

    // Check if transaction is already reconciled
    const { data: existingReconciliation } = await supabase
      .from("wise_reconciliations")
      .select("id")
      .eq("transaction_reference", transaction_reference)
      .single()

    if (existingReconciliation) {
      throw new AppError("Transaction already reconciled", 400)
    }

    // Create reconciliation record
    const { data: reconciliation, error } = await supabase
      .from("wise_reconciliations")
      .insert({
        transaction_reference,
        client_id,
        amount,
        currency,
        transaction_date,
        notes,
        reconciled_by: user.id,
        reconciled_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      // If table doesn't exist, we'll handle it
      if (error.code === "42P01") {
        throw new AppError("Reconciliation table not set up. Please run migrations.", 500)
      }
      throw error
    }

    // Log activity for the client
    await supabase.from("activities").insert({
      client_id,
      user_id: user.id,
      type: "payment_received",
      title: "Pagamento reconciliado (Wise)",
      description: `Pagamento de ${currency} ${amount.toFixed(2)} reconciliado via Wise`,
      metadata: {
        transaction_reference,
        amount,
        currency,
        source: "wise",
      },
    })

    return NextResponse.json({ success: true, reconciliation })
  } catch (error) {
    return errorResponse(request, error, "IntegrationsWiseReconcile")
  }
}

// Get reconciliations
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const clientId = searchParams.get("client_id")

    let query = supabase
      .from("wise_reconciliations")
      .select(`
        *,
        client:clients(id, name, email)
      `)
      .order("reconciled_at", { ascending: false })

    if (clientId) {
      query = query.eq("client_id", clientId)
    }

    const { data: reconciliations, error } = await query

    if (error) {
      // If table doesn't exist, return empty array
      if (error.code === "42P01") {
        return NextResponse.json({ reconciliations: [] })
      }
      throw error
    }

    return NextResponse.json({ reconciliations })
  } catch (error) {
    return errorResponse(request, error, "IntegrationsWiseReconcile")
  }
}

// Delete reconciliation
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const reconciliationId = searchParams.get("id")

    if (!reconciliationId) {
      throw new AppError("Reconciliation ID is required", 400)
    }

    const { error } = await supabase
      .from("wise_reconciliations")
      .delete()
      .eq("id", reconciliationId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(request, error, "IntegrationsWiseReconcile")
  }
}
