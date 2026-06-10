/**
 * GET /api/admin/campaign-central/calendar
 *
 * Datas comemorativas na janela (?days=25 default, max 90) dos países
 * das lojas ativas da org + contagem de sugestões ancoradas em cada data
 * (por send_date OU commemorative_date_id).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import {
  resolveNextOccurrence,
  normalizeCountry,
} from "@/lib/services/campaign-central/cycle-context.service"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "campaign-central:calendar")

    const days = Math.min(Number(request.nextUrl.searchParams.get("days")) || 25, 90)
    const admin = createAdminClient()
    const now = new Date()

    const { data: stores, error: storesErr } = await admin
      .from("client_stores")
      .select("country")
      .eq("org_id", ctx.orgId)
      .eq("is_active", true)
      .not("omnisend_api_key", "is", null)
    if (storesErr) throw storesErr

    const countries = Array.from(
      new Set((stores ?? []).map((s) => normalizeCountry(s.country as string | null))),
    )
    if (countries.length === 0) countries.push("BR")

    const [datesRes, suggestionsRes] = await Promise.all([
      admin
        .from("commemorative_dates")
        .select("*")
        .in("country", countries)
        .eq("is_active", true),
      admin
        .from("campaign_suggestions")
        .select("id, send_date, commemorative_date_id, status")
        .eq("org_id", ctx.orgId)
        .in("status", ["suggested", "approved"])
        .not("send_date", "is", null),
    ])
    if (datesRes.error) throw datesRes.error
    if (suggestionsRes.error) throw suggestionsRes.error

    const suggestionsByDateId = new Map<string, number>()
    const suggestionsBySendDate = new Map<string, number>()
    for (const s of suggestionsRes.data ?? []) {
      if (s.commemorative_date_id) {
        suggestionsByDateId.set(
          s.commemorative_date_id as string,
          (suggestionsByDateId.get(s.commemorative_date_id as string) ?? 0) + 1,
        )
      }
      if (s.send_date) {
        suggestionsBySendDate.set(
          s.send_date as string,
          (suggestionsBySendDate.get(s.send_date as string) ?? 0) + 1,
        )
      }
    }

    const startOfDay = (d: Date) =>
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

    const dates = []
    for (const d of datesRes.data ?? []) {
      const next = resolveNextOccurrence(
        d.month_day as string,
        (d.year as number | null) ?? null,
        now,
      )
      if (!next) continue
      const inDays = Math.round(
        (startOfDay(next).getTime() - startOfDay(now).getTime()) / 86_400_000,
      )
      if (inDays < 0 || inDays > days) continue
      const iso = next.toISOString().slice(0, 10)
      dates.push({
        id: d.id,
        country: d.country,
        date: iso,
        in_days: inDays,
        name: d.name,
        impact: d.impact,
        category: d.category,
        note: d.note,
        tips: d.tips,
        best_campaign_types: d.best_campaign_types,
        suggestions_count:
          (suggestionsByDateId.get(d.id as string) ?? 0) +
          (suggestionsBySendDate.get(iso) ?? 0),
      })
    }
    dates.sort((a, b) => a.in_days - b.in_days)

    return successResponse(request, { dates, countries, window_days: days })
  } catch (error) {
    return errorResponse(request, error, "campaign-central:calendar")
  }
}
