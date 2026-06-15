/**
 * GET /api/admin/campaign-central/calendar
 *
 * Datas comemorativas na janela (?days=25 default, max 90) dos países
 * das lojas ativas da org + contagem de sugestões ancoradas em cada data
 * (por send_date OU commemorative_date_id) + campanhas (suggestions com
 * send_date e pipeline_items com deploy_config.send_date) pra render
 * direto no calendário, com marcador de rascunho.
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

    const [datesRes, suggestionsRes, pipelineRes] = await Promise.all([
      admin
        .from("commemorative_dates")
        .select("*")
        .in("country", countries)
        .eq("is_active", true),
      admin
        .from("campaign_suggestions")
        .select(
          "id, title, type, status, send_date, commemorative_date_id, targets, copy_results",
        )
        .eq("org_id", ctx.orgId)
        .in("status", ["suggested", "approved"])
        .not("send_date", "is", null),
      // Pipeline items podem ter send_date em deploy_config (sincronizado
      // com suggestion.send_date pela rota PATCH update_draft). Lemos pra
      // garantir que itens cuja sugestão foi removida/limpa ainda apareçam.
      admin
        .from("campaign_pipeline_items")
        .select("id, title, deploy_config, copy_data, tags")
        .eq("org_id", ctx.orgId)
        .contains("tags", ["central"]),
    ])
    if (datesRes.error) throw datesRes.error
    if (suggestionsRes.error) throw suggestionsRes.error
    if (pipelineRes.error) throw pipelineRes.error

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

    // Monta lista de cards de CAMPANHA pro calendário (suggestions tem
    // precedência; pipeline_items entram pra casos onde a sugestão sumiu).
    type CalendarCampaign = {
      id: string
      title: string
      type: string
      send_date: string
      is_draft: boolean
      country: string | null
      store_count: number
    }
    const campaignsByDate = new Map<string, CalendarCampaign[]>()
    const seenSuggestions = new Set<string>()

    for (const s of suggestionsRes.data ?? []) {
      if (!s.send_date) continue
      const targets = ((s.targets as Array<{ country?: string | null }> | null) ?? [])
      const country = targets[0]?.country ?? null
      const goodCount = Object.values(
        (s.copy_results as { test?: Record<string, { quality?: "good" | null }> } | null)
          ?.test ?? {},
      ).filter((e) => e.quality === "good").length
      const card: CalendarCampaign = {
        id: s.id as string,
        title: s.title as string,
        type: s.type as string,
        send_date: s.send_date as string,
        // Rascunho = ainda 'suggested' OU 'approved' mas sem piloto good
        // (caso raro — aprovação direta exige good no novo fluxo).
        is_draft: s.status === "suggested" || (s.status === "approved" && goodCount === 0),
        country,
        store_count: targets.length,
      }
      seenSuggestions.add(s.id as string)
      const arr = campaignsByDate.get(card.send_date) ?? []
      arr.push(card)
      campaignsByDate.set(card.send_date, arr)
    }

    // Fallback: pipeline_items cuja sugestão não aparece (apagada/limpa)
    // mas que ainda têm send_date no deploy_config. Evita "buraco" no calendário.
    for (const it of pipelineRes.data ?? []) {
      const cfg = (it.deploy_config as Record<string, unknown> | null) ?? {}
      const sendDate = cfg.send_date as string | null | undefined
      if (!sendDate) continue
      const cd = (it.copy_data as Record<string, unknown> | null) ?? {}
      const sid = cd.suggestion_id as string | undefined
      if (sid && seenSuggestions.has(sid)) continue
      const tags = (it.tags as string[] | null) ?? []
      const type = tags.find((t) => t !== "central") ?? "avulsa"
      const card: CalendarCampaign = {
        id: it.id as string,
        title: it.title as string,
        type,
        send_date: sendDate,
        is_draft: false,
        country: null,
        store_count: 0,
      }
      const arr = campaignsByDate.get(card.send_date) ?? []
      arr.push(card)
      campaignsByDate.set(card.send_date, arr)
    }

    // Flatten ordenado por data
    const campaigns: CalendarCampaign[] = []
    for (const [, arr] of [...campaignsByDate.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      campaigns.push(...arr)
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

    return successResponse(request, { dates, campaigns, countries, window_days: days })
  } catch (error) {
    return errorResponse(request, error, "campaign-central:calendar")
  }
}
