/**
 * GET  /api/crm/ad-spend   — lista lançamentos de investimento da org
 * POST /api/crm/ad-spend   — cria lançamento (dia × plataforma × conta)
 *
 * Investimento em tráfego pago do funil comercial. Lançamento manual
 * por enquanto; a UNIQUE (org, day, platform, account_name) evita
 * duplicidade acidental e deixa a estrutura pronta pra sync automático
 * via Meta/Google Ads API no futuro.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmAdSpend")

export const dynamic = "force-dynamic"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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
    if (!orgId) return successResponse(request, { entries: [] })

    const sp = request.nextUrl.searchParams
    const from = sp.get("from")
    const to = sp.get("to")

    let q = admin
      .from("crm_ad_spend")
      .select("id, day, platform, account_name, amount, notes, created_at")
      .eq("org_id", orgId)
      .order("day", { ascending: false })
      .limit(500)
    if (from && DATE_RE.test(from)) q = q.gte("day", from)
    if (to && DATE_RE.test(to)) q = q.lte("day", to)

    const { data, error } = await q
    if (error) throw error
    return successResponse(request, { entries: data ?? [] })
  } catch (error) {
    log.error("Ad spend GET error:", error)
    return errorResponse(request, error, "crm-ad-spend-get")
  }
}

const createSchema = z.object({
  day: z.string().regex(DATE_RE, "Data no formato YYYY-MM-DD"),
  platform: z.enum(["meta", "google", "tiktok", "other"]).default("meta"),
  account_name: z.string().trim().max(120).default(""),
  amount: z.number().min(0).max(999_999_999),
  notes: z.string().max(500).nullable().optional(),
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
      .from("crm_ad_spend")
      .insert({
        ...parsed,
        notes: parsed.notes ?? null,
        org_id: orgId,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (error) {
      if (error.code === "23505") {
        throw new AppError(
          "Já existe um lançamento para essa conta/plataforma nesse dia. Edite o existente.",
          409,
          "conflict",
        )
      }
      throw error
    }

    log.info("[AdSpend] created", { id: data.id, day: parsed.day, amount: parsed.amount })
    return successResponse(request, { id: data.id }, { status: 201 })
  } catch (error) {
    log.error("Ad spend POST error:", error)
    return errorResponse(request, error, "crm-ad-spend-post")
  }
}
