/**
 * Phase 2 Runner — orquestra image + html + QA em background sob `waitUntil()`.
 *
 * Disparado pelo webhook /api/webhooks/n8n/email-copy logo apos persistir
 * a copy (status `copy_ready`) e pelo endpoint interno /api/internal/run-phase2
 * usado pelo watchdog (story AE-4).
 *
 * **Limite de execucao**: na Vercel Pro, `after()` continua executando ate
 * ~5min apos o response (300s). Fase 2 esperada e 30-90s, com folga. Se algo
 * exceder, o watchdog (AE-4) detecta emails em `rendering` / `qa_running`
 * por > 10min e marca `failed` com `failure_reason='timeout_phase2'`.
 *
 * Diferente de `email-generation.service.ts` (executor sincrono legacy),
 * este runner:
 *   - usa guards atomicos para garantir idempotencia / watchdog-friendly
 *   - chama QA agent (story AE-5 — mockado ate la)
 *   - mantem todas as colunas de timing AE-1 atualizadas
 *   - faz rollup de total_cost_cents ao final
 *   - dispara notificacoes de batch completo (story AE-7 — mockado)
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type {
  StoreBrandIdentity,
  StoreBriefing,
  TopProduct,
} from "@/types/email-workspace"
import type { EmailAgentConfig, QaIssue, QaResult } from "@/types/email-generation"
import {
  generateEmailImage,
  DEFAULT_IMAGE_PROMPT_TEMPLATE,
  renderImagePrompt,
} from "./chains/image.chain"
import {
  createHtmlChain,
  DEFAULT_HTML_SYSTEM_PROMPT,
  DEFAULT_HTML_USER_TEMPLATE,
} from "./chains/html.chain"
import { runQaAgent } from "./chains/qa.chain"
import {
  logGenerationRun,
  computeCostCents,
} from "./callbacks/telemetry.callback"
import { buildImagePromptVars } from "./email-generation.service"

const log = logger.child("Phase2Runner")

// ── QA agent — fallback seguro caso runQaAgent throwe inesperadamente ─
// O runQaAgent ja faz degrade seguro internamente (sem config, timeout,
// JSON invalido). Este fallback so existe para falhas catastroficas
// fora da chain (ex: import error). Mantemos `passed=true` para nao
// derrubar o pipeline quando o QA esta indisponivel — politica AE-5.
async function runQaAgentSafeFallback(params: {
  emailId: string
  storeId: string
}): Promise<QaResult> {
  log.warn("phase2.qa.safe_fallback_invoked", { emailId: params.emailId, storeId: params.storeId })
  return {
    passed: true,
    issues: [],
    meta: {
      model: "qa-fallback",
      tokens_input: 0,
      tokens_output: 0,
      cost_cents: 0,
      duration_ms: 0,
    },
  }
}

// ── Notify hooks — MOCK ate story AE-7 entregar dispatcher real ────────
async function notifyBatchCompleteMock(storeId: string, batchId: string): Promise<void> {
  log.info("phase2.notify.batch_complete_mock", { storeId, batchId })
}

async function notifyTaggedMock(
  tags: string[],
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  log.info("phase2.notify.tagged_mock", { tags, event, payload })
}

// ── Helper: severity threshold via env ────────────────────────────────
function getBlockingSeverity(): QaIssue["severity"] {
  const raw = (process.env.EMAIL_QA_BLOCK_SEVERITY ?? "high").toLowerCase()
  if (raw === "low" || raw === "medium" || raw === "high") return raw
  return "high"
}

function qaShouldBlock(issues: QaIssue[]): boolean {
  const threshold = getBlockingSeverity()
  const order: Record<QaIssue["severity"], number> = { low: 1, medium: 2, high: 3 }
  const thresholdLevel = order[threshold]
  return issues.some((i) => order[i.severity] >= thresholdLevel)
}

// ── Helper: marca email como failed (sempre seguro de chamar) ─────────
async function markEmailFailed(
  emailId: string,
  reason: string,
  qaIssues: QaIssue[] = [],
): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from("email_flow_emails")
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_reason: reason,
      qa_issues: qaIssues,
      updated_at: new Date().toISOString(),
    })
    .eq("id", emailId)
}

// ── Helper: soma cost dos runs do email no batch e grava em email ───
async function rollupTotalCost(emailId: string, batchId: string): Promise<void> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("email_generation_runs")
    .select("cost_cents")
    .eq("email_id", emailId)
    .eq("batch_id", batchId)
  const total = (data ?? []).reduce(
    (acc: number, r: { cost_cents: number | null }) => acc + (r.cost_cents ?? 0),
    0,
  )
  await admin
    .from("email_flow_emails")
    .update({ total_cost_cents: total })
    .eq("id", emailId)
}

// ── Helper: carrega contexto minimo para image + html + qa ────────────
async function loadMinimalContext(storeId: string, emailId: string) {
  const admin = createAdminClient()
  const { data: storeData } = await admin
    .from("client_stores")
    .select("*")
    .eq("id", storeId)
    .single()

  // Resolve blueprint via email -> flow -> flow_type + email.email_number
  const { data: emailRow } = await admin
    .from("email_flow_emails")
    .select("email_number, flow_id")
    .eq("id", emailId)
    .maybeSingle()
  const flowIdForBlueprint = (emailRow?.flow_id as string | undefined) ?? null
  const emailNumberForBlueprint = (emailRow?.email_number as number | undefined) ?? null

  let flowTypeForBlueprint: string | null = null
  if (flowIdForBlueprint) {
    const { data: flowRow } = await admin
      .from("email_flows")
      .select("flow_type")
      .eq("id", flowIdForBlueprint)
      .maybeSingle()
    flowTypeForBlueprint = (flowRow?.flow_type as string | undefined) ?? null
  }

  let blueprintObjective = ""
  if (flowTypeForBlueprint && emailNumberForBlueprint != null) {
    const { data: bpRow } = await admin
      .from("email_blueprints")
      .select("objective")
      .eq("flow_type", flowTypeForBlueprint)
      .eq("email_number", emailNumberForBlueprint)
      .maybeSingle()
    blueprintObjective = (bpRow?.objective as string | undefined) ?? ""
  }

  const orgId = (storeData as Record<string, unknown>)?.org_id as string | undefined

  const [brandRes, briefingRes, htmlConfigRes, settingsRes] = await Promise.all([
    admin
      .from("store_brand_identities")
      .select("*")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("store_briefings")
      .select("*")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("email_agent_configs")
      .select("*")
      .eq("agent_type", "html")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    orgId
      ? admin
          .from("email_generation_settings")
          .select("generate_images")
          .eq("org_id", orgId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const generateImages = (settingsRes.data?.generate_images as boolean | undefined) ?? true

  const topProducts = ((brandRes.data?.top_products ?? []) as TopProduct[]) ?? []

  return {
    storeRaw: (storeData as Record<string, unknown>) ?? { store_name: "Loja" },
    brand: (brandRes.data as StoreBrandIdentity | null) ?? null,
    briefing: (briefingRes.data as StoreBriefing | null) ?? null,
    htmlConfig: (htmlConfigRes.data as EmailAgentConfig | null) ?? null,
    topProducts,
    generateImages,
    blueprintObjective,
  }
}

// ── checkBatchTerminal: chamado apos cada UPDATE final ────────────────
export async function checkBatchTerminal(
  storeId: string,
  batchId: string,
): Promise<void> {
  const admin = createAdminClient()
  const { data: emails, error } = await admin
    .from("email_flow_emails")
    .select("id, status")
    .eq("generation_batch_id", batchId)
  if (error || !emails || emails.length === 0) return

  const allTerminal = emails.every(
    (e: { status: string }) => e.status === "ready" || e.status === "failed",
  )
  if (!allTerminal) return

  try {
    await notifyBatchCompleteMock(storeId, batchId)
  } catch (err) {
    log.warn("phase2.notify.batch_complete_failed", {
      storeId,
      batchId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ── Main: runPhase2InBackground ────────────────────────────────────────
export interface RunPhase2Params {
  storeId: string
  emailId: string
  triggeredBy?: string
}

export async function runPhase2InBackground(
  params: RunPhase2Params,
): Promise<void> {
  const { storeId, emailId, triggeredBy } = params
  const admin = createAdminClient()
  log.info("phase2.start", { storeId, emailId })

  // ── Guard 1: copy_ready -> rendering (atomico) ──────────────────────
  const { data: claimed } = await admin
    .from("email_flow_emails")
    .update({
      status: "rendering",
      rendering_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", emailId)
    .eq("status", "copy_ready")
    .select("id, flow_id, generation_batch_id")

  if (!claimed || claimed.length === 0) {
    log.info("phase2.skipped_already_started", { emailId })
    return
  }

  const flowId = claimed[0].flow_id as string
  const batchId = (claimed[0].generation_batch_id as string | null) ?? ""

  let ctx: Awaited<ReturnType<typeof loadMinimalContext>>
  try {
    ctx = await loadMinimalContext(storeId, emailId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao carregar contexto"
    log.error("phase2.context.error", { emailId, error: msg })
    await markEmailFailed(emailId, "context_load_failed")
    if (batchId) await checkBatchTerminal(storeId, batchId).catch(() => {})
    try {
      await notifyTaggedMock(["cto"], "email_generation_failed", {
        email_id: emailId,
        reason: "context_load_failed",
      })
    } catch { /* noop */ }
    return
  }

  // ── Step 1: Image generation (se habilitado) ─────────────────────────
  if (ctx.generateImages) {
    const { data: imageBlocks } = await admin
      .from("email_blocks")
      .select("id, block_type, label, content")
      .eq("email_id", emailId)
      .in("block_type", ["hero", "custom"])

    for (const blk of imageBlocks ?? []) {
      const imgT0 = Date.now()
      try {
        const promptVars = buildImagePromptVars({
          brand: ctx.brand,
          briefing: ctx.briefing,
          topProducts: ctx.topProducts,
          storeRaw: ctx.storeRaw,
          blockPurpose: (blk.label as string) ?? "hero",
        })
        const prompt = renderImagePrompt(DEFAULT_IMAGE_PROMPT_TEMPLATE, promptVars)
        const imageUrl = await generateEmailImage(prompt, storeId)

        const merged = {
          ...((blk.content as Record<string, unknown>) ?? {}),
          image_url: imageUrl,
          image_alt: blk.label,
        }
        await admin.from("email_blocks").update({ content: merged }).eq("id", blk.id)

        await logGenerationRun({
          storeId,
          flowId,
          emailId,
          triggeredBy,
          batchId,
          agent: "image",
          status: "success",
          model: "openai/gpt-5.4-image-2",
          durationMs: Date.now() - imgT0,
          parsedOutput: { blockId: blk.id, imageUrl },
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro na imagem"
        log.error("phase2.image.error", { emailId, blockId: blk.id, error: msg })
        await logGenerationRun({
          storeId,
          flowId,
          emailId,
          triggeredBy,
          batchId,
          agent: "image",
          status: "error",
          model: "openai/gpt-5.4-image-2",
          durationMs: Date.now() - imgT0,
          errorMessage: msg,
        })
        await markEmailFailed(emailId, "image_failed")
        if (batchId) {
          await rollupTotalCost(emailId, batchId).catch(() => {})
          await checkBatchTerminal(storeId, batchId).catch(() => {})
        }
        try {
          await notifyTaggedMock(["cto"], "email_generation_failed", {
            email_id: emailId,
            reason: "image_failed",
          })
        } catch { /* noop */ }
        return
      }
    }
  } else {
    await logGenerationRun({
      storeId,
      flowId,
      emailId,
      triggeredBy,
      batchId,
      agent: "image",
      status: "skipped",
    })
  }

  // ── Step 2: HTML generation ──────────────────────────────────────────
  const htmlT0 = Date.now()
  let finalHtml = ""
  try {
    const htmlConfig = ctx.htmlConfig
    const model = htmlConfig?.model ?? "claude-sonnet-4-5-20250514"
    const temperature = htmlConfig?.temperature ?? 0.3
    const maxTokens = htmlConfig?.max_tokens ?? 8192
    const systemPrompt = htmlConfig?.system_prompt ?? DEFAULT_HTML_SYSTEM_PROMPT
    const userTemplate = htmlConfig?.user_template ?? DEFAULT_HTML_USER_TEMPLATE

    const { data: updatedBlocks } = await admin
      .from("email_blocks")
      .select("*")
      .eq("email_id", emailId)
      .order("position", { ascending: true })

    const { data: updatedEmail } = await admin
      .from("email_flow_emails")
      .select("subject, preheader, name")
      .eq("id", emailId)
      .single()

    // Reusa buildImagePromptVars para vars basicas — para HTML basta um mapa simples.
    const baseVars = buildImagePromptVars({
      brand: ctx.brand,
      briefing: ctx.briefing,
      topProducts: ctx.topProducts,
      storeRaw: ctx.storeRaw,
      blockPurpose: "html",
    })
    const inputVars: Record<string, string> = {
      ...baseVars,
      email_name: (updatedEmail?.name as string) ?? "",
      subject: (updatedEmail?.subject as string) ?? "",
      preheader: (updatedEmail?.preheader as string) ?? "",
      copy_output: "",
      blocks_with_content: JSON.stringify(
        (updatedBlocks ?? []).map((b: Record<string, unknown>) => ({
          position: b.position,
          type: b.block_type,
          label: b.label,
          content: b.content,
        })),
        null,
        2,
      ),
    }

    // Fill missing template vars to avoid Anthropic errors
    const combined = systemPrompt + userTemplate
    const varPattern = /\{(\w+)\}/g
    let match: RegExpExecArray | null
    while ((match = varPattern.exec(combined)) !== null) {
      const key = match[1]
      if (!(key in inputVars) || inputVars[key] === "") inputVars[key] = "(nenhum)"
    }

    const chain = createHtmlChain({
      model,
      temperature,
      max_tokens: maxTokens,
      system_prompt: systemPrompt,
      user_template: userTemplate,
    })
    let rawHtml = await chain.invoke(inputVars)
    rawHtml = rawHtml.replace(/```(?:html)?\s*/gi, "").trim()
    const doctypeMatch = rawHtml.match(/(<!DOCTYPE[\s\S]*<\/html>)/i)
    if (doctypeMatch) rawHtml = doctypeMatch[1]

    await admin
      .from("email_flow_emails")
      .update({ html: rawHtml, updated_at: new Date().toISOString() })
      .eq("id", emailId)

    const promptText = systemPrompt + JSON.stringify(inputVars)
    const tokensInput = Math.ceil(promptText.length / 4)
    const tokensOutput = Math.ceil(rawHtml.length / 4)
    await logGenerationRun({
      storeId,
      flowId,
      emailId,
      triggeredBy,
      batchId,
      agent: "html",
      agentConfigId: htmlConfig?.id,
      status: "success",
      model,
      tokensInput,
      tokensOutput,
      costCents: computeCostCents(model, tokensInput, tokensOutput),
      durationMs: Date.now() - htmlT0,
    })
    finalHtml = rawHtml
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro no HTML"
    log.error("phase2.html.error", { emailId, error: msg })
    await logGenerationRun({
      storeId,
      flowId,
      emailId,
      triggeredBy,
      batchId,
      agent: "html",
      status: "error",
      durationMs: Date.now() - htmlT0,
      errorMessage: msg,
    })
    await markEmailFailed(emailId, "html_failed")
    if (batchId) {
      await rollupTotalCost(emailId, batchId).catch(() => {})
      await checkBatchTerminal(storeId, batchId).catch(() => {})
    }
    try {
      await notifyTaggedMock(["cto"], "email_generation_failed", {
        email_id: emailId,
        reason: "html_failed",
      })
    } catch { /* noop */ }
    return
  }

  // ── Guard 2: rendering -> qa_running ─────────────────────────────────
  const { data: qaClaimed } = await admin
    .from("email_flow_emails")
    .update({
      status: "qa_running",
      qa_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", emailId)
    .eq("status", "rendering")
    .select("id")

  if (!qaClaimed || qaClaimed.length === 0) {
    log.info("phase2.qa.skipped_already_started", { emailId })
    return
  }

  // ── Step 3: QA (story AE-5 — runQaAgent real, com fallback seguro) ──
  // runQaAgent ja:
  //  - faz pre-checks deterministicos (html_invalido, blocos_vazios, links)
  //  - chama Claude com timeout 15s
  //  - faz retry + fallback se JSON invalido
  //  - persiste telemetria em email_generation_runs
  //  - computa passed via EMAIL_QA_BLOCK_SEVERITY
  // O try/catch externo cobre falhas catastroficas (import error, etc).
  let qaResult: QaResult
  try {
    const { data: qaBlocks } = await admin
      .from("email_blocks")
      .select("block_type, content")
      .eq("email_id", emailId)
      .order("position", { ascending: true })
    const blocksForQa = (qaBlocks ?? []).map((b: Record<string, unknown>) => ({
      block_type: (b.block_type as string) ?? "unknown",
      content: ((b.content as Record<string, unknown>) ?? {}),
    }))
    qaResult = await runQaAgent({
      storeId,
      emailId,
      flowId,
      batchId,
      triggeredBy,
      html: finalHtml,
      blocks: blocksForQa,
      briefing: ctx.briefing,
      brand: ctx.brand,
      blueprintObjective: ctx.blueprintObjective,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro no QA"
    log.error("phase2.qa.unexpected_error", { emailId, error: msg })
    // Fallback seguro: nao bloqueia o pipeline por falha catastrofica
    // do agente; loga e segue como passed=true. Issues internas de
    // qa.chain.ts (timeout, JSON invalido) NUNCA chegam aqui — sao
    // tratadas la dentro.
    qaResult = await runQaAgentSafeFallback({ emailId, storeId })
  }

  // ── AC AE-3.5 + AE-5.4: QA decide status final ──────────────────────
  const blockedByQa = !qaResult.passed || qaShouldBlock(qaResult.issues)
  if (blockedByQa) {
    await admin
      .from("email_flow_emails")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: "qa_failed",
        qa_issues: qaResult.issues,
        updated_at: new Date().toISOString(),
      })
      .eq("id", emailId)
    if (batchId) await rollupTotalCost(emailId, batchId).catch(() => {})
    if (batchId) await checkBatchTerminal(storeId, batchId).catch(() => {})
    try {
      await notifyTaggedMock(["cto"], "email_generation_failed", {
        email_id: emailId,
        reason: "qa_failed",
        issues: qaResult.issues,
      })
    } catch { /* noop */ }
    log.info("phase2.qa.blocked", { emailId, issuesCount: qaResult.issues.length })
    return
  }

  // ── Sucesso: status='ready' ──────────────────────────────────────────
  await admin
    .from("email_flow_emails")
    .update({
      status: "ready",
      ready_at: new Date().toISOString(),
      qa_issues: qaResult.issues,
      updated_at: new Date().toISOString(),
    })
    .eq("id", emailId)
  if (batchId) await rollupTotalCost(emailId, batchId).catch(() => {})
  if (batchId) await checkBatchTerminal(storeId, batchId).catch(() => {})

  log.info("phase2.done", { storeId, emailId, batchId })
}
