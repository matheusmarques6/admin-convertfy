import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("WiseReconcile")

export const dynamic = "force-dynamic"

async function resolveOrgId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  const { data: orgMember } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single()

  if (!orgMember?.org_id) {
    throw new AppError("Acesso negado", 403)
  }
  return orgMember.org_id
}

async function getOrgClientIds(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string): Promise<string[]> {
  const { data: clients } = await supabase
    .from("clients")
    .select("id")
    .eq("org_id", orgId)
  return clients?.map(c => c.id) || []
}

// Store reconciliation data
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(supabase, user.id)

    const body = await request.json()
    const { transaction_reference, client_id, amount, currency, transaction_date, notes } = body

    if (!transaction_reference || !client_id) {
      throw new AppError("Transaction reference and client ID are required", 400)
    }

    // Verify client belongs to user's org
    const orgClientIds = await getOrgClientIds(supabase, orgId)
    if (!orgClientIds.includes(client_id)) {
      throw new AppError("Cliente não encontrado", 404)
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
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(supabase, user.id)

    const clientId = searchParams.get("client_id")

    // Get org's client IDs for scoping
    const orgClientIds = await getOrgClientIds(supabase, orgId)

    if (orgClientIds.length === 0) {
      return NextResponse.json({ reconciliations: [] })
    }

    let query = supabase
      .from("wise_reconciliations")
      .select(`
        *,
        client:clients(id, name, email)
      `)
      .in("client_id", orgClientIds)
      .order("reconciled_at", { ascending: false })

    if (clientId) {
      if (!orgClientIds.includes(clientId)) {
        throw new AppError("Cliente não encontrado", 404)
      }
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
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(supabase, user.id)

    const reconciliationId = searchParams.get("id")

    if (!reconciliationId) {
      throw new AppError("Reconciliation ID is required", 400)
    }

    // Verify reconciliation belongs to user's org via client
    const { data: reconciliation } = await supabase
      .from("wise_reconciliations")
      .select("id, client_id")
      .eq("id", reconciliationId)
      .single()

    if (!reconciliation) {
      throw new AppError("Reconciliação não encontrada", 404)
    }

    const orgClientIds = await getOrgClientIds(supabase, orgId)
    if (!orgClientIds.includes(reconciliation.client_id)) {
      throw new AppError("Acesso negado", 403)
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
