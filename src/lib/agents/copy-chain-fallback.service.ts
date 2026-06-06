/**
 * Copy Chain Fallback Service (Epic AE — Story AE-4)
 *
 * Fallback in-process executado pelo watchdog quando o n8n nao retorna
 * com a copy gerada dentro do threshold (15min). Reusa `createCopyChain`
 * (LangChain + ChatAnthropic) — mesmo padrao do resto do pipeline AE,
 * sem Anthropic SDK direto.
 *
 * Fluxo:
 *   1. Resolve flow_type + email_number do email
 *   2. Carrega contexto (briefing, brand, blueprint, top products)
 *   3. Carrega config ativa de agent_type='copy'
 *   4. Invoca LangChain chain — retorna JSON {subject, preheader, blocks[]}
 *   5. Persiste subject/preheader em email_flow_emails (mesmo shape do
 *      webhook n8n) + content em email_blocks (UPSERT por block_id|position)
 *   6. Marca status='copy_ready', copy_ready_at=now()
 *   7. Loga email_generation_runs com agent='copy', metadata.fallback=true
 *   8. Dispatcha fase 2 in-process via `after(runPhase2InBackground)`
 *
 * Em qualquer falha intermediaria: marca email status='failed',
 * failure_reason='copy_fallback_failed' e loga o erro.
 *
 * Refs: docs/stories/AE-4.watchdog-cron-fallback.md
 */

import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type {
  StoreBrandIdentity,
  StoreBriefing,
  TopProduct,
} from "@/types/email-workspace"
import type { EmailAgentConfig, EmailBlueprint } from "@/types/email-generation"
import {
  createCopyChain,
  DEFAULT_COPY_SYSTEM_PROMPT,
  DEFAULT_COPY_USER_TEMPLATE,
} from "./chains/copy.chain"
import { logGenerationRun, computeCostCents } from "./callbacks/telemetry.callback"
import { runPhase2InBackground } from "./phase2-runner.service"

const log = logger.child("CopyChainFallback")

export interface RunCopyChainInProcessParams {
  emailId: string
  storeId: string
  triggeredBy?: string
}

interface CopyOutput {
  subject?: string
  preheader?: string | null
  blocks?: Array<{
    block_id?: string
    position?: number
    content?: Record<string, unknown>
  }>
}

/**
 * Marca email como falho com failure_reason e loga telemetria.
 * Best-effort: erros internos sao silenciados (ja estamos no caminho de erro).
 */
async function markFailed(
  emailId: string,
  storeId: string,
  flowId: string | null,
  batchId: string | null,
  reason: string,
  errorMessage: string,
  triggeredBy?: string,
): Promise<void> {
  const admin = createAdminClient()
  try {
    await admin
      .from("email_flow_emails")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", emailId)
  } catch (e) {
    log.warn("fallback.mark_failed.error", {
      emailId,
      error: e instanceof Error ? e.message : String(e),
    })
  }
  try {
    await logGenerationRun({
      storeId,
      flowId: flowId ?? undefined,
      emailId,
      triggeredBy,
      batchId: batchId ?? "",
      agent: "copy",
      status: "error",
      errorMessage,
      parsedOutput: { fallback: true },
    })
  } catch {
    /* noop */
  }
}

/**
 * Heuristica simples para extrair JSON do output do modelo.
 * Aceita: markdown ```json ... ```, prefixos com texto e JSON puro.
 */
function tryParseJson(raw: string): CopyOutput | null {
  if (!raw) return null
  const stripped = raw
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim()
  try {
    return JSON.parse(stripped) as CopyOutput
  } catch {
    // Tenta extrair do primeiro { ate o ultimo }
    const start = stripped.indexOf("{")
    const end = stripped.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1)) as CopyOutput
      } catch {
        return null
      }
    }
    return null
  }
}

async function loadContext(
  storeId: string,
  flowType: string,
  emailNumber: number,
) {
  const admin = createAdminClient()

  const [storeRes, brandRes, briefingRes, blueprintRes, copyConfigRes] =
    await Promise.all([
      admin.from("client_stores").select("*").eq("id", storeId).single(),
      admin
        .from("store_brand_identity")
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
        .from("email_blueprints")
        .select("*")
        .eq("flow_type", flowType)
        .eq("email_number", emailNumber)
        .maybeSingle(),
      admin
        .from("email_agent_configs")
        .select("*")
        .eq("agent_type", "copy")
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  return {
    storeRaw: (storeRes.data as Record<string, unknown> | null) ?? { store_name: "Loja" },
    brand: (brandRes.data as StoreBrandIdentity | null) ?? null,
    briefing: (briefingRes.data as StoreBriefing | null) ?? null,
    blueprint: (blueprintRes.data as EmailBlueprint | null) ?? null,
    copyConfig: (copyConfigRes.data as EmailAgentConfig | null) ?? null,
    topProducts: ((brandRes.data?.top_products as TopProduct[] | undefined) ?? []),
  }
}

function buildInputVars(
  ctx: Awaited<ReturnType<typeof loadContext>>,
  flowType: string,
  emailNumber: number,
  blocks: Array<{ id: string; position: number; type: string; label: string | null }>,
): Record<string, string> {
  const marca = (ctx.briefing?.marca ?? {}) as Record<string, unknown>
  const detail = (ctx.briefing?.briefing ?? {}) as Record<string, unknown>

  const blueprintObjective = (ctx.blueprint?.objective as string | undefined) ?? ""
  const blueprintMessaging = (ctx.blueprint?.messaging as string | undefined) ?? ""

  const blocksJson = JSON.stringify(
    blocks.map((b) => ({
      block_id: b.id,
      position: b.position,
      type: b.type,
      label: b.label,
    })),
    null,
    2,
  )

  const topProductsStr =
    ctx.topProducts.length > 0
      ? JSON.stringify(
          ctx.topProducts.slice(0, 5).map((p) => ({
            name: p.name,
            price: p.price,
            image_url: p.image_url,
            url: p.url ?? "",
          })),
          null,
          2,
        )
      : "Nenhum produto disponível"

  const vars: Record<string, string> = {
    brand_name: (ctx.storeRaw.store_name as string) ?? "Loja",
    slogan: (marca.slogan as string) ?? "",
    tom_voz: (marca.tom_voz as string) ?? "casual",
    persona: (marca.persona as string) ?? "",
    diferencial: (marca.diferencial as string) ?? "",
    restricoes: Array.isArray(detail.restricoes)
      ? (detail.restricoes as string[]).join("; ")
      : "",
    posicionamento: (marca.posicionamento as string) ?? "medio",
    top_products: topProductsStr,
    flow_type: flowType,
    email_number: String(emailNumber),
    objective: blueprintObjective,
    messaging: blueprintMessaging,
    blocks_json: blocksJson,
  }

  // Sanitiza: Anthropic rejeita text blocks vazios.
  for (const k of Object.keys(vars)) {
    if (vars[k] === "") vars[k] = "(nenhum)"
  }
  return vars
}

/**
 * Executa o fallback de copy in-process para 1 email.
 *
 * Pre-condicao: o watchdog ja marcou o email como `copy_generating_recovery`
 * via UPDATE atomico, garantindo que apenas 1 cron pega este email.
 */
export async function runCopyChainInProcess(
  params: RunCopyChainInProcessParams,
): Promise<void> {
  const { emailId, storeId, triggeredBy } = params
  const admin = createAdminClient()
  const t0 = Date.now()
  log.info("fallback.start", { emailId, storeId })

  // 1. Buscar email + flow para descobrir flow_type / email_number / batch_id
  const { data: emailRow, error: emailErr } = await admin
    .from("email_flow_emails")
    .select(
      "id, flow_id, number, generation_batch_id, flow:email_flows(flow_type)",
    )
    .eq("id", emailId)
    .maybeSingle()

  if (emailErr || !emailRow) {
    log.error("fallback.email_not_found", { emailId, error: emailErr?.message })
    await markFailed(
      emailId,
      storeId,
      null,
      null,
      "copy_fallback_failed",
      emailErr?.message ?? "email_not_found",
      triggeredBy,
    )
    return
  }

  const flowId = (emailRow.flow_id as string) ?? null
  const batchId = (emailRow.generation_batch_id as string | null) ?? null
  const flowRel = Array.isArray(emailRow.flow) ? emailRow.flow[0] : emailRow.flow
  const flowType = (flowRel as { flow_type?: string } | null)?.flow_type ?? "welcome"
  const emailNumber = (emailRow.number as number) ?? 1

  try {
    // 2. Carregar contexto + blocos existentes
    const ctx = await loadContext(storeId, flowType, emailNumber)

    const { data: blocksData } = await admin
      .from("email_blocks")
      .select("id, position, block_type, label")
      .eq("email_id", emailId)
      .order("position", { ascending: true })

    const blocks =
      (blocksData ?? []).map((b: Record<string, unknown>) => ({
        id: b.id as string,
        position: b.position as number,
        type: b.block_type as string,
        label: (b.label as string | null) ?? null,
      })) ?? []

    if (blocks.length === 0) {
      log.warn("fallback.no_blocks", { emailId })
      await markFailed(
        emailId,
        storeId,
        flowId,
        batchId,
        "copy_fallback_failed",
        "no_blocks_to_fill",
        triggeredBy,
      )
      return
    }

    // 3. Construir chain a partir do config ativo
    const cfg = ctx.copyConfig
    const model = cfg?.model ?? "claude-sonnet-4-5-20250514"
    const temperature = cfg?.temperature ?? 0.7
    const maxTokens = cfg?.max_tokens ?? 4096
    const systemPrompt = cfg?.system_prompt ?? DEFAULT_COPY_SYSTEM_PROMPT
    const userTemplate = cfg?.user_template ?? DEFAULT_COPY_USER_TEMPLATE

    const inputVars = buildInputVars(ctx, flowType, emailNumber, blocks)

    const chain = createCopyChain({
      model,
      temperature,
      max_tokens: maxTokens,
      system_prompt: systemPrompt,
      user_template: userTemplate,
    })

    const chainT0 = Date.now()
    const rawOutput = await chain.invoke(inputVars)
    const chainDuration = Date.now() - chainT0

    // 4. Parse output
    const parsed = tryParseJson(rawOutput)
    if (!parsed || !parsed.subject) {
      log.error("fallback.parse_failed", {
        emailId,
        rawSample: rawOutput.slice(0, 200),
      })
      await logGenerationRun({
        storeId,
        flowId: flowId ?? undefined,
        emailId,
        triggeredBy,
        batchId: batchId ?? "",
        agent: "copy",
        status: "error",
        model,
        rawOutput: rawOutput.slice(0, 2000),
        durationMs: chainDuration,
        errorMessage: "parse_failed",
        parsedOutput: { fallback: true },
      })
      await markFailed(
        emailId,
        storeId,
        flowId,
        batchId,
        "copy_fallback_failed",
        "parse_failed",
        triggeredBy,
      )
      return
    }

    // 5. Persistir copy (mesmo shape do webhook do n8n)
    const nowIso = new Date().toISOString()
    const { error: updEmailErr } = await admin
      .from("email_flow_emails")
      .update({
        subject: parsed.subject,
        preheader: parsed.preheader ?? null,
        status: "copy_ready",
        copy_ready_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", emailId)

    if (updEmailErr) throw updEmailErr

    // 6. Persistir blocks.content. Aceitamos match por block_id ou por position.
    const blocksById = new Map(blocks.map((b) => [b.id, b]))
    const blocksByPosition = new Map(blocks.map((b) => [b.position, b]))
    let blocksWritten = 0
    for (const out of parsed.blocks ?? []) {
      if (!out.content) continue
      let targetId: string | null = null
      if (out.block_id && blocksById.has(out.block_id)) {
        targetId = out.block_id
      } else if (
        typeof out.position === "number" &&
        blocksByPosition.has(out.position)
      ) {
        targetId = blocksByPosition.get(out.position)!.id
      }
      if (!targetId) continue
      const { error: blkErr } = await admin
        .from("email_blocks")
        .update({ content: out.content })
        .eq("id", targetId)
        .eq("email_id", emailId)
      if (!blkErr) blocksWritten++
    }

    // 7. Telemetria do run (fallback=true)
    const tokensInput = Math.ceil(
      (systemPrompt + JSON.stringify(inputVars)).length / 4,
    )
    const tokensOutput = Math.ceil(rawOutput.length / 4)
    const costCents = computeCostCents(model, tokensInput, tokensOutput)
    await logGenerationRun({
      storeId,
      flowId: flowId ?? undefined,
      emailId,
      triggeredBy,
      batchId: batchId ?? "",
      agent: "copy",
      agentConfigId: cfg?.id,
      status: "success",
      model,
      rawOutput: rawOutput.slice(0, 2000),
      parsedOutput: {
        subject: parsed.subject,
        preheader: parsed.preheader ?? null,
        blocks_written: blocksWritten,
        blocks_total: (parsed.blocks ?? []).length,
        fallback: true,
      },
      tokensInput,
      tokensOutput,
      costCents,
      durationMs: chainDuration,
    })

    log.info("fallback.done", {
      emailId,
      blocksWritten,
      ms: Date.now() - t0,
    })

    // 8. Dispatch fase 2 in-process (mesmo padrao do webhook do n8n)
    try {
      after(
        runPhase2InBackground({
          storeId,
          emailId,
          triggeredBy: triggeredBy ?? "watchdog:copy_fallback",
        }),
      )
    } catch (afterErr) {
      log.warn("fallback.after_unavailable", {
        error: afterErr instanceof Error ? afterErr.message : String(afterErr),
      })
      void runPhase2InBackground({
        storeId,
        emailId,
        triggeredBy: triggeredBy ?? "watchdog:copy_fallback",
      }).catch((e: unknown) =>
        log.error("fallback.phase2.bg.error", {
          error: e instanceof Error ? e.message : String(e),
        }),
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    log.error("fallback.error", { emailId, storeId, error: msg })
    await markFailed(
      emailId,
      storeId,
      flowId,
      batchId,
      "copy_fallback_failed",
      msg,
      triggeredBy,
    )
  }
}
