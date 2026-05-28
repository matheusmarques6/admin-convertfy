/**
 * GET /api/admin/briefings
 *
 * Lista todas as lojas ativas com seu briefing mais recente (latest version).
 * Usado pela página /admin/briefings.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("AdminBriefings")

export const dynamic = "force-dynamic"

interface StoreRow {
  id: string
  store_name: string
  store_url: string | null
  platform: string | null
  niche: string | null
  is_active: boolean
}

interface BriefingRow {
  store_id: string
  version: number
  marca: Record<string, unknown> | null
  briefing: Record<string, unknown> | null
  source: string
  created_at: string
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const [storesRes, briefingsRes] = await Promise.all([
      admin
        .from("client_stores")
        .select("id, store_name, store_url, platform, niche, is_active")
        .order("store_name", { ascending: true }),
      admin
        .from("store_briefings")
        .select("store_id, version, marca, briefing, source, created_at")
        .order("version", { ascending: false }),
    ])

    if (storesRes.error) throw storesRes.error
    if (briefingsRes.error) throw briefingsRes.error

    const stores = (storesRes.data ?? []) as StoreRow[]
    const briefings = (briefingsRes.data ?? []) as BriefingRow[]

    // Para cada loja pega o briefing de maior versão
    const latestByStore = new Map<string, BriefingRow>()
    for (const b of briefings) {
      if (!latestByStore.has(b.store_id)) {
        latestByStore.set(b.store_id, b)
      }
    }

    const rows = stores.map((s) => {
      const b = latestByStore.get(s.id) ?? null
      return {
        store_id: s.id,
        store_name: s.store_name,
        store_url: s.store_url,
        platform: s.platform,
        niche: s.niche,
        is_active: s.is_active,
        briefing_version: b?.version ?? null,
        briefing_source: b?.source ?? null,
        briefing_created_at: b?.created_at ?? null,
        marca: b?.marca ?? null,
        briefing: b?.briefing ?? null,
      }
    })

    return successResponse(request, {
      total: rows.length,
      with_briefing: rows.filter((r) => r.marca || r.briefing).length,
      rows,
    })
  } catch (error) {
    log.error("briefings.list error:", error)
    return errorResponse(request, error, "briefings-list")
  }
}
