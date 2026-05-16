/**
 * POST /api/admin/stores/[id]/ads-review/regenerate
 *
 * Reanalisa a operacao de midia (Meta + Google Ads) da loja e persiste
 * em client_stores.ads_* — score, sub-scores, pontos fortes,
 * oportunidades e riscos.
 *
 * Modelo: Claude Haiku 4.5 (rapido + barato pra task analitica).
 * Sem ANTHROPIC_API_KEY: fallback editorial deterministico.
 */

import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { createMetaAdsService } from "@/lib/integrations/meta-ads"
import { createGoogleAdsService } from "@/lib/integrations/google-ads"
import { logger } from "@/lib/logger"

const log = logger.child("AdsReviewRegenerate")

export const dynamic = "force-dynamic"
export const maxDuration = 60

interface AdsReviewPayload {
  score: number
  summary: string
  sub_scores: {
    strategy: number
    creatives: number
    targeting: number
    diversification: number
    tracking: number
  }
  strengths: Array<{ what: string; body: string }>
  opportunities: Array<{ what: string; body: string }>
  risks: Array<{ what: string; body: string }>
}

function fallbackReview(metaConnected: boolean, googleConnected: boolean): AdsReviewPayload {
  const diversification = metaConnected && googleConnected ? 7.5 : 4.0
  const baseStrategy = metaConnected || googleConnected ? 6.5 : 3.0
  return {
    score: Number((baseStrategy + diversification) / 2),
    summary: metaConnected || googleConnected
      ? "Operação funcional · diversificação baixa"
      : "Mídia paga não rastreada · sem dados",
    sub_scores: {
      strategy: baseStrategy,
      creatives: 6.0,
      targeting: 6.5,
      diversification,
      tracking: metaConnected || googleConnected ? 6.0 : 2.0,
    },
    strengths: metaConnected || googleConnected
      ? [
          { what: "Plataforma conectada", body: "Acesso a métricas reais permite ajustes baseados em dados." },
          { what: "Investimento ativo", body: "Há gasto consistente, indicando comprometimento com canal pago." },
          { what: "Conversões rastreadas", body: "Pixel/conversion API entregando dados pro algoritmo otimizar." },
        ]
      : [
          { what: "Espaço pra construir", body: "Sem dependência prévia de canal pago — base limpa pra desenhar estratégia." },
          { what: "Foco em orgânico", body: "Crescimento atual vem de canais próprios, reduzindo CAC base." },
          { what: "Aprendizado claro", body: "Cada teste em mídia paga terá impacto mensurável." },
        ],
    opportunities: [
      { what: "Diversificar canais", body: "Expandir além do canal único reduz dependência e melhora frequência média do consumidor." },
      { what: "Melhorar criativos", body: "Rotação de variantes e teste de hooks pode elevar CTR e reduzir CPM." },
      { what: "Refinar segmentação", body: "Lookalikes com base em compradores e remarketing por engajamento elevam ROAS." },
    ],
    risks: [
      { what: "Dependência de um canal", body: "Mudanças de algoritmo ou política da plataforma impactam diretamente o faturamento." },
      { what: "Tracking inconsistente", body: "Sem CAPI e UTMs padronizadas, atribuição fica subestimada e otimização ruim." },
    ],
  }
}

function parseAiReview(raw: string, fallback: AdsReviewPayload): AdsReviewPayload {
  try {
    // Extrai JSON do output (pode vir com markdown fences)
    const match = raw.match(/```json\s*([\s\S]*?)\s*```/) || raw.match(/(\{[\s\S]*\})/)
    const text = match ? match[1] : raw
    const parsed = JSON.parse(text) as Partial<AdsReviewPayload>

    return {
      score: typeof parsed.score === "number" ? Math.max(0, Math.min(10, parsed.score)) : fallback.score,
      summary: typeof parsed.summary === "string" ? parsed.summary : fallback.summary,
      sub_scores: {
        strategy: clamp(parsed.sub_scores?.strategy, fallback.sub_scores.strategy),
        creatives: clamp(parsed.sub_scores?.creatives, fallback.sub_scores.creatives),
        targeting: clamp(parsed.sub_scores?.targeting, fallback.sub_scores.targeting),
        diversification: clamp(parsed.sub_scores?.diversification, fallback.sub_scores.diversification),
        tracking: clamp(parsed.sub_scores?.tracking, fallback.sub_scores.tracking),
      },
      strengths: Array.isArray(parsed.strengths) && parsed.strengths.length > 0
        ? parsed.strengths.slice(0, 5).map((s) => ({ what: String(s.what ?? ""), body: String(s.body ?? "") }))
        : fallback.strengths,
      opportunities: Array.isArray(parsed.opportunities) && parsed.opportunities.length > 0
        ? parsed.opportunities.slice(0, 5).map((s) => ({ what: String(s.what ?? ""), body: String(s.body ?? "") }))
        : fallback.opportunities,
      risks: Array.isArray(parsed.risks) && parsed.risks.length > 0
        ? parsed.risks.slice(0, 5).map((s) => ({ what: String(s.what ?? ""), body: String(s.body ?? "") }))
        : fallback.risks,
    }
  } catch (err) {
    log.warn("Failed to parse AI review JSON, using fallback", err)
    return fallback
  }
}

function clamp(v: unknown, fb: number): number {
  if (typeof v !== "number" || isNaN(v)) return fb
  return Math.max(0, Math.min(10, v))
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

    // Carrega loja
    const { data: store, error: storeErr } = await admin
      .from("client_stores")
      .select("id, store_name, niche, target_audience, posicionamento_preco, persona, diferencial")
      .eq("id", storeId)
      .single()
    if (storeErr || !store) throw new AppError("Loja não encontrada", 404)

    // Coleta dados de Meta + Google Ads dos últimos 30d
    const credentials = await getStoreCredentials(storeId)
    const metaConnected = !!(credentials.meta_access_token && credentials.meta_ad_account_id)
    const googleConnected = !!(
      credentials.google_ads_credentials?.access_token &&
      credentials.google_ads_credentials?.customer_id
    )

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, "0")
    const startDate = `${thirtyDaysAgo.getFullYear()}-${pad(thirtyDaysAgo.getMonth() + 1)}-${pad(thirtyDaysAgo.getDate())}`
    const endDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

    const adsContext: Record<string, unknown> = { periodo: "30d" }

    if (metaConnected) {
      try {
        const meta = createMetaAdsService({
          access_token: credentials.meta_access_token!,
          ad_account_id: credentials.meta_ad_account_id!,
        })
        const metrics = await meta.getDashboardMetrics({ since: startDate, until: endDate })
        adsContext.meta_ads = {
          gasto: metrics.totalSpend,
          receita: metrics.totalRevenue,
          roas: metrics.roas,
          impressoes: metrics.impressions,
          cliques: metrics.clicks,
          conversoes: metrics.conversions,
          ctr: metrics.ctr,
          cpc: metrics.cpc,
        }
      } catch (err) {
        log.error("Meta Ads fetch failed", err)
        adsContext.meta_ads = { erro: "Falha ao buscar dados" }
      }
    }

    if (googleConnected) {
      try {
        const gads = createGoogleAdsService(credentials.google_ads_credentials!)
        const metrics = await gads.getDashboardMetrics({ startDate, endDate })
        adsContext.google_ads = {
          gasto: metrics.totalSpend,
          receita: metrics.totalConversionsValue,
          roas: metrics.roas,
          impressoes: metrics.impressions,
          cliques: metrics.clicks,
          conversoes: metrics.totalConversions,
          ctr: metrics.ctr,
          cpc: metrics.cpc,
        }
      } catch (err) {
        log.error("Google Ads fetch failed", err)
        adsContext.google_ads = { erro: "Falha ao buscar dados" }
      }
    }

    const fallback = fallbackReview(metaConnected, googleConnected)
    let review = fallback

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (apiKey) {
      try {
        const client = new Anthropic({ apiKey })
        const systemPrompt = `Você é um analista sênior de growth da Convertfy. Avalia operações de mídia paga (Meta + Google Ads) com base em dados quantitativos e qualitativos.

Loja: ${store.store_name}
Nicho: ${store.niche ?? "—"}
Público: ${store.target_audience ?? "—"}
Posicionamento: ${store.posicionamento_preco ?? "—"}
Diferencial: ${store.diferencial ?? "—"}

Saídas em JSON válido com TODAS as chaves abaixo. Sem markdown, sem preâmbulo, apenas JSON puro.`

        const userPrompt = `Analise os dados de mídia da loja e devolva um JSON com a seguinte estrutura exata:

{
  "score": <0-10, score geral da operação>,
  "summary": "<resumo curto · max 60 chars · ex: 'Operação funcional · diversificação baixa'>",
  "sub_scores": {
    "strategy": <0-10>,
    "creatives": <0-10>,
    "targeting": <0-10>,
    "diversification": <0-10>,
    "tracking": <0-10>
  },
  "strengths": [
    {"what": "<título curto>", "body": "<descrição 1-2 frases>"},
    ... 3 itens
  ],
  "opportunities": [
    {"what": "<título curto>", "body": "<descrição 1-2 frases>"},
    ... 3 itens
  ],
  "risks": [
    {"what": "<título curto>", "body": "<descrição 1-2 frases>"},
    ... 2 itens
  ]
}

Dados:
\`\`\`json
${JSON.stringify(adsContext, null, 2)}
\`\`\`

Critérios:
- Strategy: presença de funil (topo/meio/fundo), volume de campanhas, segmentação
- Creatives: qualidade do CTR e variação criativa
- Targeting: precisão (CPC, CTR) — alto CPC com baixo CTR sugere segmentação ruim
- Diversification: quantos canais ativos (Meta + Google = melhor que só um)
- Tracking: ROAS reportado faz sentido com receita conhecida?

Se não há dados (loja sem Meta/Google conectados), pontue tracking <3 e seja honesto na summary.
Texto em PT-BR. Sem emoji.`

        const result = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        })
        const block = result.content[0]
        if (block && block.type === "text") {
          review = parseAiReview(block.text, fallback)
        }
      } catch (err) {
        log.error("Anthropic call failed, using fallback", err)
        review = fallback
      }
    }

    // Persiste
    const nowIso = new Date().toISOString()
    const { error: updateErr } = await admin
      .from("client_stores")
      .update({
        ads_score: review.score,
        ads_summary: review.summary,
        ads_sub_scores: review.sub_scores,
        ads_strengths: review.strengths,
        ads_opportunities: review.opportunities,
        ads_risks: review.risks,
        ads_reviewed_at: nowIso,
        ads_reviewed_by: user.id,
      })
      .eq("id", storeId)
    if (updateErr) throw updateErr

    return successResponse(request, {
      ...review,
      reviewed_at: nowIso,
      ai_used: !!apiKey,
    })
  } catch (error) {
    return errorResponse(request, error, "ads-review-regenerate")
  }
}
