import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireOrgRoles, FINANCIAL_REPORT_ROLES } from "@/lib/api/require-org-admin"
import { validateMonetaryValue } from "@/lib/schemas/common"
import { logger } from "@/lib/logger"

const log = logger.child("ClientCharges")

// POST - Create a new charge
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireOrgRoles(user.id, FINANCIAL_REPORT_ROLES)

    const body = await request.json()
    const { client_id, description, value, due_date, payment_method, status, subscription_id, notes } = body

    if (!client_id) {
      throw new AppError("client_id is required", 400)
    }
    if (!value || !due_date) {
      throw new AppError("value and due_date are required", 400)
    }

    validateMonetaryValue(value)

    const chargeData: Record<string, unknown> = {
      client_id,
      description: description || null,
      value,
      due_date,
      payment_method: payment_method || "pix_direto",
      status: status || "pending",
    }

    if (subscription_id) chargeData.subscription_id = subscription_id
    if (notes) chargeData.notes = notes

    const { data, error } = await supabase
      .from("client_charges")
      .insert(chargeData)
      .select()
      .single()

    if (error) throw error

    log.info("Charge created", { charge_id: data.id, client_id })
    return successResponse(request, { success: true, charge: data })
  } catch (error) {
    return errorResponse(request, error, "ClientCharges")
  }
}

// PUT - Update a charge
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireOrgRoles(user.id, FINANCIAL_REPORT_ROLES)

    const body = await request.json()
    const { charge_id, ...fields } = body

    if (!charge_id) {
      throw new AppError("charge_id is required", 400)
    }

    const allowedFields = [
      "description", "value", "due_date", "payment_method",
      "status", "subscription_id", "notes", "actual_payment_method",
      "payment_date",
    ]

    const updates: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(fields)) {
      if (allowedFields.includes(key)) {
        updates[key] = val
      }
    }

    if (updates.value !== undefined) {
      validateMonetaryValue(updates.value)
    }

    if (Object.keys(updates).length === 0) {
      return successResponse(request, { success: true, message: "No fields to update" })
    }

    const { data, error } = await supabase
      .from("client_charges")
      .update(updates)
      .eq("id", charge_id)
      .select()
      .single()

    if (error) throw error

    log.info("Charge updated", { charge_id, fields: Object.keys(updates) })
    return successResponse(request, { success: true, charge: data })
  } catch (error) {
    return errorResponse(request, error, "ClientCharges")
  }
}

// DELETE - Delete a charge by id
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireOrgRoles(user.id, FINANCIAL_REPORT_ROLES)

    const id = request.nextUrl.searchParams.get("id")

    if (!id) {
      throw new AppError("id query parameter is required", 400)
    }

    const { error } = await supabase
      .from("client_charges")
      .delete()
      .eq("id", id)

    if (error) throw error

    log.info("Charge deleted", { charge_id: id })
    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "ClientCharges")
  }
}

// PATCH - Cancel a charge (set status to "cancelled")
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireOrgRoles(user.id, FINANCIAL_REPORT_ROLES)

    const body = await request.json()
    const { id } = body

    if (!id) {
      throw new AppError("id is required", 400)
    }

    const { data, error } = await supabase
      .from("client_charges")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    log.info("Charge cancelled", { charge_id: id })
    return successResponse(request, { success: true, charge: data })
  } catch (error) {
    return errorResponse(request, error, "ClientCharges")
  }
}
