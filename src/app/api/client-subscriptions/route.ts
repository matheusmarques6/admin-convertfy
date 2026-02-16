import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("ClientSubscriptions")

// POST - Create a new subscription
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    const { client_id, name, value, cycle, payment_method, status, start_date, next_due_date, notes } = body

    if (!client_id) {
      throw new AppError("client_id is required", 400)
    }
    if (!name || !value) {
      throw new AppError("name and value are required", 400)
    }

    const subscriptionData: Record<string, unknown> = {
      client_id,
      name,
      value,
      cycle: cycle || "MONTHLY",
      payment_method: payment_method || "pix_direto",
      status: status || "active",
      start_date: start_date || new Date().toISOString().split("T")[0],
      next_due_date: next_due_date || start_date || new Date().toISOString().split("T")[0],
      notes: notes || null,
    }

    const { data, error } = await supabase
      .from("client_subscriptions")
      .insert(subscriptionData)
      .select()
      .single()

    if (error) throw error

    log.info("Subscription created", { subscription_id: data.id, client_id })
    return successResponse(request, { success: true, subscription: data })
  } catch (error) {
    return errorResponse(request, error, "ClientSubscriptions")
  }
}

// DELETE - Delete a subscription by id
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const id = request.nextUrl.searchParams.get("id")

    if (!id) {
      throw new AppError("id query parameter is required", 400)
    }

    const { error } = await supabase
      .from("client_subscriptions")
      .delete()
      .eq("id", id)

    if (error) throw error

    log.info("Subscription deleted", { subscription_id: id })
    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "ClientSubscriptions")
  }
}

// PATCH - Cancel a subscription (set status to "cancelled")
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    const { id } = body

    if (!id) {
      throw new AppError("id is required", 400)
    }

    const { data, error } = await supabase
      .from("client_subscriptions")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    log.info("Subscription cancelled", { subscription_id: id })
    return successResponse(request, { success: true, subscription: data })
  } catch (error) {
    return errorResponse(request, error, "ClientSubscriptions")
  }
}
