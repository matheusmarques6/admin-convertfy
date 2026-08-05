/**
 * GET  /api/crm/products — catálogo da org (busca, filtro ativo)
 * POST /api/crm/products — cria produto (nome único por org)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmProducts")

export const dynamic = "force-dynamic"

const PRODUCT_FIELDS =
  "id, name, code, description, unit_price, currency, billing_type, recurring_interval, is_active, created_at, updated_at"

function isMissingSchema(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204") return true
  return (e.message || "").toLowerCase().includes("does not exist")
}

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

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrg(admin, user.id)
    if (!orgId) return successResponse(request, { products: [] })

    const sp = request.nextUrl.searchParams
    const q = sp.get("q")?.trim()
    const includeInactive = sp.get("include_inactive") === "true"
    const limit = Math.min(parseInt(sp.get("limit") || "100", 10), 500)

    let query = admin
      .from("crm_products")
      .select(PRODUCT_FIELDS)
      .eq("org_id", orgId)
      .order("name", { ascending: true })
      .limit(limit)

    if (!includeInactive) query = query.eq("is_active", true)
    if (q) query = query.ilike("name", `%${q}%`)

    const { data, error } = await query
    if (error) {
      if (isMissingSchema(error)) {
        log.warn("[Products] tabela ausente — rode a migration 20261067")
        return successResponse(request, { products: [], schema_missing: true })
      }
      throw error
    }

    return successResponse(request, { products: data ?? [] })
  } catch (error) {
    log.error("Products GET error:", error)
    return errorResponse(request, error, "crm-products-get")
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(160),
  code: z.string().max(60).nullable().optional(),
  description: z.string().max(600).nullable().optional(),
  unit_price: z.number().min(0).max(999_999_999),
  currency: z.string().length(3).optional().default("BRL"),
  billing_type: z.enum(["one_time", "recurring"]).optional().default("one_time"),
  recurring_interval: z.enum(["monthly", "quarterly", "semiannual", "yearly"]).nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrg(admin, user.id)
    if (!orgId) throw new AppError("Sem org membership", 403)

    const body = await request.json()
    const parsed = createSchema.parse(body)

    const { data, error } = await admin
      .from("crm_products")
      .insert({
        org_id: orgId,
        name: parsed.name.trim(),
        code: parsed.code?.trim() || null,
        description: parsed.description?.trim() || null,
        unit_price: parsed.unit_price,
        currency: parsed.currency,
        billing_type: parsed.billing_type,
        // recorrência só faz sentido em recurring; default mensal
        recurring_interval:
          parsed.billing_type === "recurring"
            ? (parsed.recurring_interval ?? "monthly")
            : null,
        created_by: user.id,
      })
      .select(PRODUCT_FIELDS)
      .single()

    if (error) {
      if (isMissingSchema(error)) {
        throw new AppError(
          "Catálogo de produtos ainda não habilitado no banco (migration 20261067).",
          422,
          "validation-error",
        )
      }
      if ((error as { code?: string }).code === "23505") {
        throw new AppError("Já existe um produto com esse nome.", 409, "conflict")
      }
      // CHECK antigo sem 'semiannual' — banco ainda na versão anterior.
      if (
        (error as { code?: string }).code === "23514" &&
        parsed.recurring_interval === "semiannual"
      ) {
        throw new AppError(
          "O intervalo Semestral precisa da migration 20261069 no banco — rode-a no Supabase e tente de novo.",
          422,
          "validation-error",
        )
      }
      throw error
    }

    log.info("[Products] criado", { id: data.id, name: data.name })
    return successResponse(request, { product: data }, { status: 201 })
  } catch (error) {
    log.error("Products POST error:", error)
    return errorResponse(request, error, "crm-products-post")
  }
}
