import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * GET /api/cs-crm/cadences
 * Lista todas as lojas com sua cadência atual (override OU default weekly).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const admin = createAdminClient()

    const { data: member } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if (!member) throw new AppError("Sem org", 403)

    // Stores + overrides em paralelo
    const { data: storesRaw } = await admin
      .from("client_stores")
      .select(
        "id, store_name, mrr_cents, is_active, " +
          "client:clients!client_stores_client_id_fkey(id, name, owner:profiles!clients_owner_id_fkey(id, name))",
      )
      .eq("org_id", member.org_id)
      .eq("is_active", true)

    const { data: overridesRaw } = await admin
      .from("store_cadence_overrides")
      .select("id, store_id, frequency, reason, configured_at, expires_at, configured_by_profile:profiles!store_cadence_overrides_configured_by_fkey(name)")
      .eq("org_id", member.org_id)

    const overrides = (overridesRaw ?? []) as unknown as Array<{
      id: string
      store_id: string
      frequency: string
      reason: string
      configured_at: string
      expires_at: string | null
      configured_by_profile: { name: string } | null
    }>

    const overrideMap = new Map(overrides.map((o) => [o.store_id, o]))

    const items = (storesRaw ?? []).map((s) => {
      const sx = s as unknown as {
        id: string
        store_name: string
        mrr_cents: number | null
        client: { id: string; name: string; owner: { id: string; name: string } | null } | null
      }
      const override = overrideMap.get(sx.id)
      return {
        store_id: sx.id,
        store_name: sx.store_name,
        mrr_value:
          sx.mrr_cents && sx.mrr_cents > 0
            ? Math.round(sx.mrr_cents / 100)
            : null,
        client_name: sx.client?.name ?? null,
        owner_name: sx.client?.owner?.name ?? null,
        frequency: override?.frequency ?? "weekly",
        is_default: !override,
        reason: override?.reason ?? null,
        configured_at: override?.configured_at ?? null,
        configured_by: override?.configured_by_profile?.name ?? null,
        override_id: override?.id ?? null,
      }
    })

    // Estatísticas
    const stats = {
      weekly: items.filter((i) => i.frequency === "weekly").length,
      biweekly: items.filter((i) => i.frequency === "biweekly").length,
      monthly: items.filter((i) => i.frequency === "monthly").length,
      paused: items.filter((i) => i.frequency === "paused").length,
      total: items.length,
      exceptions: items.filter((i) => !i.is_default).length,
    }

    return successResponse(request, { items, stats })
  } catch (error) {
    return errorResponse(request, error, "CSCRMCadences")
  }
}

/**
 * POST /api/cs-crm/cadences
 * Cria/atualiza override de cadência pra uma loja específica.
 * Body: { store_id, frequency, reason, expires_at? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const admin = createAdminClient()

    const body = await request.json()
    if (!body.store_id) throw new AppError("store_id obrigatório", 400)
    if (!["weekly", "biweekly", "monthly", "paused"].includes(body.frequency)) {
      throw new AppError("frequency inválido", 400)
    }
    if (!body.reason?.trim()) throw new AppError("reason obrigatório", 400)

    const { data: store } = await admin
      .from("client_stores")
      .select("org_id")
      .eq("id", body.store_id)
      .maybeSingle()
    if (!store) throw new AppError("Loja não encontrada", 404)

    // Se frequency = "weekly" (default) → remove override em vez de criar
    if (body.frequency === "weekly") {
      await admin
        .from("store_cadence_overrides")
        .delete()
        .eq("store_id", body.store_id)
      return successResponse(request, { frequency: "weekly", is_default: true })
    }

    const { data, error } = await admin
      .from("store_cadence_overrides")
      .upsert(
        {
          org_id: store.org_id,
          store_id: body.store_id,
          frequency: body.frequency,
          reason: body.reason,
          configured_by: user.id,
          configured_at: new Date().toISOString(),
          expires_at: body.expires_at ?? null,
        },
        { onConflict: "store_id" },
      )
      .select()
      .single()

    if (error) throw new AppError(error.message, 500)
    return successResponse(request, { override: data })
  } catch (error) {
    return errorResponse(request, error, "CSCRMCadences")
  }
}
