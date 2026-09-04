import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireOrgRoles, FINANCIAL_REPORT_ROLES } from "@/lib/api/require-org-admin"
import { validateMonetaryValue } from "@/lib/schemas/common"
import {
  isMissingClassificationColumn,
  parseChargeClassification,
  stripClassification,
} from "@/lib/services/charge-classification"
import { logger } from "@/lib/logger"

const log = logger.child("ClientCharges")

/**
 * A loja da cobrança tem de ser do MESMO cliente — sem isso um id
 * colado errado penduraria a mensalidade de um cliente na loja de
 * outro, e a carteira mostraria "paga" na loja errada.
 */
async function assertStoreBelongsToClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storeId: string | null | undefined,
  clientId: string,
) {
  if (!storeId) return
  const { data: store } = await supabase
    .from("client_stores")
    .select("id, client_id")
    .eq("id", storeId)
    .maybeSingle()
  if (!store || store.client_id !== clientId) {
    throw new AppError("A loja informada não pertence a este cliente", 422, "validation-error")
  }
}

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
    const classification = parseChargeClassification(body)
    await assertStoreBelongsToClient(supabase, classification.store_id, client_id)

    const chargeData: Record<string, unknown> = {
      client_id,
      description: description || null,
      value,
      due_date,
      payment_method: payment_method || "pix_direto",
      status: status || "pending",
      // Cobrança ligada a assinatura é assinatura, salvo se disseram o contrário.
      charge_type: classification.charge_type ?? (subscription_id ? "subscription" : "other"),
      reference_months: classification.reference_months ?? null,
      store_id: classification.store_id ?? null,
    }

    if (subscription_id) chargeData.subscription_id = subscription_id
    if (notes) chargeData.notes = notes

    let { data, error } = await supabase.from("client_charges").insert(chargeData).select().single()
    if (error && isMissingClassificationColumn(error)) {
      // Migration 20261113 pendente: grava sem a classificação em vez
      // de bloquear o financeiro.
      log.warn("client_charges sem colunas de classificação — retry sem elas", { error: error.message })
      ;({ data, error } = await supabase
        .from("client_charges")
        .insert(stripClassification(chargeData))
        .select()
        .single())
    }
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
      "payment_date", "payment_proof_path",
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

    const classification = parseChargeClassification(fields)
    if (classification.store_id) {
      const { data: current } = await supabase
        .from("client_charges")
        .select("client_id")
        .eq("id", charge_id)
        .maybeSingle()
      if (!current) throw new AppError("Cobrança não encontrada", 404, "not-found")
      await assertStoreBelongsToClient(supabase, classification.store_id, current.client_id)
    }
    Object.assign(updates, classification)

    if (Object.keys(updates).length === 0) {
      return successResponse(request, { success: true, message: "No fields to update" })
    }

    let { data, error } = await supabase
      .from("client_charges")
      .update(updates)
      .eq("id", charge_id)
      .select()
      .single()
    if (error && isMissingClassificationColumn(error)) {
      if (Object.keys(classification).length > 0 && Object.keys(stripClassification(updates)).length === 0) {
        throw new AppError(
          "Classificação de cobrança indisponível — aplique a migration 20261113_cobranca_tipo_meses_lojas.",
          422,
          "validation-error",
        )
      }
      ;({ data, error } = await supabase
        .from("client_charges")
        .update(stripClassification(updates))
        .eq("id", charge_id)
        .select()
        .single())
    }

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
