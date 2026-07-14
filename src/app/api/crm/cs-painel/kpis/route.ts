/**
 * GET /api/crm/cs-painel/kpis
 *
 * KPIs do topo do Painel de Customer Success:
 *   - Carteira ativa (lojas is_active) + delta no mes
 *   - Saude media (avg health_score) + delta
 *   - Lojas em risco (health_score < 50) + delta
 *
 * Valores sao computados AO VIVO de client_stores (sempre corretos).
 * Os deltas usam o snapshot de crm_org_snapshots do 1o dia do mes como
 * baseline (best-effort — null se ainda nao ha snapshot).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("CsPainelKpis")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    // ── Valores ao vivo ────────────────────────────────────────────────
    const { data: stores } = await admin
      .from("client_stores")
      .select("id, health_score")
      .eq("is_active", true)
      .returns<Array<{ id: string; health_score: number | null }>>()

    const rows = stores || []
    const activeStores = rows.length

    const scored = rows.filter((s) => s.health_score != null) as Array<{
      health_score: number
    }>
    const avgHealth =
      scored.length > 0
        ? Math.round(
            scored.reduce((a, s) => a + s.health_score, 0) / scored.length,
          )
        : null
    const atRisk = scored.filter((s) => s.health_score < 50).length

    // ── Baseline (snapshot do inicio do mes) para os deltas ────────────
    let baseline: {
      active_stores_count: number | null
      avg_health_score: number | null
      critical_health_count: number | null
    } | null = null

    try {
      const orgId = await resolveOrgId(user.id)
      const now = new Date()
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      )
      const monthStartStr = monthStart.toISOString().slice(0, 10)

      // Pega o snapshot no 1o dia do mes; se nao houver, o mais antigo
      // deste mes (fallback tolerante).
      const { data: snap } = await admin
        .from("crm_org_snapshots")
        .select("active_stores_count, avg_health_score, critical_health_count, day")
        .eq("org_id", orgId)
        .gte("day", monthStartStr)
        .order("day", { ascending: true })
        .limit(1)
        .maybeSingle()

      if (snap) {
        baseline = {
          active_stores_count: snap.active_stores_count ?? null,
          avg_health_score:
            snap.avg_health_score != null ? Math.round(snap.avg_health_score) : null,
          critical_health_count: snap.critical_health_count ?? null,
        }
      }
    } catch (e) {
      // Sem org ou sem snapshot — deltas ficam null.
      log.warn("Baseline de snapshot indisponivel", { message: (e as Error).message })
    }

    const delta = (current: number | null, base: number | null) =>
      current != null && base != null ? current - base : null

    return successResponse(request, {
      carteira_ativa: {
        value: activeStores,
        delta: delta(activeStores, baseline?.active_stores_count ?? null),
      },
      saude_media: {
        value: avgHealth,
        delta: delta(avgHealth, baseline?.avg_health_score ?? null),
      },
      lojas_risco: {
        value: atRisk,
        // Menos lojas em risco = melhora → o front decide o tom pela direcao.
        delta: delta(atRisk, baseline?.critical_health_count ?? null),
      },
    })
  } catch (error) {
    log.error("CS painel KPIs error:", error)
    return errorResponse(request, error, "cs-painel-kpis")
  }
}
