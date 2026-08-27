/**
 * Telemetry callback — persiste cada step da geração no banco.
 *
 * Tabela: `email_generation_runs`
 * Colunas: store_id, flow_id, email_id, triggered_by, batch_id,
 *          agent, agent_config_id, status, model, input_vars,
 *          rendered_prompt, raw_output, parsed_output,
 *          tokens_input, tokens_output, cost_cents, duration_ms,
 *          error_message, error_stack
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { GenerationRunAgent, GenerationRunStatus } from "@/types/email-generation"
import type {
  InputSummaryItem,
  PromptSegment,
} from "../shared/prompt-provenance"

const log = logger.child("GenTelemetry")

export interface LogGenerationRunParams {
  storeId: string
  flowId?: string
  emailId?: string
  triggeredBy?: string
  batchId: string
  agent: GenerationRunAgent
  agentConfigId?: string
  status: GenerationRunStatus
  model?: string
  inputVars?: Record<string, unknown>
  renderedPrompt?: string
  // Proveniência (migration 20261085): o prompt segmentado por origem e a
  // Entrada estruturada, capturados na montagem — ver shared/prompt-provenance.
  promptSegments?: PromptSegment[] | null
  inputSummary?: InputSummaryItem[] | null
  rawOutput?: string
  parsedOutput?: Record<string, unknown>
  tokensInput?: number
  tokensOutput?: number
  costCents?: number
  durationMs?: number
  errorMessage?: string
  errorStack?: string
  /** Nº da retentativa (0 = primeira). A UI de logs mostra em "Retries". */
  retryCount?: number
}

// Preço público por MILHÃO de tokens (USD), com chaves NORMALIZADAS
// (sem vendor, sem sufixo de data, pontos → hífens — ver normalizeModelKey).
// Assim `anthropic/claude-sonnet-4.6`, `claude-sonnet-4-5-20250514` e
// `claude-sonnet-4-6` caem todos na mesma linha, em vez de vazar pro default.
const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 15.0, output: 75.0 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  // GPT-5.x (Montador/briefing via OpenRouter). Reasoning models: tokens_output
  // já inclui os "thinking tokens" reportados, então output * preço cobre o
  // reasoning. Quando o run vem do OpenRouter, resolveCostCents prefere o custo
  // REAL (usage.cost) — esta tabela é só o fallback por token.
  "gpt-5-4": { input: 2.5, output: 15.0 },
  "gpt-5-4-image-2": { input: 2.5, output: 15.0 },
  // Nano Banana 2 — modelo de imagem padrão (jul/2026). Fallback por
  // token; o custo real do OpenRouter (usage.cost) vence quando presente.
  "gemini-3-1-flash-image": { input: 0.3, output: 30.0 },
  "gpt-5-3-chat": { input: 1.25, output: 10.0 },
  "gpt-5-3": { input: 1.25, output: 10.0 },
  // Kimi K3 (moonshotai/kimi-k3 via OpenRouter, migration 20261047).
  // Preço público Moonshot: $3/MTok input, $15/MTok output ($0.30 cached).
  // Fallback por token — o custo real vem de usage.cost do OpenRouter.
  "kimi-k3": { input: 3.0, output: 15.0 },
}
const DEFAULT_PRICING = { input: 3.0, output: 15.0 }

/**
 * Normaliza o id do modelo para bater com as chaves de PRICING_PER_MTOK:
 * remove o prefixo de vendor (`anthropic/`, `openai/`), o sufixo de data
 * (`-20250514`) e troca `.` por `-`. Ex.: `anthropic/claude-sonnet-4.6` e
 * `claude-sonnet-4-5-20250514` → `claude-sonnet-4-6` / `claude-sonnet-4-5`.
 */
export function normalizeModelKey(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/^[a-z0-9_-]+\//, "") // vendor prefix
    .replace(/-\d{8}$/, "") // sufixo de data (-YYYYMMDD)
    .replace(/\./g, "-") // 4.6 → 4-6
}

/**
 * Custo em centavos (USD * 100) por token, usando os pricing públicos.
 * Preserva SUB-CENTAVO (escala de 1e-4 centavo, igual ao image.chain) — sem
 * isso, etapas baratas (<½ centavo) arredondavam pra 0 e apareciam como
 * `$0.000` na UI. Modelo desconhecido cai no default de Sonnet, mas AGORA
 * loga um aviso (antes silenciava e cobrava errado sem ninguém ver).
 */
export function computeCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const key = normalizeModelKey(model)
  const p = PRICING_PER_MTOK[key]
  if (!p) {
    log.warn("cost.unknown_model_default_pricing", { model, normalized: key })
  }
  const price = p ?? DEFAULT_PRICING
  const usd =
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output
  return usdToCents(usd)
}

/** USD → centavos preservando 4 casas de centavo (sub-centavo não some). */
function usdToCents(usd: number): number {
  return Math.round(usd * 1_000_000) / 10_000
}

/**
 * Custo canônico de um run: usa o custo REAL do OpenRouter (`costUsd`,
 * `usage.cost`) quando disponível — é o valor exato cobrado, imune a drift
 * da tabela de preços e a nomes de modelo não-listados. Sem custo real
 * (caminho Anthropic-direto ou provider sem accounting) cai na estimativa
 * por token. Preferir SEMPRE este helper a computeCostCents nos call sites.
 */
export function resolveCostCents(args: {
  model: string
  tokensInput: number
  tokensOutput: number
  costUsd?: number | null
}): number {
  if (args.costUsd != null && args.costUsd > 0) {
    return usdToCents(args.costUsd)
  }
  return computeCostCents(args.model, args.tokensInput, args.tokensOutput)
}

// triggered_by e UUID (FK profiles), mas callers de pipeline passam labels
// como "signal_consumer:rerender". String nao-UUID quebrava o INSERT INTEIRO
// e o run era DESCARTADO em silencio — fase 2 disparada por sinal (brand
// confirm / rerender / render manual) ficou invisivel na telemetria: sem
// runs, sem custo e SEM error_message quando falhava. Nao-UUID → null.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function asUuidOrNull(value: string | null | undefined): string | null {
  return value && UUID_RE.test(value) ? value : null
}

/**
 * Persiste um run de geração no banco. Retorna o run_id.
 */
export async function logGenerationRun(params: LogGenerationRunParams): Promise<string> {
  const admin = createAdminClient()

  const insert = {
    store_id: params.storeId,
    flow_id: params.flowId ?? null,
    email_id: params.emailId ?? null,
    triggered_by: asUuidOrNull(params.triggeredBy),
    // batch_id e UUID nullable. String vazia ("" quando generation_batch_id
    // do email e null) quebra o INSERT (sintaxe UUID invalida) e o run era
    // DESCARTADO silenciosamente (telemetry.insert_failed) -> agente sumia da
    // UI ("nem rodou"). Normaliza "" -> null pra o run sempre ser gravado
    // (ligado por email_id).
    batch_id: params.batchId || null,
    agent: params.agent,
    agent_config_id: params.agentConfigId ?? null,
    status: params.status,
    model: params.model ?? null,
    input_vars: params.inputVars ?? null,
    rendered_prompt: params.renderedPrompt ?? null,
    prompt_segments: params.promptSegments ?? null,
    input_summary: params.inputSummary ?? null,
    raw_output: params.rawOutput ?? null,
    parsed_output: params.parsedOutput ?? null,
    tokens_input: params.tokensInput ?? 0,
    tokens_output: params.tokensOutput ?? 0,
    cost_cents: params.costCents ?? 0,
    duration_ms: params.durationMs ?? 0,
    error_message: params.errorMessage ?? null,
    error_stack: params.errorStack ?? null,
    retry_count: params.retryCount ?? 0,
  }

  const { data, error } = await admin
    .from("email_generation_runs")
    .insert(insert)
    .select("id")
    .single()

  if (error) {
    log.error("telemetry.insert_failed", {
      agent: params.agent,
      emailId: params.emailId,
      error: error.message,
    })
    // Não lance erro — telemetria não deve bloquear a geração
    return ""
  }

  return (data?.id as string) ?? ""
}

/**
 * Insere um run em `status='running'` ANTES da chamada ao LLM, pra que a
 * live view (/admin/agents/runs) mostre o agente em execução em tempo real.
 * Retorna o run_id pra ser finalizado com `finishGenerationRun`. Nunca
 * lança — se o insert falhar retorna "" e o finish cai no insert normal.
 */
export async function startGenerationRun(
  params: Omit<LogGenerationRunParams, "status">,
): Promise<string> {
  return logGenerationRun({ ...params, status: "running" })
}

/**
 * Finaliza um run aberto por `startGenerationRun` com o estado terminal
 * (success/error/skipped) e a telemetria completa. Se `runId` for vazio
 * (start falhou ou não rodou), degrada pro INSERT único de sempre — o
 * comportamento antigo permanece o fallback.
 */
export async function finishGenerationRun(
  runId: string,
  params: LogGenerationRunParams,
): Promise<string> {
  if (!runId) return logGenerationRun(params)

  const admin = createAdminClient()
  // Campos undefined são omitidos pelo supabase-js — não sobrescrevem o que
  // o startGenerationRun já gravou (ex.: model no start, erro sem model).
  const { error } = await admin
    .from("email_generation_runs")
    .update({
      status: params.status,
      model: params.model ?? undefined,
      agent_config_id: params.agentConfigId ?? undefined,
      input_vars: params.inputVars ?? undefined,
      rendered_prompt: params.renderedPrompt ?? undefined,
      // `?? undefined` DE PROPÓSITO: undefined é omitido pelo supabase-js e
      // preserva o que o start gravou (?? null aqui apagaria os segments).
      prompt_segments: params.promptSegments ?? undefined,
      input_summary: params.inputSummary ?? undefined,
      raw_output: params.rawOutput ?? undefined,
      parsed_output: params.parsedOutput ?? undefined,
      tokens_input: params.tokensInput ?? 0,
      tokens_output: params.tokensOutput ?? 0,
      cost_cents: params.costCents ?? 0,
      duration_ms: params.durationMs ?? 0,
      error_message: params.errorMessage ?? undefined,
      error_stack: params.errorStack ?? undefined,
      // Faltava: o UPDATE nunca gravava retry_count, então toda run aberta
      // por startGenerationRun ficava com o 0 do insert. A run do
      // Estruturador que falhou em 27/08 aparecia com "0 tentativas" tendo
      // gasto 47k tokens de entrada em duas — o número que responderia
      // "ele tentou de novo?" era justamente o que não existia.
      // `?? undefined` pelo mesmo motivo dos campos acima: omitir preserva
      // o que o start gravou, `?? 0` apagaria.
      retry_count: params.retryCount ?? undefined,
    })
    .eq("id", runId)

  if (error) {
    log.error("telemetry.finish_failed", {
      runId,
      agent: params.agent,
      error: error.message,
    })
  }
  return runId
}

/**
 * Atualiza um run existente (ex: muda status de running pra success/error).
 */
export async function updateGenerationRun(
  runId: string,
  update: Partial<LogGenerationRunParams> & { status: GenerationRunStatus },
): Promise<void> {
  if (!runId) return

  const admin = createAdminClient()
  const { error } = await admin
    .from("email_generation_runs")
    .update({
      status: update.status,
      raw_output: update.rawOutput ?? undefined,
      prompt_segments: update.promptSegments ?? undefined,
      input_summary: update.inputSummary ?? undefined,
      parsed_output: update.parsedOutput ?? undefined,
      tokens_input: update.tokensInput ?? undefined,
      tokens_output: update.tokensOutput ?? undefined,
      cost_cents: update.costCents ?? undefined,
      duration_ms: update.durationMs ?? undefined,
      error_message: update.errorMessage ?? undefined,
      error_stack: update.errorStack ?? undefined,
    })
    .eq("id", runId)

  if (error) {
    log.error("telemetry.update_failed", { runId, error: error.message })
  }
}
