import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { buildFullDiagnostic } from "@/lib/services/diagnostic"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

function thisMonday(): string {
  const now = new Date()
  const dow = now.getUTCDay()
  const offset = dow === 0 ? 6 : dow - 1
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - offset)
  monday.setUTCHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

/**
 * GET /api/ritual/stores/[storeId]
 * Retorna todos os dados necessarios para o modal de diagnostico do ritual.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const { storeId } = await params
    const supabase = await createClient()
    await requireAuth(supabase)
    const admin = createAdminClient()

    // 1. Store basic data + client join
    const { data: storeRaw, error: storeErr } = await admin
      .from("client_stores")
      .select(
        "id, store_name, niche, platform, email_platform, currency, mrr_cents, contract_end_date, " +
          "client:clients!client_stores_client_id_fkey(name, owner_id, " +
          "owner:profiles!clients_owner_id_fkey(name))",
      )
      .eq("id", storeId)
      .maybeSingle()

    if (storeErr || !storeRaw) throw new AppError("Loja nao encontrada", 404)

    const raw = storeRaw as unknown as {
      id: string
      store_name: string
      niche: string | null
      platform: string | null
      email_platform: string | null
      currency: string | null
      mrr_cents: number | null
      contract_end_date: string | null
      client: { name: string; owner_id: string | null; owner: { name: string } | null } | null
    }
    const store = {
      id: raw.id,
      store_name: raw.store_name,
      niche: raw.niche,
      platform: raw.platform,
      email_platform: raw.email_platform,
      currency: raw.currency,
      mrr_cents: raw.mrr_cents,
      contract_end_date: raw.contract_end_date,
      client_name: raw.client?.name ?? null,
      owner_name: raw.client?.owner?.name ?? null,
    }

    // 2. Health data from weekly_pipeline_states (current week)
    const week = request.nextUrl.searchParams.get("week_start") ?? thisMonday()

    const { data: healthRaw } = await admin
      .from("weekly_pipeline_states")
      .select("health_state, health_score, flag_reason")
      .eq("store_id", storeId)
      .eq("week_start", week)
      .eq("is_active", true)
      .maybeSingle()

    const health = healthRaw ?? { health_state: null, health_score: null, flag_reason: null }

    // 3. Latest 3 weekly_reports
    // 4. Recent campaigns (30d)
    // 5. Automations (30d)
    const [reportsRes, campaignsRes, automationsRes] = await Promise.all([
      admin
        .from("weekly_reports")
        .select("id, week_start, highlights, concerns, metrics, ai_summary")
        .eq("store_id", storeId)
        .order("week_start", { ascending: false })
        .limit(3),
      admin
        .from("omnisend_campaign_metrics")
        .select(
          "campaign_id, campaign_name, send_time, subject, recipients, delivered, " +
            "opened, clicked, conversions, conversion_value, open_rate, click_rate, bounce_rate",
        )
        .eq("store_id", storeId)
        .eq("period_label", "30d")
        .order("send_time", { ascending: false })
        .limit(10),
      admin
        .from("omnisend_flow_metrics")
        .select(
          "flow_id, flow_name, flow_status, trigger_type, recipients, delivered, " +
            "opened, clicked, conversions, conversion_value, open_rate, click_rate",
        )
        .eq("store_id", storeId)
        .eq("period_label", "30d")
        .order("conversion_value", { ascending: false })
        .limit(10),
    ])

    const periodParam = request.nextUrl.searchParams.get("period")
    const period = (["7d", "30d", "90d", "12m"].includes(periodParam ?? "") ? periodParam : "30d") as "7d" | "30d" | "90d" | "12m"

    let diagnostic = null
    try {
      diagnostic = await buildFullDiagnostic(admin, storeId, store.store_name, store.currency ?? "BRL", period)
    } catch {
      diagnostic = null
    }

    return successResponse(request, {
      store,
      health,
      reports: reportsRes.data ?? [],
      campaigns: campaignsRes.data ?? [],
      automations: automationsRes.data ?? [],
      diagnostic,
    })
  } catch (error) {
    return errorResponse(request, error, "RitualStoreData")
  }
}
