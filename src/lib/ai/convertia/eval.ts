/**
 * Conjunto de avaliação da ConvertIA — item 14.
 *
 * Perguntas REAIS (as que ganharam 👍) viram casos em `ai_eval_cases`;
 * um lote (`batch_id`) roda cada caso ativo em 2–3 modelos com as
 * MESMAS tools de leitura que a conversa original tinha, e um modelo
 * juiz dá nota 0–10 numa rubrica fixa (consultou dados, correção,
 * acionabilidade, formato, concisão). Resultado em `ai_eval_runs`; o
 * painel em Custo de IA compara modelos por nota média × custo.
 *
 * Sem SSE, sem persistência de mensagem: o loop roda com `emit` vazio
 * e tools SÓ de leitura (write é filtrado — avaliação nunca executa).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"
import type { ChatMessage, ChatToolDef } from "@/lib/ai/openrouter-chat"
import { streamOpenRouterChat } from "@/lib/ai/openrouter-chat"
import { resolveConnectors } from "@/lib/ai/connectors/registry"
import type { ConnectorToolContext } from "@/lib/ai/connectors/types"
import { computeAiCostCents, recordAiUsage } from "@/lib/services/ai-usage.service"
import { buildStoreContext } from "@/lib/services/ai-context.service"
import { logger } from "@/lib/logger"
import { buildConvertiaSystemPrompt } from "./system-prompt"
import { supportsPromptCache } from "./prompt-cache"
import { TurnTelemetry } from "./telemetry"
import { createTurnState, runToolLoop, type ToolEntry } from "./tool-loop"

const log = logger.child("ConvertiaEval")

export const EVAL_MODELS_DEFAULT = ["anthropic/claude-opus-4.8", "anthropic/claude-sonnet-4.6", "moonshotai/kimi-k3"]
export const EVAL_JUDGE_MODEL = "anthropic/claude-sonnet-4.6"
const CASE_BUDGET_MS = 120_000
const MAX_CASES_PER_BATCH = 30
const MISSING = new Set(["42P01", "PGRST205"])

export interface EvalRubric {
  consultou_dados: number
  correcao: number
  acionabilidade: number
  formato: number
  concisao: number
  comentario: string
}

/**
 * Importa os prompts das respostas marcadas 👍 (últimos N dias) como
 * casos — dedupe pelo hash do prompt (UNIQUE). Devolve quantos entraram.
 */
export async function importCasesFromFeedback(admin: SupabaseClient, orgId: string, days = 90, max = 30): Promise<number> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data: convs } = await admin
    .from("ai_chat_conversations")
    .select("id, context")
    .eq("org_id", orgId)
    .contains("context", { source: "convertia" })
    .gte("last_message_at", since)
    .limit(500)
  if (!convs || convs.length === 0) return 0
  const convById = new Map(convs.map((c) => [c.id, c.context as Record<string, unknown> | null]))
  const { data: msgs } = await admin
    .from("ai_chat_messages")
    .select("id, conversation_id, role, content, created_at, meta->feedback")
    .in("conversation_id", convs.map((c) => c.id))
    .order("created_at", { ascending: true })
    .limit(4000)
  if (!msgs) return 0
  let imported = 0
  let prevUser: { content: string; conversation_id: string } | null = null
  for (const m of msgs as Array<{ id: string; conversation_id: string; role: string; content: string; feedback?: { rating?: string } | null }>) {
    if (m.role === "user") {
      prevUser = { content: m.content, conversation_id: m.conversation_id }
      continue
    }
    if (m.role !== "assistant" || m.feedback?.rating !== "up" || !prevUser || prevUser.conversation_id !== m.conversation_id) continue
    if (imported >= max) break
    const ctx = convById.get(m.conversation_id) ?? {}
    // anexos inline não entram (o caso é a pergunta, não o arquivo)
    const prompt = prevUser.content.replace(/\n\n\[Arquivo anexado:[\s\S]*$/, "").replace(/\n\n\[Imagem anexada[^\]]*\]/g, "").trim()
    if (prompt.length < 5) continue
    const { error } = await admin.from("ai_eval_cases").upsert(
      {
        org_id: orgId,
        prompt: prompt.slice(0, 8000),
        workspace: ctx?.workspace === "comercial" ? "comercial" : "operacional",
        store_id: typeof ctx?.store_id === "string" ? ctx.store_id : null,
        connectors: Array.isArray(ctx?.connectors) ? (ctx.connectors as string[]).filter((c) => typeof c === "string") : [],
        source_message_id: m.id,
      },
      { onConflict: "org_id,prompt_hash", ignoreDuplicates: true },
    )
    if (error) {
      if (MISSING.has(error.code ?? "")) return imported
      log.warn("import de caso falhou", { error: error.message })
      continue
    }
    imported++
  }
  return imported
}

interface CaseRow {
  id: string
  org_id: string
  prompt: string
  workspace: "operacional" | "comercial"
  store_id: string | null
  connectors: string[]
  expectations: string | null
}

async function runCase(
  admin: SupabaseClient,
  c: CaseRow,
  model: string,
  userId: string,
): Promise<{ text: string; tokensIn: number; tokensOut: number; costCents: number; ms: number; toolCalls: number; error?: string }> {
  const started = Date.now()
  const connectors = await resolveConnectors({ admin, orgId: c.org_id, storeId: c.store_id, enabled: c.connectors })
  const toolIndex = new Map<string, ToolEntry>()
  const toolDefs: ChatToolDef[] = []
  for (const conn of connectors) {
    for (const t of conn.tools) {
      if (t.write) continue // avaliação NUNCA executa
      toolIndex.set(t.def.function.name, { tool: t, connectorKey: conn.key, connectorName: conn.name })
      toolDefs.push(t.def)
    }
  }
  const storeContext = c.store_id ? await buildStoreContext(c.store_id).catch(() => "") : ""
  const prompt = buildConvertiaSystemPrompt({
    workspace: c.workspace,
    connectors: connectors.map((x) => ({ key: x.key, name: x.name, guidance: x.guidance })),
    writeToolNames: [],
    storeContext,
    skills: [],
    deep: false,
  })
  const messages: ChatMessage[] = [
    supportsPromptCache(model)
      ? { role: "system", content: [{ type: "text", text: prompt.stable }, { type: "text", text: prompt.dynamic }] }
      : { role: "system", content: `${prompt.stable}\n\n${prompt.dynamic}` },
    { role: "user", content: c.prompt },
  ]
  const state = createTurnState()
  const telemetry = new TurnTelemetry()
  const toolCtx: ConnectorToolContext = { admin, orgId: c.org_id, userId, storeId: c.store_id, workspace: c.workspace }
  const result = await runToolLoop({
    model,
    reasoningSupported: false,
    deep: false,
    messages,
    tools: toolDefs,
    toolIndex,
    toolCtx,
    maxRounds: 6,
    budget: { startedAt: started, totalMs: CASE_BUDGET_MS, minRoundMs: 10_000 },
    guard: { wantsAnalysis: false, wantsAction: false },
    callModel: streamOpenRouterChat,
    emit: () => {},
    persistPartial: () => {},
    isCancelled: () => false,
    state,
    telemetry,
  })
  const u = telemetry.summary()
  return {
    text: result.fullText,
    tokensIn: u.tokens_input,
    tokensOut: u.tokens_output,
    costCents: u.cost_usd > 0 ? u.cost_usd * 100 : computeAiCostCents(model, u.tokens_input, u.tokens_output),
    ms: Date.now() - started,
    toolCalls: u.tools.length,
    ...(result.status === "error" ? { error: result.errorMessage ?? "erro" } : {}),
  }
}

async function judge(
  c: CaseRow,
  response: string,
  toolCalls: number,
): Promise<{ score: number; rubric: EvalRubric; tokensIn: number; tokensOut: number; costUsd: number } | null> {
  const r = await streamOpenRouterChat({
    model: EVAL_JUDGE_MODEL,
    maxTokens: 600,
    temperature: 0,
    timeoutMs: 60_000,
    messages: [
      {
        role: "system",
        content:
          "Você avalia respostas de um assistente interno de uma agência de email marketing. Dê notas de 0 a 10 para cada critério e devolva SOMENTE JSON: {\"consultou_dados\":n,\"correcao\":n,\"acionabilidade\":n,\"formato\":n,\"concisao\":n,\"comentario\":\"...\"}. Critérios: consultou_dados = usou ferramentas/números reais quando a pergunta pedia (0 se inventou); correcao = coerência interna e ausência de afirmações falsas/inventadas; acionabilidade = recomendação prática e específica; formato = markdown escaneável (resumo na 1ª linha, seções curtas, tabela para números); concisao = sem enrolação, tamanho proporcional à pergunta.",
      },
      {
        role: "user",
        content: `PERGUNTA:\n${c.prompt}\n\n${c.expectations ? `O QUE UMA BOA RESPOSTA PRECISA TER:\n${c.expectations}\n\n` : ""}FERRAMENTAS CHAMADAS: ${toolCalls}\n\nRESPOSTA:\n${response.slice(0, 12_000)}`,
      },
    ],
  })
  try {
    const m = r.text.match(/\{[\s\S]*\}/)
    if (!m) return null
    const j = JSON.parse(m[0]) as Partial<EvalRubric>
    const n = (v: unknown) => Math.min(10, Math.max(0, Number(v) || 0))
    const rubric: EvalRubric = {
      consultou_dados: n(j.consultou_dados),
      correcao: n(j.correcao),
      acionabilidade: n(j.acionabilidade),
      formato: n(j.formato),
      concisao: n(j.concisao),
      comentario: String(j.comentario ?? "").slice(0, 600),
    }
    // pesos: dados e correção valem mais
    const score =
      (rubric.consultou_dados * 3 + rubric.correcao * 3 + rubric.acionabilidade * 2 + rubric.formato + rubric.concisao) / 10
    return { score: Math.round(score * 10) / 10, rubric, tokensIn: r.tokensInput, tokensOut: r.tokensOutput, costUsd: r.costUsd }
  } catch {
    return null
  }
}

/**
 * Roda um lote: casos ativos × modelos. Respeita o orçamento de tempo
 * (cron de 300 s) — o que não couber fica para a próxima execução
 * (o lote é por caso; casos já rodados hoje no mesmo batch não repetem).
 */
export async function runEvalBatch(
  admin: SupabaseClient,
  opts: { orgId?: string | null; models?: string[]; budgetMs: number; batchId?: string; caseIds?: string[] },
): Promise<{ batch_id: string; runs: number; errors: number; skipped_budget: number }> {
  const started = Date.now()
  const models = opts.models && opts.models.length > 0 ? opts.models : EVAL_MODELS_DEFAULT
  const batchId = opts.batchId ?? randomUUID()
  let q = admin
    .from("ai_eval_cases")
    .select("id, org_id, prompt, workspace, store_id, connectors, expectations, created_by")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(MAX_CASES_PER_BATCH)
  if (opts.orgId) q = q.eq("org_id", opts.orgId)
  if (opts.caseIds && opts.caseIds.length > 0) q = q.in("id", opts.caseIds)
  const { data: cases, error } = await q
  if (error) {
    if (MISSING.has(error.code ?? "")) return { batch_id: batchId, runs: 0, errors: 0, skipped_budget: 0 }
    throw error
  }
  let runs = 0
  let errors = 0
  let skipped = 0
  for (const c of (cases ?? []) as Array<CaseRow & { created_by: string | null }>) {
    for (const model of models) {
      if (opts.budgetMs - (Date.now() - started) < CASE_BUDGET_MS + 30_000) {
        skipped++
        continue
      }
      const userId = c.created_by ?? ""
      try {
        const r = await runCase(admin, c, model, userId)
        const j = r.error || !r.text ? null : await judge(c, r.text, r.toolCalls)
        await admin.from("ai_eval_runs").insert({
          case_id: c.id,
          batch_id: batchId,
          model,
          status: r.error ? "error" : "ok",
          response: r.text.slice(0, 20_000),
          score: j?.score ?? null,
          rubric: j?.rubric ?? null,
          judge_model: j ? EVAL_JUDGE_MODEL : null,
          tokens_input: r.tokensIn + (j?.tokensIn ?? 0),
          tokens_output: r.tokensOut + (j?.tokensOut ?? 0),
          cost_cents: Math.round((r.costCents + (j?.costUsd ?? 0) * 100) * 10000) / 10000,
          duration_ms: r.ms,
          tool_calls: r.toolCalls,
          error: r.error ?? null,
        })
        void recordAiUsage({
          feature: "convertia",
          model,
          provider: "openrouter",
          status: r.error ? "error" : "success",
          tokensInput: r.tokensIn,
          tokensOutput: r.tokensOut,
          durationMs: r.ms,
          orgId: c.org_id,
          storeId: c.store_id,
          costCents: r.costCents,
          context: { kind: "eval", batch_id: batchId, case_id: c.id },
        })
        runs++
        if (r.error) errors++
      } catch (err) {
        errors++
        log.warn("eval run falhou", { case: c.id, model, error: err instanceof Error ? err.message : String(err) })
        await admin
          .from("ai_eval_runs")
          .insert({ case_id: c.id, batch_id: batchId, model, status: "error", error: (err instanceof Error ? err.message : String(err)).slice(0, 500) })
          .then(() => undefined, () => undefined)
      }
    }
  }
  log.info("eval batch", { batch_id: batchId, runs, errors, skipped })
  return { batch_id: batchId, runs, errors, skipped_budget: skipped }
}
