/**
 * Geração de copy de campanha POR LOJA (CopyPanel — modos teste/produção).
 *
 * Cada loja recebe uma chamada IA com seu contexto (brand/briefing/tom/
 * top products, lidos das tabelas locais) + o briefing da sugestão.
 * Output: { subject, preview } no idioma da loja. Persistido em
 * campaign_suggestions.copy_results[mode][store_id].
 *
 * Não reusa o copy.chain do flow (template acoplado a flow_type/blocks);
 * usa o anthropic-client do módulo com structured outputs. Telemetria em
 * campaign_ai_runs (kind='copy').
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { callAnthropicJson } from "./anthropic-client"
import type { CampaignSuggestion, CopyResultEntry } from "@/types/campaign-central"

const log = logger.child("CampaignCopy")

const MAX_CONCURRENT = 3
const COPY_MODEL = "claude-sonnet-4-6"

const SYSTEM_PROMPT = `Você é um copywriter sênior de email marketing para e-commerce.
Gere o assunto (subject) e o preview text de UM email de campanha para a loja informada.

Regras:
- Escreva NO IDIOMA da loja (campo language: pt-BR → português, en-* → inglês, es → espanhol).
- Subject: máximo 50 caracteres, gera curiosidade ou urgência conforme o ângulo. Emojis com parcimônia (no máximo 1).
- Preview: complementa o subject sem repeti-lo, máximo 90 caracteres.
- Respeite EXATAMENTE o tom de voz da marca quando informado.
- Se a sugestão cita valores (desconto, cupom, prazo), MANTENHA-os — nunca invente números novos.
- Responda APENAS o JSON.`

const OUTPUT_SCHEMA = {
  type: "object",
  required: ["subject", "preview"],
  properties: {
    subject: { type: "string" },
    preview: { type: "string" },
  },
} as const

interface StoreCopyContext {
  store_id: string
  store_name: string
  language: string
  niche: string | null
  tone: string | null
  slogan: string | null
  diferencial: string | null
  persona: string | null
  top_products: Array<{ title: string; price: string | null }>
}

export interface GenerateCopyResult {
  results: Record<string, CopyResultEntry>
  errors: Record<string, string>
}

async function loadStoreContexts(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  storeIds: string[],
): Promise<Map<string, StoreCopyContext>> {
  const [storesRes, briefingsRes, productsRes] = await Promise.all([
    admin
      .from("client_stores")
      .select("id, store_name, language, niche")
      .eq("org_id", orgId)
      .in("id", storeIds),
    admin
      .from("store_briefings")
      .select("store_id, briefing_data")
      .in("store_id", storeIds)
      .eq("status", "current"),
    admin
      .from("store_top_products")
      .select("store_id, title, price, rank")
      .in("store_id", storeIds)
      .lte("rank", 3)
      .order("rank", { ascending: true }),
  ])

  if (storesRes.error) throw storesRes.error

  const briefingByStore = new Map<string, Record<string, unknown>>()
  for (const b of briefingsRes.data ?? []) {
    briefingByStore.set(b.store_id as string, (b.briefing_data ?? {}) as Record<string, unknown>)
  }

  const productsByStore = new Map<string, Array<{ title: string; price: string | null }>>()
  for (const p of productsRes.data ?? []) {
    const arr = productsByStore.get(p.store_id as string) ?? []
    arr.push({ title: p.title as string, price: (p.price as string | null) ?? null })
    productsByStore.set(p.store_id as string, arr)
  }

  const result = new Map<string, StoreCopyContext>()
  for (const s of storesRes.data ?? []) {
    const marca = (briefingByStore.get(s.id as string)?.marca ?? {}) as Record<string, unknown>
    result.set(s.id as string, {
      store_id: s.id as string,
      store_name: (s.store_name as string) ?? "",
      language: (s.language as string) ?? "pt-BR",
      niche: (s.niche as string | null) ?? ((marca.nicho as string) || null),
      tone: (marca.tom_voz as string) || (marca.tomDeVoz as string) || null,
      slogan: (marca.slogan as string) || null,
      diferencial: (marca.diferencial as string) || null,
      persona: (marca.persona as string) || null,
      top_products: productsByStore.get(s.id as string) ?? [],
    })
  }
  return result
}

function buildUserPrompt(store: StoreCopyContext, suggestion: CampaignSuggestion): string {
  const draft = suggestion.email_draft
  return [
    `## Loja`,
    JSON.stringify(
      {
        name: store.store_name,
        language: store.language,
        niche: store.niche,
        tom_voz: store.tone,
        slogan: store.slogan,
        diferencial: store.diferencial,
        persona: store.persona,
        top_products: store.top_products,
      },
      null,
      1,
    ),
    ``,
    `## Campanha`,
    `Título: ${suggestion.title}`,
    `Tipo: ${suggestion.type}`,
    `Gatilho: ${suggestion.trigger?.label ?? ""} — ${suggestion.trigger?.detail ?? ""}`,
    `Ângulo/estratégia: ${draft?.strategy || suggestion.angle || ""}`,
    suggestion.subject ? `Subject de referência (adapte ao idioma/tom da loja): ${suggestion.subject}` : "",
    suggestion.send_date ? `Data de envio: ${suggestion.send_date}` : "",
    ``,
    `Gere subject + preview para ESTA loja.`,
  ]
    .filter(Boolean)
    .join("\n")
}

/** Roda fns com limite de concorrência. */
async function runLimited<T>(fns: Array<() => Promise<T>>, limit: number): Promise<void> {
  let next = 0
  async function worker() {
    while (next < fns.length) {
      const i = next++
      await fns[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, fns.length) }, worker))
}

export async function generateCampaignCopy(params: {
  suggestionId: string
  orgId: string
  mode: "test" | "production"
  storeIds: string[]
}): Promise<GenerateCopyResult> {
  const admin = createAdminClient()
  const { suggestionId, orgId, mode, storeIds } = params

  const { data: suggestionRaw } = await admin
    .from("campaign_suggestions")
    .select("*")
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!suggestionRaw) throw new Error("Sugestão não encontrada")
  const suggestion = suggestionRaw as CampaignSuggestion

  const contexts = await loadStoreContexts(admin, orgId, storeIds)

  const results: Record<string, CopyResultEntry> = {}
  const errors: Record<string, string> = {}

  const tasks = storeIds.map((storeId) => async () => {
    const store = contexts.get(storeId)
    if (!store) {
      errors[storeId] = "Loja não encontrada na org"
      return
    }

    const t0 = Date.now()
    let runStatus: "completed" | "failed" | "invalid_output" = "completed"
    let errorMessage: string | null = null
    let raw: string | null = null
    let tokensIn = 0
    let tokensOut = 0
    let costCents = 0

    try {
      const result = await callAnthropicJson({
        model: COPY_MODEL,
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(store, suggestion),
        maxTokens: 1024,
        temperature: 0.8,
        outputSchema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
      })
      raw = result.rawText
      tokensIn = result.tokensInput
      tokensOut = result.tokensOutput
      costCents = result.costCents

      const parsed = result.parsed as { subject?: string; preview?: string } | null
      if (!parsed?.subject || !parsed?.preview) {
        runStatus = "invalid_output"
        errorMessage = result.parseError ?? "Output sem subject/preview"
        errors[storeId] = errorMessage
      } else {
        results[storeId] = {
          subject: parsed.subject,
          preview: parsed.preview,
          generated_at: new Date().toISOString(),
        }
      }
    } catch (err) {
      runStatus = "failed"
      errorMessage = err instanceof Error ? err.message : String(err)
      errors[storeId] = errorMessage
      log.error("copy.store_failed", { suggestionId, storeId, error: errorMessage })
    }

    await admin.from("campaign_ai_runs").insert({
      org_id: orgId,
      cycle_id: suggestion.cycle_id,
      suggestion_id: suggestionId,
      kind: "copy",
      model: COPY_MODEL,
      status: runStatus,
      input_vars: { store_id: storeId, mode },
      raw_output: raw,
      parsed_output: results[storeId] ?? null,
      error_message: errorMessage,
      tokens_input: tokensIn,
      tokens_output: tokensOut,
      cost_cents: costCents,
      duration_ms: Date.now() - t0,
    })
  })

  await runLimited(tasks, MAX_CONCURRENT)

  // Persiste merged em copy_results[mode] — re-lê pra não perder writes
  // concorrentes de outro painel aberto.
  const { data: fresh } = await admin
    .from("campaign_suggestions")
    .select("copy_results")
    .eq("id", suggestionId)
    .maybeSingle()

  const existing = (fresh?.copy_results ?? {}) as CampaignSuggestion["copy_results"]
  const merged = {
    ...existing,
    [mode]: { ...(existing[mode] ?? {}), ...results },
  }

  const { error: updateErr } = await admin
    .from("campaign_suggestions")
    .update({ copy_results: merged })
    .eq("id", suggestionId)
  if (updateErr) throw updateErr

  log.info("copy.done", {
    suggestionId,
    mode,
    requested: storeIds.length,
    generated: Object.keys(results).length,
    failed: Object.keys(errors).length,
  })

  return { results, errors }
}
