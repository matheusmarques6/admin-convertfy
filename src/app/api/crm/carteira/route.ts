/**
 * GET /api/crm/carteira — payload consolidado da "Gestão de Carteira"
 * (pipeline-mãe das lojas no CS).
 *
 * Uma rota só porque o board inteiro lê as MESMAS lojas: etapas do
 * pipeline, deal por loja (etapa/motivo), CSM, MRR, receita 30d
 * (atribuída/total/% via store_revenue_summary — mesma fonte do
 * dashboard), mensalidade + histórico (unified_invoices por cliente) e
 * régua de calls (last/next_feedback_date, alimentados por
 * store_feedback_calls e meetings via trigger).
 *
 * Ações NÃO moram aqui — o board usa as rotas existentes:
 * move (/api/crm/deals/[id]/move), motivo (PATCH deal custom_fields),
 * call (POST /api/stores/[id]/calls), etapas (/api/crm/pipelines/[id]/stages*).
 */

import { NextRequest } from "next/server"
import { withTiming } from "@/lib/api/with-timing"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { getCsPipeline } from "@/lib/cs-pipelines"
import { getUnifiedRevenue } from "@/lib/services/unified-metrics.service"
import { convertToBRL } from "@/lib/services/exchange-rate.service"
import {
  callTone,
  daysSince,
  mensalidadeFromInvoices,
  nextCallLabel,
  sinceLabel,
  type InvoiceLite,
} from "@/lib/services/cs-carteira"
import { logger } from "@/lib/logger"

const log = logger.child("CsCarteira")

export const dynamic = "force-dynamic"

interface DealRow {
  id: string
  stage_id: string
  status: string
  lost_reason: string | null
  custom_fields: Record<string, unknown> | null
  last_stage_changed_at: string | null
  updated_at: string | null
  owner: { id: string; name: string | null } | { id: string; name: string | null }[] | null
  store: {
    id: string
    org_id: string
    store_name: string
    health_score: number | null
    mrr_cents: number | null
    is_active: boolean | null
    contract_start_date: string | null
    created_at: string | null
    last_feedback_date: string | null
    next_feedback_date: string | null
    client_id: string | null
    client: { id: string; name: string | null } | { id: string; name: string | null }[] | null
  } | null
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

async function handleGet(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const pipeline = await getCsPipeline("carteira")
    if (!pipeline) {
      // Seed 20260507 não rodou nesta base — a UI mostra o aviso.
      return successResponse(request, { pipeline: null, stages: [], cards: [] })
    }

    const now = Date.now()

    const [stagesResp, dealsResp] = await Promise.all([
      admin
        .from("pipeline_stages")
        .select("id, name, color, \"order\", stage_type, description")
        .eq("pipeline_id", pipeline.id)
        .order("order", { ascending: true }),
      admin
        .from("deals")
        .select(
          `
          id, stage_id, status, lost_reason, custom_fields,
          last_stage_changed_at, updated_at,
          owner:profiles!deals_owner_id_fkey (id, name),
          store:client_stores!inner (
            id, org_id, store_name, health_score, mrr_cents, is_active,
            contract_start_date, created_at, last_feedback_date, next_feedback_date,
            client_id, client:clients (id, name)
          )
        `,
        )
        .eq("pipeline_id", pipeline.id)
        .eq("store.org_id", orgId)
        .neq("status", "won"),
    ])

    if (stagesResp.error) throw stagesResp.error
    if (dealsResp.error) throw dealsResp.error

    const stages = (stagesResp.data ?? []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      color: (s.color as string | null) ?? null,
      order: s.order as number,
      stage_type: (s.stage_type as string | null) ?? "open",
      description: (s.description as string | null) ?? null,
    }))

    const deals = (dealsResp.data ?? []) as unknown as DealRow[]
    const withStore = deals.filter((d) => d.store)
    const storeIds = withStore.map((d) => d.store!.id)
    const clientIds = [...new Set(withStore.map((d) => d.store!.client_id).filter(Boolean))] as string[]

    // Receita 30d (mesma fonte/período do dashboard de lojas) + faturas
    // do cliente, em paralelo.
    const [revenueRows, invoicesResp] = await Promise.all([
      storeIds.length > 0
        ? getUnifiedRevenue(admin, orgId, ["30d"], storeIds).catch((err) => {
            log.warn("revenue indisponível", { error: err instanceof Error ? err.message : String(err) })
            return []
          })
        : Promise.resolve([]),
      clientIds.length > 0
        ? admin
            .from("unified_invoices")
            .select("client_id, due_date, payment_date, status, amount")
            .in("client_id", clientIds)
            .order("due_date", { ascending: false })
            .limit(Math.min(clientIds.length * 8, 600))
        : Promise.resolve({ data: [], error: null } as const),
    ])

    if ("error" in invoicesResp && invoicesResp.error) {
      log.warn("unified_invoices indisponível", { error: invoicesResp.error.message })
    }
    const invoicesByClient = new Map<string, InvoiceLite[]>()
    for (const inv of ((invoicesResp as { data: unknown[] | null }).data ?? []) as Array<{
      client_id: string
      due_date: string | null
      payment_date: string | null
      status: string
      amount: number
    }>) {
      const list = invoicesByClient.get(inv.client_id) ?? []
      list.push({
        due_date: inv.due_date,
        payment_date: inv.payment_date,
        status: inv.status,
        amount: Number(inv.amount) || 0,
      })
      invoicesByClient.set(inv.client_id, list)
    }

    const revenueByStore = new Map(revenueRows.map((r) => [r.store_id, r]))

    const cards = await Promise.all(
      withStore.map(async (d) => {
        const store = d.store!
        const client = one(store.client)
        const owner = one(d.owner)
        const rev = revenueByStore.get(store.id)
        const currency = rev?.currency || "BRL"
        const attributed = rev?.total_revenue ?? 0
        const total = (rev?.store_total_revenue || 0) || attributed
        const [attributedBRL, totalBRL] = await Promise.all([
          convertToBRL(attributed, currency),
          convertToBRL(total, currency),
        ])
        const pct = totalBRL > 0 ? (attributedBRL / totalBRL) * 100 : null

        const mensalidade = store.client_id
          ? mensalidadeFromInvoices(invoicesByClient.get(store.client_id) ?? [], now)
          : { status: "none" as const, history: [] }

        const callDays = daysSince(store.last_feedback_date, now)
        const cf = (d.custom_fields ?? {}) as Record<string, unknown>

        return {
          deal_id: d.id,
          stage_id: d.stage_id,
          deal_status: d.status,
          store_id: store.id,
          store_name: store.store_name,
          client_id: store.client_id,
          client_name: client?.name ?? null,
          csm_name: owner?.name ?? null,
          mrr: (store.mrr_cents ?? 0) / 100,
          health_score: store.health_score,
          since: sinceLabel(store.contract_start_date ?? store.created_at),
          pct: pct != null ? Math.round(pct * 10) / 10 : null,
          attributed_brl: Math.round(attributedBRL),
          total_brl: Math.round(totalBRL),
          revenue_synced: Boolean(rev),
          mensalidade: mensalidade.status,
          mensalidade_history: mensalidade.history,
          call_days: callDays,
          call_tone: callTone(callDays),
          next_call: nextCallLabel(store.next_feedback_date, now),
          // Motivo de pausa/churn: lost_reason (churn grava no move;
          // pausa grava via PATCH do deal) com fallback legado.
          motivo:
            d.lost_reason ||
            (typeof cf.carteira_reason === "string" && cf.carteira_reason) ||
            null,
          // "Pausada em": momento da última troca de etapa.
          stage_changed_at: d.last_stage_changed_at ?? d.updated_at ?? null,
          manual_stage: cf.manual_stage === true,
          // O PATCH de deal SUBSTITUI custom_fields — o board precisa do
          // objeto inteiro pra mesclar a flag manual_stage sem perder
          // health_score/last_sync gravados pelo cron.
          custom_fields: cf,
        }
      }),
    )

    return successResponse(request, {
      pipeline: { id: pipeline.id, name: pipeline.name },
      stages,
      cards,
    })
  } catch (error) {
    return errorResponse(request, error, "crm-carteira")
  }
}

export const GET = withTiming("crm/carteira", handleGet)
