/**
 * Trends ("Temas em alta") — captura via IA + web search no início do
 * ciclo. Deltas são estimativas qualitativas citadas pelas fontes, não
 * métricas exatas (decisão de produto).
 *
 * Web search é incompatível com structured outputs (citations), então o
 * JSON é instruído no prompt e parseado manualmente. Falha aqui NÃO
 * aborta o ciclo — trends é enriquecimento.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { callAnthropicWithWebSearch } from "./anthropic-client"
import { aiTrendsOutputSchema } from "@/lib/validations/campaign-central"
import type { CampaignTrend } from "@/types/campaign-central"

const log = logger.child("CampaignTrends")

const TRENDS_MODEL = "claude-sonnet-4-6"

const SYSTEM_PROMPT = `Você é um analista de tendências de consumo pra e-commerce.
Pesquise na web temas/estéticas/produtos EM ALTA AGORA que lojas de e-commerce podem surfar em campanhas de email nas próximas 2-4 semanas.

REGRAS:
1. Foque nos nichos e países informados.
2. Priorize tendências com evidência recente (último mês): buscas em alta, viral em rede social, cobertura de imprensa.
3. delta_label: estimativa qualitativa citada pela fonte quando existir (ex: "+180%"). Se a fonte não cita número, use rótulo qualitativo ("em alta", "viral").
4. source: de onde vem o sinal (Google Trends, TikTok, Pinterest, imprensa...).
5. evidence: até 3 itens {url, title} das páginas que embasam.
6. Gere entre 3 e 6 trends. Qualidade > quantidade.
7. Responda APENAS com JSON válido no formato {"trends": [{"title", "source", "delta_label", "tag", "niche", "country", "evidence": [{"url", "title"}]}]} — sem markdown, sem texto antes ou depois.`

export type TrendInput = Pick<
  CampaignTrend,
  "title" | "source" | "delta_label" | "tag" | "niche" | "country"
>

/**
 * Captura trends pra um conjunto de nichos/países e persiste no ciclo.
 * Retorna as trends pra injetar no contexto das sugestões.
 */
export async function captureTrends(params: {
  orgId: string
  cycleId: string
  niches: string[]
  countries: string[]
}): Promise<TrendInput[]> {
  const admin = createAdminClient()
  const { orgId, cycleId, niches, countries } = params

  const t0 = Date.now()
  let runStatus: "completed" | "failed" | "invalid_output" = "completed"
  let errorMessage: string | null = null
  let raw: string | null = null
  let tokensIn = 0
  let tokensOut = 0
  let costCents = 0
  let trends: TrendInput[] = []

  try {
    const user = [
      `NICHOS DAS LOJAS: ${niches.length > 0 ? niches.join(", ") : "e-commerce geral"}`,
      `PAÍSES: ${countries.join(", ")}`,
      `DATA DE HOJE: ${new Date().toISOString().slice(0, 10)}`,
      ``,
      `Pesquise e retorne as tendências em alta relevantes pra esses nichos/países.`,
    ].join("\n")

    const result = await callAnthropicWithWebSearch({
      model: TRENDS_MODEL,
      system: SYSTEM_PROMPT,
      user,
      maxTokens: 4096,
      temperature: 0.6,
      maxSearches: 6,
    })

    raw = result.rawText
    tokensIn = result.tokensInput
    tokensOut = result.tokensOutput
    costCents = result.costCents

    if (!result.parsed) {
      runStatus = "invalid_output"
      errorMessage = result.parseError ?? "Output sem JSON"
    } else {
      const validation = aiTrendsOutputSchema.safeParse(result.parsed)
      if (!validation.success) {
        runStatus = "invalid_output"
        errorMessage = validation.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")
      } else {
        const rows = validation.data.trends.map((t) => ({
          org_id: orgId,
          cycle_id: cycleId,
          title: t.title,
          source: t.source ?? null,
          delta_label: t.delta_label ?? null,
          tag: t.tag ?? null,
          niche: t.niche ?? null,
          country: t.country ?? null,
          evidence: t.evidence ?? [],
        }))
        if (rows.length > 0) {
          const { error } = await admin.from("campaign_trends").insert(rows)
          if (error) throw error
        }
        trends = validation.data.trends.map((t) => ({
          title: t.title,
          source: t.source ?? null,
          delta_label: t.delta_label ?? null,
          tag: t.tag ?? null,
          niche: t.niche ?? null,
          country: t.country ?? null,
        }))
      }
    }
  } catch (err) {
    runStatus = "failed"
    errorMessage = err instanceof Error ? err.message : String(err)
    log.warn("trends.failed", { cycleId, error: errorMessage })
  }

  await admin.from("campaign_ai_runs").insert({
    org_id: orgId,
    cycle_id: cycleId,
    kind: "trends",
    model: TRENDS_MODEL,
    status: runStatus,
    input_vars: { niches, countries },
    raw_output: raw,
    parsed_output: trends.length > 0 ? { trends } : null,
    error_message: errorMessage,
    tokens_input: tokensIn,
    tokens_output: tokensOut,
    cost_cents: costCents,
    duration_ms: Date.now() - t0,
  })

  log.info("trends.done", { cycleId, count: trends.length, status: runStatus })
  return trends
}
