/**
 * QA Chain — Agente de QA para emails gerados pelo pipeline AE.
 *
 * Story AE-5. Substitui o `runQaAgentMock` no `phase2-runner.service.ts`.
 *
 * Pipeline interno:
 *   1) Pre-checks DETERMINISTICOS (sem Claude): html_invalido, blocos_vazios,
 *      links_quebrados (javascript: schemes / URLs malformadas).
 *   2) Carrega config ativo de `email_agent_configs` (agent_type='qa').
 *      Se ausente, degrade seguro: {passed:true, issues:[], meta.model='noop'}.
 *   3) Renderiza prompt + chama LangChain ChatAnthropic (igual html.chain.ts).
 *      Timeout 15s via AbortController.
 *   4) Parse JSON: try direto -> 1 retry pedindo reformatacao -> fallback.
 *   5) Valida output com Zod. Fallback `qa_output_invalid` se invalido.
 *   6) Mescla issues (pre-checks + LLM). `passed = !some(sev >= block)`.
 *   7) Loga em `email_generation_runs` via `logGenerationRun`.
 *
 * Variavel de bloqueio:
 *   process.env.EMAIL_QA_BLOCK_SEVERITY = 'low' | 'medium' | 'high' (default high).
 *   Severities >= threshold bloqueiam.
 */

import { ChatAnthropic } from "@langchain/anthropic"
import { ChatPromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"
import { z } from "zod"

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type {
  EmailAgentConfig,
  QaIssue,
  QaIssueSeverity,
  QaIssueType,
  QaResult,
} from "@/types/email-generation"
import type { StoreBrandIdentity, StoreBriefing } from "@/types/email-workspace"
import {
  computeCostCents,
  logGenerationRun,
} from "../callbacks/telemetry.callback"

const log = logger.child("QaChain")

// ── Constantes ─────────────────────────────────────────────────────────
const QA_TIMEOUT_MS = 15_000
const DEFAULT_MODEL = "claude-sonnet-4-6"
const DEFAULT_MAX_TOKENS = 1500
const DEFAULT_TEMPERATURE = 0.2

const QA_ISSUE_TYPES = [
  "spam_score_alto",
  "links_quebrados",
  "blocos_vazios",
  "tom_inconsistente",
  "claim_nao_coberto",
  "html_invalido",
  "alt_text_faltando",
  "compliance",
] as const satisfies readonly QaIssueType[]

const QA_SEVERITIES = ["low", "medium", "high"] as const satisfies readonly QaIssueSeverity[]

// ── Zod schema do output do LLM ────────────────────────────────────────
const QaIssueSchema = z.object({
  type: z.enum(QA_ISSUE_TYPES),
  severity: z.enum(QA_SEVERITIES),
  message: z.string().min(1),
  location: z.string().optional(),
})

const QaOutputSchema = z.object({
  passed: z.boolean(),
  issues: z.array(QaIssueSchema),
})

// ── Helpers de severidade ─────────────────────────────────────────────
const SEVERITY_ORDER: Record<QaIssueSeverity, number> = { low: 1, medium: 2, high: 3 }

export function getBlockingSeverity(): QaIssueSeverity {
  const raw = (process.env.EMAIL_QA_BLOCK_SEVERITY ?? "high").toLowerCase()
  if (raw === "low" || raw === "medium" || raw === "high") return raw
  return "high"
}

function computePassed(issues: QaIssue[]): boolean {
  const threshold = SEVERITY_ORDER[getBlockingSeverity()]
  return !issues.some((i) => SEVERITY_ORDER[i.severity] >= threshold)
}

// ── Pre-checks deterministicos ────────────────────────────────────────
export function runDeterministicChecks(
  html: string,
  blocks: Array<{ block_type: string; content: Record<string, unknown> }>,
): QaIssue[] {
  const issues: QaIssue[] = []

  // 1. HTML basico: precisa ter <html> e </html>
  const hasOpen = /<html\b/i.test(html)
  const hasClose = /<\/html\s*>/i.test(html)
  if (!hasOpen || !hasClose) {
    issues.push({
      type: "html_invalido",
      severity: "high",
      message: "HTML sem tag <html> ou </html>.",
      location: "html",
    })
  }

  // 2. Blocos vazios: content vazio ou todos values vazios
  blocks.forEach((blk, idx) => {
    const content = blk.content ?? {}
    const keys = Object.keys(content)
    const hasAnyValue =
      keys.length > 0 &&
      keys.some((k) => {
        const v = content[k]
        if (v === null || v === undefined) return false
        if (typeof v === "string") return v.trim().length > 0
        if (Array.isArray(v)) return v.length > 0
        if (typeof v === "object") return Object.keys(v as object).length > 0
        return true
      })
    if (!hasAnyValue) {
      issues.push({
        type: "blocos_vazios",
        severity: "medium",
        message: `Bloco #${idx + 1} (${blk.block_type}) esta vazio.`,
        location: `block:${idx}:${blk.block_type}`,
      })
    }
  })

  // 3. Links: extrai todos href e valida que cada URL e bem-formada
  //    e nao usa scheme `javascript:`.
  const hrefRegex = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/gi
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = hrefRegex.exec(html)) !== null) {
    const url = (m[1] ?? m[2] ?? "").trim()
    if (!url || seen.has(url)) continue
    seen.add(url)

    // Anchor + mailto + tel: aceitos.
    if (url.startsWith("#") || url.startsWith("mailto:") || url.startsWith("tel:")) continue

    if (/^javascript:/i.test(url)) {
      issues.push({
        type: "links_quebrados",
        severity: "high",
        message: `Link com scheme javascript: ${url.slice(0, 80)}`,
        location: "html",
      })
      continue
    }

    try {
      // new URL aceita absolutos. Para relativos, usa base dummy.
      // eslint-disable-next-line no-new
      new URL(url, "https://example.com")
    } catch {
      issues.push({
        type: "links_quebrados",
        severity: "medium",
        message: `URL malformada: ${url.slice(0, 80)}`,
        location: "html",
      })
    }
  }

  return issues
}

// ── Render do user prompt ─────────────────────────────────────────────
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return key in vars ? vars[key] : ""
  })
}

// ── Carrega config ativo (qa) ─────────────────────────────────────────
async function loadActiveQaConfig(): Promise<EmailAgentConfig | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("email_agent_configs")
    .select("*")
    .eq("agent_type", "qa")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    log.warn("qa.config.load_failed", { error: error.message })
    return null
  }
  return (data as EmailAgentConfig | null) ?? null
}

// ── Chamada LangChain com timeout ─────────────────────────────────────
async function invokeWithTimeout(
  model: string,
  temperature: number,
  maxTokens: number,
  systemPrompt: string,
  userPrompt: string,
  signal: AbortSignal,
): Promise<string> {
  const isOpus = model.includes("opus")
  const chat = new ChatAnthropic({
    model,
    ...(isOpus ? {} : { temperature }),
    maxTokens,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  })
  // Passa user prompt cru porque ja foi renderizado (sem placeholders {var}).
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    ["human", "{user}"],
  ])
  const chain = prompt.pipe(chat).pipe(new StringOutputParser())
  return chain.invoke({ user: userPrompt }, { signal })
}

// ── Parse JSON tolerante ──────────────────────────────────────────────
function tryParseQaJson(raw: string): unknown | null {
  // Remove fences ```json / ``` se presentes
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim()

  // Tenta o objeto completo
  try {
    return JSON.parse(cleaned)
  } catch {
    /* fallthrough */
  }

  // Extrai primeiro bloco {...} top-level
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      return JSON.parse(match[0])
    } catch {
      /* noop */
    }
  }
  return null
}

// ── runQaAgent ────────────────────────────────────────────────────────
export interface RunQaAgentInput {
  storeId: string
  emailId: string
  flowId?: string
  batchId?: string
  triggeredBy?: string
  html: string
  blocks: Array<{ block_type: string; content: Record<string, unknown> }>
  briefing: StoreBriefing | null
  brand: StoreBrandIdentity | null
  blueprintObjective: string
}

export async function runQaAgent(input: RunQaAgentInput): Promise<QaResult> {
  const t0 = Date.now()
  const {
    storeId,
    emailId,
    flowId,
    batchId,
    triggeredBy,
    html,
    blocks,
    briefing,
    brand,
    blueprintObjective,
  } = input

  // ── 1. Pre-checks deterministicos ────────────────────────────────────
  const deterministicIssues = runDeterministicChecks(html, blocks)

  // ── 2. Carrega config ativo ──────────────────────────────────────────
  const config = await loadActiveQaConfig()

  if (!config) {
    log.warn("qa.no_active_config_degrade_safe", { emailId, storeId })
    const issues = deterministicIssues
    const result: QaResult = {
      passed: computePassed(issues),
      issues,
      meta: {
        model: "noop",
        tokens_input: 0,
        tokens_output: 0,
        cost_cents: 0,
        duration_ms: Date.now() - t0,
      },
    }
    // Loga ainda assim para telemetria.
    await logGenerationRun({
      storeId,
      flowId,
      emailId,
      triggeredBy,
      batchId: batchId ?? "",
      agent: "qa",
      status: "skipped",
      model: "noop",
      durationMs: result.meta.duration_ms,
      parsedOutput: {
        passed: result.passed,
        issues_count: issues.length,
        deterministic_only: true,
      },
    }).catch(() => {})
    return result
  }

  // ── 3. Renderiza user prompt ─────────────────────────────────────────
  const model = config.model || DEFAULT_MODEL
  const temperature = config.temperature ?? DEFAULT_TEMPERATURE
  const maxTokens = config.max_tokens ?? DEFAULT_MAX_TOKENS
  const systemPrompt = config.system_prompt
  const userTemplate = config.user_template

  const renderVars: Record<string, string> = {
    html,
    blocks_json: JSON.stringify(blocks, null, 2),
    briefing_json: JSON.stringify(briefing ?? {}, null, 2),
    brand_json: JSON.stringify(brand ?? {}, null, 2),
    blueprint_objective: blueprintObjective || "",
  }
  const userPrompt = renderTemplate(userTemplate, renderVars)

  // ── 4. Chama Claude com timeout 15s ─────────────────────────────────
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), QA_TIMEOUT_MS)

  let rawOutput = ""
  try {
    rawOutput = await invokeWithTimeout(
      model,
      temperature,
      maxTokens,
      systemPrompt,
      userPrompt,
      controller.signal,
    )
  } catch (err) {
    clearTimeout(timeoutHandle)
    const aborted = controller.signal.aborted
    const msg = err instanceof Error ? err.message : String(err)
    log.error("qa.llm_call_failed", { emailId, aborted, error: msg })

    const fallbackIssue: QaIssue = {
      type: "html_invalido",
      severity: "high",
      message: aborted ? "qa_timeout" : "qa_llm_error",
      location: "qa",
    }
    const issues = [...deterministicIssues, fallbackIssue]
    const result: QaResult = {
      passed: computePassed(issues),
      issues,
      meta: {
        model: aborted ? "qa-timeout" : model,
        tokens_input: 0,
        tokens_output: 0,
        cost_cents: 0,
        duration_ms: Date.now() - t0,
      },
    }
    await logGenerationRun({
      storeId,
      flowId,
      emailId,
      triggeredBy,
      batchId: batchId ?? "",
      agent: "qa",
      agentConfigId: config.id,
      status: "error",
      model,
      durationMs: result.meta.duration_ms,
      errorMessage: msg,
      parsedOutput: {
        passed: result.passed,
        issues_count: issues.length,
        timeout: aborted,
      },
    }).catch(() => {})
    return result
  }
  clearTimeout(timeoutHandle)

  // ── 5. Parse + Zod validate (com 1 retry) ───────────────────────────
  let parsed = tryParseQaJson(rawOutput)
  let zod = parsed ? QaOutputSchema.safeParse(parsed) : null

  let retryRaw: string | null = null
  if (!parsed || !zod || !zod.success) {
    // Retry pedindo reformatacao estrita.
    const retryController = new AbortController()
    const retryTimeout = setTimeout(() => retryController.abort(), QA_TIMEOUT_MS)
    try {
      const retryPrompt =
        userPrompt +
        '\n\nREFORMATE: responda APENAS JSON valido no formato {"passed": boolean, "issues": [...] }. Sem markdown, sem texto extra.'
      retryRaw = await invokeWithTimeout(
        model,
        temperature,
        maxTokens,
        systemPrompt,
        retryPrompt,
        retryController.signal,
      )
      parsed = tryParseQaJson(retryRaw)
      zod = parsed ? QaOutputSchema.safeParse(parsed) : null
    } catch (err) {
      log.warn("qa.retry_failed", {
        emailId,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      clearTimeout(retryTimeout)
    }
  }

  // Estimativa de tokens (fallback quando o LangChain nao expoe usage).
  const tokensInput = Math.ceil((systemPrompt.length + userPrompt.length) / 4)
  const combinedOutput = (rawOutput || "") + (retryRaw || "")
  const tokensOutput = Math.ceil(combinedOutput.length / 4)
  const costCents = computeCostCents(model, tokensInput, tokensOutput)

  if (!parsed || !zod || !zod.success) {
    log.warn("qa.output_invalid_fallback", { emailId })
    const fallbackIssue: QaIssue = {
      type: "html_invalido",
      severity: "high",
      message: "qa_output_invalid",
      location: "qa",
    }
    const issues = [...deterministicIssues, fallbackIssue]
    const result: QaResult = {
      passed: computePassed(issues),
      issues,
      meta: {
        model,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        cost_cents: costCents,
        duration_ms: Date.now() - t0,
      },
    }
    await logGenerationRun({
      storeId,
      flowId,
      emailId,
      triggeredBy,
      batchId: batchId ?? "",
      agent: "qa",
      agentConfigId: config.id,
      status: "error",
      model,
      tokensInput,
      tokensOutput,
      costCents,
      durationMs: result.meta.duration_ms,
      rawOutput: combinedOutput.slice(0, 5000),
      errorMessage: "qa_output_invalid",
      parsedOutput: {
        passed: result.passed,
        issues_count: issues.length,
        output_invalid: true,
      },
    }).catch(() => {})
    return result
  }

  // ── 6. Mescla deterministicas + LLM ─────────────────────────────────
  const llmIssues = zod.data.issues
  const issues: QaIssue[] = [...deterministicIssues, ...llmIssues]
  const passed = computePassed(issues)

  const issuesBySeverity: Record<QaIssueSeverity, number> = { low: 0, medium: 0, high: 0 }
  for (const iss of issues) issuesBySeverity[iss.severity] += 1

  const result: QaResult = {
    passed,
    issues,
    meta: {
      model,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      cost_cents: costCents,
      duration_ms: Date.now() - t0,
    },
  }

  await logGenerationRun({
    storeId,
    flowId,
    emailId,
    triggeredBy,
    batchId: batchId ?? "",
    agent: "qa",
    agentConfigId: config.id,
    status: "success",
    model,
    tokensInput,
    tokensOutput,
    costCents,
    durationMs: result.meta.duration_ms,
    rawOutput: combinedOutput.slice(0, 5000),
    parsedOutput: {
      passed,
      issues_count: issues.length,
      issues_by_severity: issuesBySeverity,
    },
  }).catch(() => {})

  return result
}
