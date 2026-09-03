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

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import {
  fetchSnapshotSources,
  buildReportSnapshot,
} from "@/lib/services/report-snapshot.service"
import { assertStoreInUserOrg } from "@/lib/api/store-org-guard"

export const dynamic = "force-dynamic"
// fetchSnapshotSources usa timeout de 75s por fetch (paralelo) + chamada
// opcional à Reports API — 120s dá margem, no padrão do resync (90s).
export const maxDuration = 120

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
  // "replace": deleta o relatorio existente (mesmo store_id+month_label) antes
  // de criar o novo. UI envia quando user escolhe "Sobrescrever" no dialog 409.
  replace: z.boolean().optional(),
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
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    // service role bypassa RLS — a rota escopa: admin OU loja da org
    await assertStoreInUserOrg(admin, user.id, storeId)

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
    // gerar/substituir é escrita destrutiva — mesma régua do GET
    await assertStoreInUserOrg(admin, user.id, storeId)

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

    // Snapshot real — o módulo compartilhado (report-snapshot.service) faz
    // o fan-out para os endpoints internos + caches e resolve os KPIs com
    // presença explícita (F1-F5 da auditoria). Se algo falhar (sem
    // credencial, rate limit), cai pra snapshot parcial (campos null) pra
    // nao bloquear a criacao do relatorio.
    const sources = await fetchSnapshotSources({
      origin: request.nextUrl.origin,
      cookie: request.headers.get("cookie") ?? "",
      storeId,
      periodStart: body.period_start,
      periodEnd: body.period_end,
      admin,
    })
    const core = buildReportSnapshot({
      sources,
      periodStart: body.period_start,
      periodEnd: body.period_end,
    })

    const snapshot = {
      ...core,
      tone: body.tone,
      insights: {},
    }

    // Pre-flight: existe relatorio do mesmo mes?
    const { data: existing } = await admin
      .from("client_monthly_reports")
      .select("id, status, generated_at")
      .eq("store_id", storeId)
      .eq("month_label", monthLabel)
      .maybeSingle()

    if (existing && !body.replace) {
      // Payload rico pra UI oferecer "Abrir" / "Sobrescrever" / "Cancelar".
      // Nao uso errorResponse aqui porque preciso enviar existing_report_id
      // junto do erro (estrutura nao-padrao).
      return NextResponse.json(
        {
          error: `Já existe um relatório para ${monthLabel}.`,
          code: "duplicate-month",
          existing_report_id: existing.id,
          existing_status: existing.status,
          existing_generated_at: existing.generated_at,
          month_label: monthLabel,
        },
        { status: 409 },
      )
    }

    // Se replace=true e existe, deleta o antigo antes do insert.
    if (existing && body.replace) {
      const { error: delErr } = await admin
        .from("client_monthly_reports")
        .delete()
        .eq("id", existing.id)
      if (delErr) {
        throw new AppError(
          `Erro ao remover relatorio anterior: ${delErr.message}`,
          500,
        )
      }
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
      // 23505 nao deveria mais acontecer porque ja fizemos pre-check acima,
      // mas mantemos o fallback caso haja race (2 POSTs simultaneos).
      if (error.code === "23505") {
        return NextResponse.json(
          {
            error: `Já existe um relatório para ${monthLabel}.`,
            code: "duplicate-month-race",
            month_label: monthLabel,
          },
          { status: 409 },
        )
      }
      throw new AppError(`Erro ao salvar relatório: ${error.message}`, 500)
    }
    return successResponse(request, { id: data.id, month_label: monthLabel })
  } catch (error) {
    return errorResponse(request, error, "store-reports-create")
  }
}
