/**
 * POST /api/stores/revenue-audit
 *
 * Confronta, para UMA loja e UMA janela, o número que publicamos com o
 * que a Omnisend responde agora — e mostra a memória de cálculo.
 *
 * ── Por que existe ────────────────────────────────────────────────────
 *
 * Relatado em 10/09/2026: o relatório da Blue Wolf publicou US$ 51,5 mil
 * de receita atribuída em agosto contra $51.176,38 no painel, e o
 * faturamento total US$ 214,1 mil contra $213.193,59. A pergunta "por
 * que não bate" não tinha como ser respondida pela tela: a janela
 * enviada, o fuso usado no corte e qual API respondeu cada metade só
 * existiam no log.
 *
 * É a irmã da auditoria de moeda (`/api/stores/currency-audit`), com a
 * mesma divisão: lá é leitura de banco e tem que ser rápida; aqui é o
 * botão que paga a chamada de rede.
 *
 * ── O que foi medido antes de escrever isto (conta Treuquell, MCP) ────
 *
 * A plataforma responde de forma consistente, e vale registrar porque
 * três comentários no repositório afirmavam o contrário:
 *
 *  - `month` e `day` somam IGUAL (21.844,93 nos dois em agosto/2026);
 *  - buckets são recortados pela janela, não devolvidos inteiros;
 *  - `to` é exclusivo de verdade;
 *  - offsets misturados entre `from` e `to` não inflaram nada;
 *  - `interval: "custom"` é ignorado pela Statistics API.
 *
 * Por isso esta rota confronta o NOSSO número com o da plataforma em
 * vez de tentar adivinhar qual configuração de chamada estaria certa.
 *
 * ── Custo ─────────────────────────────────────────────────────────────
 *
 * Duas chamadas de analytics (Statistics + Reports) mais uma de brand,
 * contra um limite de 10/min e 55/dia POR CONTA. É botão, não rota de
 * carregamento de tela — e por isso não roda sozinha em lugar nenhum.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { getOmnisendBrand } from "@/lib/integrations/omnisend/client"
import {
  fetchOmnisendReports,
  fetchOmnisendStatistics,
} from "@/lib/services/omnisend-sync.service"
import { resolverFusoDaLoja, omnisendDateRange } from "@/lib/integrations/omnisend/timezone"
import { COUNTRY_TIMEZONE } from "@/lib/constants/onboarding"
import {
  causasProvaveis,
  compararMetrica,
  type Divergencia,
} from "@/lib/integrations/omnisend/auditoria-receita"
import { avaliarPeriodo } from "@/lib/reports/periodo"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const log = logger.child("RevenueAudit")

export interface RevenueAuditResult {
  storeId: string
  storeName: string
  currency: string | null
  /** A janela EXATA que foi enviada à plataforma, com offset. */
  janela: {
    from: string
    to: string
    fusoUsado: string
    fusoAssumido: boolean
    /** "cadastro" = veio da plataforma; "pais"/"padrao" = adivinhado. */
    procedenciaDoFuso: "cadastro" | "pais" | "padrao"
  }
  fuso: { cadastro: string | null; brand: string | null; divergem: boolean }
  moeda: { cadastro: string | null; brand: string | null; divergem: boolean }
  /** O que a plataforma responde agora, por API. */
  plataforma: {
    /** Statistics API — agrupa por data do PEDIDO. */
    porDataDoPedido: { faturamentoTotal: number; pedidos: number; receitaAtribuida: number; pedidosAtribuidos: number } | null
    /** Reports API — agrupa por data de ENVIO. É o que o painel mostra. */
    porDataDeEnvio: { receitaAtribuida: number; pedidosAtribuidos: number } | null
  }
  /** O que está publicado no nosso cache para este período. */
  nosso: {
    faturamentoTotal: number | null
    pedidos: number | null
    receitaAtribuida: number | null
    pedidosAtribuidos: number | null
    syncStatus: string | null
    syncError: string | null
    fetchedAt: string | null
  } | null
  divergencias: Divergencia[]
  causas: string[]
  avisosDoPeriodo: string[]
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)
    if (!orgId) throw new AppError("Organização não encontrada", 403)

    const body = (await request.json()) as {
      store_id?: string
      start?: string
      end?: string
    }
    if (!body.store_id) throw new AppError("store_id é obrigatório", 400)
    if (!body.start || !body.end) throw new AppError("start e end são obrigatórios", 400)

    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
    const periodo = avaliarPeriodo(body.start, body.end, hoje)
    if (!periodo.ok) throw new AppError(periodo.erro ?? "Período inválido", 400)

    const admin = createAdminClient()
    const { data: loja } = await admin
      .from("client_stores")
      .select("id, store_name, org_id, currency, timezone, country, omnisend_api_key")
      .eq("id", body.store_id)
      .maybeSingle()

    if (!loja) throw new AppError("Loja não encontrada", 404)
    // Escopo por org: o admin client bypassa RLS, então a checagem é aqui.
    if (loja.org_id !== orgId) throw new AppError("Loja não encontrada", 404)

    const apiKey = String(loja.omnisend_api_key || "")
    if (!apiKey) {
      throw new AppError(
        "Esta loja não tem credencial da Omnisend — não há o que conferir contra a plataforma.",
        400,
      )
    }

    // A janela é montada pela MESMA função do sync e do relatório. Se
    // fosse remontada aqui, a auditoria poderia dizer "bate" sobre uma
    // janela que a produção nunca envia — o defeito circular que a
    // auditoria de moeda tinha antes de 08/09.
    // A MESMA resolução do sync, com o `country` incluído: sem ele a
    // auditoria mediria uma janela que a produção nunca envia — o
    // defeito circular que ela existe para não ter.
    const { tz, assumido, procedencia } = resolverFusoDaLoja({
      timezone: loja.timezone as string | null,
      country: loja.country as string | null,
      mapaDePais: COUNTRY_TIMEZONE,
    })
    const { from, to } = omnisendDateRange(body.start, body.end, tz)

    // Brand primeiro: é ela que diz o fuso em que o painel corta os
    // dias, e é a comparação com esse fuso que explica a maior parte
    // das divergências de janela.
    const brand = await getOmnisendBrand(apiKey, { logTag: "RevenueAudit" }).catch(() => null)

    const [stats, reports] = await Promise.allSettled([
      fetchOmnisendStatistics(apiKey, from, to),
      fetchOmnisendReports(apiKey, from, to),
    ])

    const porDataDoPedido =
      stats.status === "fulfilled"
        ? {
            faturamentoTotal: stats.value.totalRevenue,
            pedidos: stats.value.totalOrders,
            receitaAtribuida: stats.value.attributedRevenue,
            pedidosAtribuidos: stats.value.attributedOrders,
          }
        : null

    const porDataDeEnvio =
      reports.status === "fulfilled" && reports.value.attributedRevenue > 0
        ? {
            receitaAtribuida: reports.value.attributedRevenue,
            pedidosAtribuidos:
              (reports.value.campaignAttributedOrders || 0) +
              (reports.value.automationAttributedOrders || 0),
          }
        : null

    // Nosso número publicado para esta janela.
    const periodLabel = `custom:${body.start}:${body.end}`
    const { data: cache } = await admin
      .from("store_revenue_summary")
      .select(
        "store_total_revenue, store_orders, omnisend_total_revenue, omnisend_total_orders, sync_status, sync_error, fetched_at",
      )
      .eq("store_id", body.store_id)
      .eq("period_label", periodLabel)
      .maybeSingle()

    const nosso = cache
      ? {
          faturamentoTotal: numOuNull(cache.store_total_revenue),
          pedidos: numOuNull(cache.store_orders),
          receitaAtribuida: numOuNull(cache.omnisend_total_revenue),
          pedidosAtribuidos: numOuNull(cache.omnisend_total_orders),
          syncStatus: (cache.sync_status as string | null) ?? null,
          syncError: (cache.sync_error as string | null) ?? null,
          fetchedAt: (cache.fetched_at as string | null) ?? null,
        }
      : null

    // O atribuído é confrontado com a Reports API (send-date), que é o
    // que o painel mostra. Comparar com o Statistics faria a auditoria
    // aprovar justamente o número que diverge da tela do cliente.
    const atribuidoDaPlataforma =
      porDataDeEnvio?.receitaAtribuida ?? porDataDoPedido?.receitaAtribuida ?? null

    const divergencias: Divergencia[] = [
      compararMetrica(
        "Faturamento total da loja",
        nosso?.faturamentoTotal ?? null,
        porDataDoPedido?.faturamentoTotal ?? null,
      ),
      compararMetrica("Pedidos da loja", nosso?.pedidos ?? null, porDataDoPedido?.pedidos ?? null, "contagem"),
      compararMetrica("Receita atribuída", nosso?.receitaAtribuida ?? null, atribuidoDaPlataforma),
      compararMetrica(
        "Pedidos atribuídos",
        nosso?.pedidosAtribuidos ?? null,
        porDataDeEnvio?.pedidosAtribuidos ?? porDataDoPedido?.pedidosAtribuidos ?? null,
        "contagem",
      ),
    ]

    const causas = causasProvaveis(divergencias, {
      fusoDoCadastro: (loja.timezone as string | null) || null,
      fusoUsadoNaJanela: tz,
      fusoDaBrand: brand?.timezone ?? null,
      // Sem a Reports API respondendo, o nosso atribuído não pôde ter
      // sido calibrado nesta janela.
      atribuidoComparavelComOPainel: porDataDeEnvio !== null,
      houveDegradacao: nosso?.syncStatus === "partial" || !!nosso?.syncError,
    })

    const fusoBrand = brand?.timezone ?? null
    const moedaBrand = brand?.currency ?? null
    const result: RevenueAuditResult = {
      storeId: String(loja.id),
      storeName: String(loja.store_name ?? ""),
      currency: (loja.currency as string | null) ?? null,
      janela: { from, to, fusoUsado: tz, fusoAssumido: assumido, procedenciaDoFuso: procedencia },
      fuso: {
        cadastro: (loja.timezone as string | null) || null,
        brand: fusoBrand,
        divergem:
          !!fusoBrand && !!loja.timezone && String(loja.timezone).trim() !== fusoBrand.trim(),
      },
      moeda: {
        cadastro: (loja.currency as string | null) ?? null,
        brand: moedaBrand,
        divergem:
          !!moedaBrand &&
          !!loja.currency &&
          String(loja.currency).toUpperCase() !== moedaBrand.toUpperCase(),
      },
      plataforma: { porDataDoPedido, porDataDeEnvio },
      nosso,
      divergencias,
      avisosDoPeriodo: periodo.avisos,
      causas,
    }

    log.info("auditoria de receita", {
      storeId: result.storeId,
      janela: `${from} .. ${to}`,
      relevantes: divergencias.filter((d) => d.relevante).map((d) => d.metrica),
    })

    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "revenue-audit")
  }
}

function numOuNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
