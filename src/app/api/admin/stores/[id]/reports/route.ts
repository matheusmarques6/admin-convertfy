/**
 * GET  /api/admin/stores/[id]/reports                 — lista
 * POST /api/admin/stores/[id]/reports                 — gera novo
 *
 * Tabela: client_monthly_reports
 *  - status: draft | sent | presented
 *  - snapshot: jsonb cristalizado no momento da geracao (dados imutaveis)
 *  - sections: jsonb { resumo: true, financeiro: true, ... }
 *  - tone: editorial | corporate | casual
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

const sectionsSchema = z.object({
  resumo: z.boolean().default(true),
  financeiro: z.boolean().default(true),
  email_perf: z.boolean().default(true),
  top_campanhas: z.boolean().default(true),
  top_flows: z.boolean().default(true),
  trabalho: z.boolean().default(true),
  proximos: z.boolean().default(true),
})

const createSchema = z.object({
  period_start: z.string().min(1, "period_start é obrigatório"),
  period_end: z.string().min(1, "period_end é obrigatório"),
  month_label: z.string().optional(),
  sections: sectionsSchema.default({
    resumo: true,
    financeiro: true,
    email_perf: true,
    top_campanhas: true,
    top_flows: true,
    trabalho: true,
    proximos: true,
  }),
  tone: z.enum(["editorial", "corporate", "casual"]).default("editorial"),
  // Aceita null pra UI poder mandar `proximos_passos: proximos || null`
  // sem disparar 400 Zod (era a causa principal do bug "Gerar falhou").
  proximos_passos: z.string().nullable().optional(),
  ai_filled: z.boolean().default(true),
})

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("client_monthly_reports")
      .select(
        "id, month_label, period_start, period_end, status, " +
          "generated_at, presented_at, sent_to, tone, ai_filled, pdf_url, " +
          "snapshot, generated_by, " +
          "generator:profiles!client_monthly_reports_generated_by_fkey(name, avatar_url)",
      )
      .eq("store_id", storeId)
      .order("period_start", { ascending: false })
    if (error) throw error
    return successResponse(request, { reports: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "store-reports-list")
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const raw = await request.json()
    const parsed = createSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(
        "Payload invalido: " +
          parsed.error.issues.map((i) => i.message).join("; "),
        400,
      )
    }
    const body = parsed.data

    // Deriva month_label se nao veio
    const ps = new Date(body.period_start + "T12:00:00")
    const monthLabel =
      body.month_label ||
      `${MONTH_LABELS[ps.getMonth()]} ${ps.getFullYear()}`

    // Snapshot real — chama os endpoints de email-platform internamente
    // pra cristalizar dados de campanhas, flows e KPIs no momento da geracao.
    // Se algo falhar (sem credencial, rate limit), cai pra snapshot parcial
    // pra nao bloquear a criacao do relatorio.
    //
    // IMPORTANTE: os endpoints email-platform/* esperam
    // `period=custom&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
    // (nao `start=` / `end=`).
    const origin = request.nextUrl.origin
    const periodParam = `period=custom&start_date=${body.period_start}&end_date=${body.period_end}`
    const cookie = request.headers.get("cookie") ?? ""

    async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
      try {
        const r = await fetch(url, { headers: { cookie } })
        if (!r.ok) return null
        return (await r.json()) as Record<string, unknown>
      } catch {
        return null
      }
    }

    const [reportRes, campaignsRes, flowsRes] = await Promise.all([
      fetchJson(`${origin}/api/integrations/email-platform/report?store_id=${storeId}&${periodParam}`),
      fetchJson(`${origin}/api/integrations/email-platform/campaigns?store_id=${storeId}&${periodParam}`),
      fetchJson(`${origin}/api/integrations/email-platform/flows?store_id=${storeId}&${periodParam}`),
    ])

    const rv = (reportRes?.revenue ?? {}) as Record<string, number>
    const overview = (reportRes?.overview ?? {}) as Record<string, number>
    const account = (reportRes?.account ?? {}) as Record<string, unknown>
    const campaignsList = ((campaignsRes?.campaigns ?? []) as Array<Record<string, unknown>>).slice(0, 10)
    const flowsList = ((flowsRes?.flows ?? []) as Array<Record<string, unknown>>).slice(0, 10)
    const cs = (campaignsRes?.summary ?? {}) as Record<string, number>
    const fs = (flowsRes?.summary ?? {}) as Record<string, number>

    const totalRevenue = Number(rv.storeRevenue || 0)
    const attributedRevenue = Number(rv.klaviyoAttributedRevenue || rv.totalRevenue || (cs.totalRevenue ?? 0) + (fs.totalRevenue ?? 0))

    const snapshot = {
      generated_at: new Date().toISOString(),
      period: { start: body.period_start, end: body.period_end },
      tone: body.tone,
      account: {
        currency: account.currency ?? "BRL",
        platform: reportRes?.platform ?? null,
      },
      kpis: {
        receita_total: totalRevenue,
        pedidos: Number(rv.storeOrders ?? 0),
        receita_atribuida: attributedRevenue,
        receita_campanhas: Number(rv.campaignRevenue ?? cs.totalRevenue ?? 0),
        receita_flows: Number(rv.flowRevenue ?? fs.totalRevenue ?? 0),
        atribuicao_pct: totalRevenue > 0 ? attributedRevenue / totalRevenue : 0,
        envios: Number(cs.totalSent ?? 0),
        open_rate: Number(cs.avgOpenRate ?? 0),
        click_rate: Number(cs.avgClickRate ?? 0),
        recovery_rate: Number(rv.recoveryRate ?? 0),
        total_campaigns: Number(cs.sentCampaigns ?? overview.campaignsInPeriod ?? 0),
        total_flows: Number(fs.liveFlows ?? overview.liveFlows ?? 0),
      },
      campaigns: campaignsList,
      flows: flowsList,
      insights: {},
    }

    const { data, error } = await admin
      .from("client_monthly_reports")
      .insert({
        store_id: storeId,
        month_label: monthLabel,
        period_start: body.period_start,
        period_end: body.period_end,
        sections: body.sections,
        tone: body.tone,
        snapshot,
        proximos_passos: body.proximos_passos || null,
        ai_filled: body.ai_filled,
        generated_by: user.id,
        status: "draft",
      })
      .select("id")
      .single()
    if (error) {
      // Unique (store_id, month_label) violation: surface 409 com msg clara
      // ao inves de 500 generico.
      if (error.code === "23505") {
        throw new AppError(
          `Já existe um relatório para ${monthLabel}. Abra o relatório existente ou ajuste o período.`,
          409,
        )
      }
      throw new AppError(`Erro ao salvar relatório: ${error.message}`, 500)
    }
    return successResponse(request, { id: data.id, month_label: monthLabel })
  } catch (error) {
    return errorResponse(request, error, "store-reports-create")
  }
}
