/**
 * Geração de copy de campanha POR LOJA — adaptação da copy MASTER.
 *
 * Recebe a master (subject + preheader + blocks) gerada via copy-master
 * service e adapta pra cada loja-alvo:
 * - traduz pro idioma da loja (language)
 * - aplica o tom de voz da marca (brand briefing)
 * - substitui placeholders genéricos do bloco 'products' por TOP PRODUCTS
 *   reais da loja (store_top_products)
 * - mantém estrutura/ordem dos blocks
 *
 * Modos:
 * - 'test' (PILOTO): COO seleciona 2-3 lojas, valida qualidade
 * - 'production' (ROLLOUT): rodada nas demais lojas. Quando há lojas com
 *   quality='good' no piloto, elas são injetadas no prompt como
 *   FEW-SHOT references de qualidade.
 *
 * Persiste em copy_results[mode][store_id] como CopyResultEntry com
 * blocks completos. Telemetria em campaign_ai_runs (kind='copy').
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { callAnthropicJson } from "./anthropic-client"
import { copyResultEntrySchema } from "@/lib/validations/campaign-central"
import { newBlockId } from "@/components/campaign-central/email-builder/default-draft"
import { collapseBlocksToText } from "./n8n-copy-normalize"
import type {
  CampaignSuggestion,
  CopyResultEntry,
  EmailDraftBlock,
} from "@/types/campaign-central"

const log = logger.child("CampaignCopy")

const MAX_CONCURRENT = 3
const COPY_MODEL = "claude-sonnet-4-6"

const SYSTEM_PROMPT = `Você é um copywriter sênior de email marketing para e-commerce, especialista em adaptar copy master para múltiplas lojas mantendo estratégia consistente mas voz local.

Você recebe:
1. Uma COPY MASTER em português brasileiro (subject + preheader + blocks de estrutura completa)
2. O contexto de UMA loja específica (idioma, tom de voz, top products reais, branding)
3. (Opcional) Adaptações já APROVADAS de outras lojas piloto — use como referência de qualidade

Sua tarefa: gerar a versão adaptada do email completo para a loja informada, mantendo a ESTRUTURA da master (mesmos blocos, mesma ordem) mas adaptando o CONTEÚDO.

REGRAS:
1. **Idioma**: escreva NO IDIOMA da loja (campo language: pt-BR → português, en-* → inglês, es → espanhol). Traduza tudo: subject, preheader, headlines, textos, CTA do botão, rodapé.
2. **Tom de voz**: aplique o tom de voz da marca quando informado. Confidente/casual/formal/jovem — siga.
3. **Subject**: máx 50 caracteres, gera curiosidade/urgência, no idioma. Emojis com parcimônia (no máximo 1, e só se a master usar).
4. **Preheader**: máx 90 caracteres, complementa o subject sem repetir.
5. **Blocks** — mantenha a mesma ORDEM e os mesmos TIPOS da master. Para cada bloco, adapte:
   - 'image': mantenha caption (descritiva)
   - 'heading': traduza headline + sub
   - 'text': reescreva no tom da marca, mesmo comprimento e intenção
   - 'offer': mantenha valores numéricos/cupons EXATOS, só traduza palavras
   - 'button': traduza CTA
   - 'divider': mantenha
   - 'footer': use placeholder {{loja}} pra nome da loja
   - 'products' (CRÍTICO): substitua os items placeholder por TOP PRODUCTS REAIS da loja. Use exatamente os produtos fornecidos (name + price). Mantenha o mesmo número de columns.
6. **Storytelling local**: pode citar slogan/diferencial/persona da loja se fizerem sentido no fluxo. Não force.
7. Se a master cita valores específicos (desconto, cupom, prazo), MANTENHA-os exatamente. Nunca invente números.
8. Se houver REFERÊNCIAS de qualidade (lojas piloto aprovadas), use-as como guia de tom e estrutura — não copie literalmente, só inspire-se.

OUTPUT: APENAS JSON {subject, preheader, strategy, blocks: [...]} no idioma da loja. Sem markdown.`

const OUTPUT_SCHEMA = {
  type: "object",
  required: ["subject", "preheader", "blocks"],
  properties: {
    subject: { type: "string" },
    preheader: { type: "string" },
    strategy: { type: "string" },
    blocks: {
      type: "array",
      items: {
        type: "object",
        required: ["type"],
        properties: {
          type: {
            type: "string",
            enum: ["image", "heading", "text", "offer", "button", "divider", "footer", "products"],
          },
          headline: { type: "string" },
          sub: { type: "string" },
          value: { type: "string" },
          caption: { type: "string" },
          columns: { type: "number" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                price: { type: "string" },
                image_caption: { type: "string" },
              },
            },
          },
        },
      },
    },
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
      .lte("rank", 6)
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

/**
 * Monta a seção ADITIVA do brief do COO (estrutura & tom da copy) pro prompt.
 * Retorna [] quando não há brief — a seção é puramente opcional e nunca altera
 * o schema de OUTPUT. Mesma formatação usada na master (copy-master.service).
 */
export function buildBriefSection(brief: CampaignSuggestion["brief"]): string[] {
  if (!brief) return []
  const fields: Array<[string, string | undefined]> = [
    ["Estrutura/tom", brief.structure],
    ["Tom de voz", brief.tone],
    ["Restrições", brief.constraints],
    ["Deve incluir", brief.must_include],
  ]
  const lines = fields
    .filter(([, v]) => v && v.trim().length > 0)
    .map(([label, v]) => `### ${label}\n${(v as string).trim()}`)
  if (lines.length === 0) return []
  return [
    ``,
    `## Brief do COO (estrutura & tom — siga como guia ao gerar/adaptar a copy)`,
    ...lines,
  ]
}

/** Strip ids dos blocks pra IA — id é regerado no servidor após o output. */
function blocksWithoutIds(blocks: EmailDraftBlock[]): Array<Omit<EmailDraftBlock, "id">> {
  return blocks.map((b) => {
    const { id: _id, ...rest } = b
    void _id
    return rest
  })
}

function buildUserPrompt(
  store: StoreCopyContext,
  suggestion: CampaignSuggestion,
  referenceCopies: Array<{ store_name: string; language: string; copy: CopyResultEntry }>,
): string {
  const draft = suggestion.email_draft
  const masterBlocks = draft?.blocks ? blocksWithoutIds(draft.blocks) : []

  const parts: string[] = [
    `## Loja-alvo`,
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
    `## Copy MASTER (em pt-BR) — adapte mantendo a mesma estrutura`,
    JSON.stringify(
      {
        subject: draft?.subject ?? suggestion.subject ?? "",
        preheader: draft?.preheader ?? "",
        strategy: draft?.strategy ?? suggestion.angle ?? "",
        blocks: masterBlocks,
      },
      null,
      1,
    ),
    ``,
    `## Contexto da campanha`,
    `Título: ${suggestion.title}`,
    `Tipo: ${suggestion.type}`,
    `Gatilho: ${suggestion.trigger?.label ?? ""} — ${suggestion.trigger?.detail ?? ""}`,
    suggestion.send_date ? `Data de envio: ${suggestion.send_date}` : "",
    // Seção ADITIVA: brief de estrutura & tom do COO (vazia se não houver).
    ...buildBriefSection(suggestion.brief),
  ].filter(Boolean)

  if (referenceCopies.length > 0) {
    parts.push(``, `## REFERÊNCIAS — adaptações de lojas piloto APROVADAS`)
    parts.push(`Use como guia de tom e qualidade — não copie literalmente.`)
    for (const ref of referenceCopies) {
      parts.push(
        ``,
        `### ${ref.store_name} (${ref.language})`,
        JSON.stringify(
          {
            subject: ref.copy.subject,
            preheader: ref.copy.preheader ?? ref.copy.preview,
            blocks: ref.copy.blocks ?? [],
          },
          null,
          1,
        ),
      )
    }
  }

  parts.push(
    ``,
    `Gere a adaptação completa pra ESTA loja seguindo as regras do system prompt.`,
  )
  return parts.join("\n")
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

/** Coleta lojas piloto com quality='good' pra usar como few-shot. */
function collectPilotReferences(
  suggestion: CampaignSuggestion,
  storeContexts: Map<string, StoreCopyContext>,
  maxRefs = 2,
): Array<{ store_name: string; language: string; copy: CopyResultEntry }> {
  const pilotResults = suggestion.copy_results?.test ?? {}
  const refs: Array<{ store_name: string; language: string; copy: CopyResultEntry }> = []
  for (const [storeId, entry] of Object.entries(pilotResults)) {
    if (entry.quality !== "good") continue
    if (!entry.blocks || entry.blocks.length === 0) continue
    const ctx = storeContexts.get(storeId)
    refs.push({
      store_name: ctx?.store_name ?? "loja piloto",
      language: ctx?.language ?? "pt-BR",
      copy: entry,
    })
    if (refs.length >= maxRefs) break
  }
  return refs
}

/**
 * Merge das lojas recém-geradas em copy_results[mode], preservando o que o n8n
 * já entregou. No fallback inline (watchdog) NÃO sobrescreve loja com
 * generated_via='n8n' + status='success', nem copy aprovada (quality='good') — o
 * n8n vence o fallback. Evita a corrida write-write com o callback
 * /webhooks/n8n/campaign-copy que pode ter chegado durante o run inline. No
 * caminho manual do COO (ai_master_adapt) a sobrescrita é deliberada.
 */
export function mergeInlineResults(
  existingMode: Record<string, CopyResultEntry>,
  results: Record<string, CopyResultEntry>,
  generatedVia: "ai_master_adapt" | "inline_fallback",
): Record<string, CopyResultEntry> {
  const mergedMode: Record<string, CopyResultEntry> = { ...existingMode }
  for (const [sid, entry] of Object.entries(results)) {
    const prev = existingMode[sid]
    if (
      generatedVia === "inline_fallback" &&
      prev &&
      (prev.quality === "good" ||
        (prev.generated_via === "n8n" && prev.status === "success"))
    ) {
      continue
    }
    mergedMode[sid] = entry
  }
  return mergedMode
}

export async function generateCampaignCopy(params: {
  suggestionId: string
  orgId: string
  mode: "test" | "production"
  storeIds: string[]
  /**
   * Origem da copy gerada. Default 'ai_master_adapt' (botão manual COO).
   * F3 (watchdog) chama com 'inline_fallback' pra distinguir nas métricas
   * quando o n8n falhou e o inline correu como fallback.
   */
  generatedVia?: "ai_master_adapt" | "inline_fallback"
}): Promise<GenerateCopyResult> {
  const admin = createAdminClient()
  const { suggestionId, orgId, mode, storeIds, generatedVia = "ai_master_adapt" } = params

  const { data: suggestionRaw } = await admin
    .from("campaign_suggestions")
    .select("*")
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!suggestionRaw) throw new Error("Sugestão não encontrada")
  const suggestion = suggestionRaw as CampaignSuggestion

  if (!suggestion.email_draft || !suggestion.email_draft.blocks?.length) {
    throw new Error(
      "Esta campanha ainda não tem copy master. Gere a master primeiro no construtor de email.",
    )
  }

  // Carrega contextos das lojas-alvo + das lojas piloto (pra reference)
  const pilotStoreIds = Object.keys(suggestion.copy_results?.test ?? {})
  const allStoreIds = Array.from(new Set([...storeIds, ...pilotStoreIds]))
  const contexts = await loadStoreContexts(admin, orgId, allStoreIds)

  const referenceCopies =
    mode === "production" ? collectPilotReferences(suggestion, contexts) : []

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
        user: buildUserPrompt(store, suggestion, referenceCopies),
        maxTokens: 3500,
        temperature: 0.75,
        outputSchema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
      })
      raw = result.rawText
      tokensIn = result.tokensInput
      tokensOut = result.tokensOutput
      costCents = result.costCents

      if (!result.parsed) {
        runStatus = "invalid_output"
        errorMessage = result.parseError ?? "Output sem JSON"
        errors[storeId] = errorMessage
      } else {
        const candidate = result.parsed as {
          subject?: string
          preheader?: string
          strategy?: string
          blocks?: Array<Omit<EmailDraftBlock, "id"> & { id?: string }>
        }
        const validation = copyResultEntrySchema.safeParse({
          subject: candidate.subject ?? "",
          preheader: candidate.preheader ?? "",
          strategy: candidate.strategy,
          // Colapsa em 1 bloco de texto (mesma decisão do dispatch/n8n).
          blocks: [
            { type: "text", value: collapseBlocksToText(candidate.blocks ?? []), id: newBlockId() },
          ],
        })
        if (!validation.success) {
          runStatus = "invalid_output"
          errorMessage = validation.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")
          errors[storeId] = errorMessage
        } else {
          const v = validation.data
          // Preserva quality já existente se for refazer
          const prevQuality = suggestion.copy_results?.[mode]?.[storeId]?.quality
          results[storeId] = {
            subject: v.subject,
            preview: v.preheader,
            preheader: v.preheader,
            strategy: v.strategy,
            blocks: v.blocks,
            quality: prevQuality ?? null,
            generated_at: new Date().toISOString(),
            generated_via: generatedVia,
            status: "success",
          }
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
      input_vars: {
        store_id: storeId,
        mode,
        references_count: referenceCopies.length,
      },
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
  const existingMode = (existing[mode] ?? {}) as Record<string, CopyResultEntry>
  const merged = {
    ...existing,
    [mode]: mergeInlineResults(existingMode, results, generatedVia),
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
    references: referenceCopies.length,
  })

  return { results, errors }
}

/** Atualiza quality de uma copy específica. Usado pelo botão "Boa". */
export async function markCopyQuality(params: {
  suggestionId: string
  orgId: string
  storeId: string
  mode: "test" | "production"
  quality: "good" | null
}): Promise<void> {
  const admin = createAdminClient()
  const { suggestionId, orgId, storeId, mode, quality } = params

  const { data } = await admin
    .from("campaign_suggestions")
    .select("copy_results")
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!data) throw new Error("Sugestão não encontrada")

  const copyResults = (data.copy_results ?? {}) as CampaignSuggestion["copy_results"]
  const entry = copyResults[mode]?.[storeId]
  if (!entry) throw new Error("Copy desta loja não encontrada — gere primeiro")

  const updated: CampaignSuggestion["copy_results"] = {
    ...copyResults,
    [mode]: {
      ...(copyResults[mode] ?? {}),
      [storeId]: { ...entry, quality },
    },
  }

  const { error } = await admin
    .from("campaign_suggestions")
    .update({ copy_results: updated })
    .eq("id", suggestionId)
  if (error) throw error
}

/** Define quais lojas são piloto. */
export async function setPilotStores(params: {
  suggestionId: string
  orgId: string
  storeIds: string[]
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("campaign_suggestions")
    .update({ pilot_store_ids: params.storeIds })
    .eq("id", params.suggestionId)
    .eq("org_id", params.orgId)
  if (error) throw error
}
