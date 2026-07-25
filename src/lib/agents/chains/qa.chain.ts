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
  resolveCostCents,
  finishGenerationRun,
  logGenerationRun,
  startGenerationRun,
} from "../callbacks/telemetry.callback"
import { invokeOpenRouter, isOpenRouterModel } from "../openrouter-invoke"
import { runQaVisionCheck } from "./qa-vision.chain"

const log = logger.child("QaChain")

// ── Constantes ─────────────────────────────────────────────────────────
const DEFAULT_QA_TIMEOUT_MS = 60_000
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
  // ── Story AE-15: image niche-adaptive cascade ─────────
  "image_nicho_mismatch",
  "image_paleta_off",
  "image_overlay_reserva_ausente",
  "image_cena_inadequada",
  // ── Validação contra output_schema (blueprint híbrido) ─
  "copy_excede_max_len",
  "campo_obrigatorio_vazio",
] as const satisfies readonly QaIssueType[]

const QA_SEVERITIES = ["low", "medium", "high"] as const satisfies readonly QaIssueSeverity[]

// Instrucao fixa appendada ao user prompt: ensina o LLM a tratar merge tags
// como conteudo valido, nao como link quebrado / violacao de compliance.
// Esta in-code (nao no DB) para nao perder a garantia se alguem editar o
// prompt versionado pela UI.
const MERGE_TAGS_INSTRUCTION = `

## MERGE TAGS (CRITICO — nao sinalize como issue)

Hrefs e textos no formato:
- \`[chave]\` (ex: \`[unsubscribe_link]\`, \`[email]\`, \`[first_name]\`)
- \`{{ chave }}\` ou \`{{chave}}\` (Liquid / Handlebars)
- \`{% bloco %}\` (Liquid blocks, ex: \`{% unsubscribe %}\`)
- \`*|CHAVE|*\` (Mailchimp / Mandrill)
- \`\${chave}\` (template strings)

sao placeholders de merge tag do provedor de envio (Klaviyo, Mailchimp,
Omnisend) que sao substituidos no momento do disparo. NAO sao link
quebrado, NAO violam compliance (CAN-SPAM/GDPR — o opt-out funciona depois
da substituicao no envio), NAO sao claim sem cobertura. Trate como
conteudo dinamico valido.`

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

/**
 * Timeout (ms) da chamada do QA ao LLM. Configurável via
 * EMAIL_QA_TIMEOUT_MS; default 60s. O HTML agent imediatamente antes pode
 * levar ~2min — 15s abortava QAs legítimos sobre HTML real + contexto.
 */
export function getQaTimeoutMs(): number {
  const raw = Number(process.env.EMAIL_QA_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_QA_TIMEOUT_MS
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
  //    Merge tags do provedor de envio (Klaviyo, Mailchimp, Omnisend, etc.)
  //    sao placeholders que serao substituidos no envio — NAO sao link
  //    quebrado. Cobre `[chave]`, `{{chave}}`, `{% bloco %}`, `*|CHAVE|*`
  //    e `${chave}`. O QA antes flagava `[unsubscribe_link]` como malformado
  //    e isso bloqueava emails legitimos.
  const MERGE_TAG_HREF =
    /^(\[[a-z0-9_]+\]|\{\{\s*[^}]+\s*\}\}|\{%\s*[^%]+\s*%\}|\*\|[^|]+\|\*|\$\{[^}]+\})$/i
  const hrefRegex = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/gi
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = hrefRegex.exec(html)) !== null) {
    const url = (m[1] ?? m[2] ?? "").trim()
    if (!url || seen.has(url)) continue
    seen.add(url)

    // Anchor + mailto + tel: aceitos.
    if (url.startsWith("#") || url.startsWith("mailto:") || url.startsWith("tel:")) continue

    // Merge tag de provedor de envio — substituido no disparo.
    if (MERGE_TAG_HREF.test(url)) continue

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

// ── Validação determinística contra o output_schema da variante ───────
// (blueprint híbrido: blueprint.blocks[].fields — snapshot v2 gravado pelo
// builder). Matching bloco↔blueprint por índice + type (blocks chegam
// ordenados por position; mesma convenção position-1 do dispatch). Sem
// fields → skip silencioso (emails legados/fallback). Custo zero.
interface SchemaCheckBlueprintBlock {
  type: string
  fields?: Array<{
    key: string
    type: string
    max_len: number
    required: boolean
  }> | null
}

export function runSchemaChecks(
  blocks: Array<{ block_type: string; content: Record<string, unknown> }>,
  blueprintBlocks: SchemaCheckBlueprintBlock[],
): QaIssue[] {
  const issues: QaIssue[] = []

  blocks.forEach((block, i) => {
    const bp = blueprintBlocks[i]
    if (!bp || bp.type !== block.block_type) return
    const fields = bp.fields ?? []
    if (fields.length === 0) return

    for (const f of fields) {
      // Campos de imagem são preenchidos pelo pipeline (image agent), não
      // pela copy — fora da validação.
      if (f.type === "image") continue
      const value = block.content?.[f.key]

      if (f.required && (value == null || String(value).trim() === "")) {
        issues.push({
          type: "campo_obrigatorio_vazio",
          severity: "medium",
          message: `Campo obrigatório "${f.key}" vazio no bloco ${block.block_type} #${i + 1}`,
          location: `bloco ${i + 1} (${block.block_type}) · ${f.key}`,
        })
        continue
      }

      if (
        f.max_len > 0 &&
        typeof value === "string" &&
        value.length > f.max_len
      ) {
        const excess = (value.length - f.max_len) / f.max_len
        issues.push({
          type: "copy_excede_max_len",
          // ≤15% acima = low (aperto leve); >15% = medium (estoura o layout).
          severity: excess > 0.15 ? "medium" : "low",
          message: `Campo "${f.key}" com ${value.length} chars (máx ${f.max_len}) no bloco ${block.block_type} #${i + 1}`,
          location: `bloco ${i + 1} (${block.block_type}) · ${f.key}`,
        })
      }
    }
  })

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

  // Roteamento por id: "vendor/model" (ex.: anthropic/claude-sonnet-4.6) vai
  // pelo OpenRouter; demais usam o ChatAnthropic (SDK direto).
  if (isOpenRouterModel(model)) {
    const or = await invokeOpenRouter({
      model,
      systemPrompt,
      userMessage: userPrompt,
      maxTokens,
      temperature: isOpus ? undefined : temperature,
      timeoutMs: getQaTimeoutMs(),
      title: "Convertfy Admin QA",
    })
    return or.text
  }

  const chat = new ChatAnthropic({
    model,
    ...(isOpus ? {} : { temperature }),
    maxTokens,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  })
  // System e user entram como VALORES (vars {system}/{user}), não como
  // template. Ambos já vêm prontos e podem conter chaves literais ({ }) —
  // ex.: exemplos de JSON no system prompt. Passá-los crus no fromMessages
  // faria o parser f-string do LangChain estourar "Single '}' in template.".
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "{system}"],
    ["human", "{user}"],
  ])
  const chain = prompt.pipe(chat).pipe(new StringOutputParser())
  return chain.invoke({ system: systemPrompt, user: userPrompt }, { signal })
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
  // Override do QA Vision vindo de email_generation_settings.qa_vision_enabled.
  // null/undefined = respeita a env EMAIL_QA_VISION_ENABLED (comportamento
  // original); true/false = decisão explícita da aba Configurações.
  qaVisionEnabled?: boolean | null
  // Blocos do blueprint efetivo (com fields v2 do blueprint híbrido) —
  // habilita runSchemaChecks (validação max_len/required contra o
  // output_schema da variante). Ausente/vazio → skip.
  blueprintBlocks?: SchemaCheckBlueprintBlock[]
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
  const deterministicIssues = [
    ...runDeterministicChecks(html, blocks),
    ...runSchemaChecks(blocks, input.blueprintBlocks ?? []),
  ]

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
  // Append fixo: merge tags do provedor (Klaviyo, Mailchimp, Omnisend) sao
  // substituidas no envio — nao sao bug. Antes do fix o LLM marcava
  // `[unsubscribe_link]` como links_quebrados/compliance/claim_nao_coberto e
  // bloqueava emails legitimos. Forcado in-code pra nao depender do prompt
  // versionado no DB.
  const userPrompt =
    renderTemplate(userTemplate, renderVars) + MERGE_TAGS_INSTRUCTION

  // Run 'running' aberto antes da chamada LLM (live view).
  const qaRunId = await startGenerationRun({
    storeId,
    flowId,
    emailId,
    triggeredBy,
    batchId: batchId ?? "",
    agent: "qa",
    agentConfigId: config.id,
    model,
  }).catch(() => "")

  // ── 4. Chama Claude com timeout 15s ─────────────────────────────────
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), getQaTimeoutMs())

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
    await finishGenerationRun(qaRunId, {
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
    const retryTimeout = setTimeout(() => retryController.abort(), getQaTimeoutMs())
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
  const costCents = resolveCostCents({ model, tokensInput, tokensOutput })

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
    await finishGenerationRun(qaRunId, {
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

  // ── 6b. Story AE-15: cascade QA vision (Etapa 2) ────────────────────
  // Dispara somente se feature flag ON E filtro determinístico passou
  // (sem image_nicho_mismatch high da Etapa 1 textual).
  // Falha graceful: vision throw/timeout vira 0 issues + log.warn em
  // runQaVisionCheck — nao bloqueia o passed do textual.
  const visionEnabled =
    input.qaVisionEnabled ?? process.env.EMAIL_QA_VISION_ENABLED === "true"
  // Marca se vision realmente executou (lido pela view v_email_generation_logs
  // pra derivar bucket 'qavision' no dashboard).
  let visionRan = false
  const stage1BlockedImage = issues.some(
    (i) => i.type === "image_nicho_mismatch" && i.severity === "high",
  )
  if (visionEnabled && !stage1BlockedImage) {
    const imageBlocks = blocks
      .map((b, idx) => ({ b, idx }))
      .filter(({ b }) => {
        if (b.block_type !== "hero" && b.block_type !== "image") return false
        const url = (b.content as Record<string, unknown> | null)?.image_url
        return typeof url === "string" && url.length > 0
      })
      // Cap em 3 chamadas paralelas pra nao estourar timeout/custo.
      .slice(0, 3)

    if (imageBlocks.length > 0) {
      const nicho = briefing?.marca?.nicho ?? ""
      const produtoHeroi =
        (brand?.top_products ?? [])[0]?.name ?? ""
      const paleta1 = (brand?.colors_primary ?? [])[0]?.hex ?? ""
      const paleta2 = (brand?.colors_secondary ?? [])[0]?.hex ?? ""

      const visionPromises = imageBlocks.map(({ b, idx }) => {
        const url = (b.content as Record<string, unknown>).image_url as string
        return runQaVisionCheck({
          imageUrl: url,
          nicho,
          produtoHeroi,
          paleta1,
          paleta2,
          // MVP: assume reserve esperado por default (mesma logica
          // do phase2-runner que usa true como fallback do blueprint).
          overlayReserveExpected: true,
          location: `block:${idx}:${b.block_type}`,
        })
      })

      const visionResults = await Promise.allSettled(visionPromises)
      for (const r of visionResults) {
        if (r.status === "fulfilled") {
          issues.push(...r.value.issues)
        }
      }
      visionRan = visionResults.length > 0
      // TODO (AE-15 review IMPORTANTE): vision retorna `costCents` mas
      // o `logGenerationRun` abaixo so contabiliza o custo textual.
      // Quando ops ativar `EMAIL_QA_VISION_ENABLED=true`, agregar:
      //   const visionTotalCost = visionResults.reduce((acc, r) =>
      //     acc + (r.status === "fulfilled" ? r.value.costCents : 0), 0)
      // E somar em `costCents` ao logar, ou adicionar coluna
      // `vision_cost_cents` em email_generation_runs pra auditoria.
      // Diferido ate flag ON em prod (zero impacto hoje, flag OFF).
    }
  }

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

  await finishGenerationRun(qaRunId, {
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
      vision_ran: visionRan,
    },
  }).catch(() => {})

  return result
}
