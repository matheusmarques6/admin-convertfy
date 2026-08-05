/**
 * PATCH  /api/crm/products/[id] — edita produto do catálogo
 * DELETE /api/crm/products/[id] — exclui; se usado em negócios, DESATIVA
 *
 * Reprecificar/renomear NÃO reescreve itens já lançados (eles guardam
 * snapshot) — o novo preço vale para as próximas adições.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmProductDetail")

export const dynamic = "force-dynamic"

const PRODUCT_FIELDS =
  "id, name, code, description, unit_price, currency, billing_type, recurring_interval, is_active, created_at, updated_at"

async function resolveOrg(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
  return data?.org_id ?? null
}

const patchSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  code: z.string().max(60).nullable().optional(),
  description: z.string().max(600).nullable().optional(),
  unit_price: z.number().min(0).max(999_999_999).optional(),
  billing_type: z.enum(["one_time", "recurring"]).optional(),
  recurring_interval: z.enum(["monthly", "quarterly", "semiannual", "yearly"]).nullable().optional(),
  is_active: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    uuid().parse(id)
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrg(admin, user.id)
    if (!orgId) throw new AppError("Sem org membership", 403)

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    const updates: Record<string, unknown> = { ...parsed }
    if (typeof parsed.name === "string") updates.name = parsed.name.trim()
    // Trocar para one_time limpa o intervalo; para recurring garante default.
    if (parsed.billing_type === "one_time") updates.recurring_interval = null
    if (parsed.billing_type === "recurring" && parsed.recurring_interval === undefined) {
      updates.recurring_interval = "monthly"
    }

    const { data, error } = await admin
      .from("crm_products")
      .update(updates)
      .eq("id", id)
      .eq("org_id", orgId)
      .select(PRODUCT_FIELDS)
      .single()

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new AppError("Já existe um produto com esse nome.", 409, "conflict")
      }
      // CHECK antigo sem 'semiannual' — banco ainda na versão anterior.
      if (
        (error as { code?: string }).code === "23514" &&
        updates.recurring_interval === "semiannual"
      ) {
        throw new AppError(
          "O intervalo Semestral precisa da migration 20261069 no banco — rode-a no Supabase e tente de novo.",
          422,
          "validation-error",
        )
      }
      throw error
    }
    if (!data) throw new AppError("Produto não encontrado", 404, "not-found")

    return successResponse(request, { product: data })
  } catch (error) {
    log.error("Product PATCH error:", error)
    return errorResponse(request, error, "crm-product-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    uuid().parse(id)
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrg(admin, user.id)
    if (!orgId) throw new AppError("Sem org membership", 403)

    // Usado em algum negócio? Então só desativa — apagar quebraria o
    // relatório do que foi vendido (mesmo com snapshot, o vínculo some).
    const { count } = await admin
      .from("crm_deal_products")
      .select("id", { count: "exact", head: true })
      .eq("product_id", id)

    if ((count ?? 0) > 0) {
      const { error } = await admin
        .from("crm_products")
        .update({ is_active: false })
        .eq("id", id)
        .eq("org_id", orgId)
      if (error) throw error
      return successResponse(request, { deactivated: true, used_in: count })
    }

    const { error } = await admin
      .from("crm_products")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)
    if (error) throw error

    return successResponse(request, { deleted: true })
  } catch (error) {
    log.error("Product DELETE error:", error)
    return errorResponse(request, error, "crm-product-delete")
  }
}
