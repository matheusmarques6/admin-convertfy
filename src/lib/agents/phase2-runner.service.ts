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
 *   - chama o QA agent real via `runQaAgent` (story AE-5)
 *   - mantem todas as colunas de timing AE-1 atualizadas
 *   - faz rollup de total_cost_cents ao final
 *   - dispara notificacoes de batch completo via `generation-notify.service`
 *     (story AE-7) — `notifyBatchComplete` ou `notifyBatchAllFailed`
 */

import { createHash } from "crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type {
  StoreBrandIdentity,
  StoreBriefing,
  TopProduct,
} from "@/types/email-workspace"
import type {
  EmailAgentConfig,
  EmailBlueprint,
  QaIssue,
  QaResult,
  StoreImageOverrides,
} from "@/types/email-generation"
import {
  generateEmailImage,
  DEFAULT_IMAGE_PROMPT_TEMPLATE,
  renderImagePrompt,
  OPENROUTER_IMAGE_MODEL,
} from "./chains/image.chain"
import { renderImageTemplate } from "./image/template-renderer"
import { deriveToneKeys } from "./shared/component-dimensions"
import {
  resolveAspectForBlock,
  blockAspectFromBlueprint,
  imageDimsFromBlueprint,
  aspectInstructionForPrompt,
  dimsInstructionForPrompt,
  isAspectKey,
  type AspectKey,
} from "./image/aspect-ratio"
import {
  resolveImageMode,
  productRefDescriptionFallback,
} from "./image/mode-resolution"
import { isUsableProductImage } from "./image/product-image-guard"
import { personaToText } from "./image/persona-text"
import { buildImageAlt } from "./image/resolve-block-prompt.service"
import { computeRenderChecks } from "./html/render-checks"
import { runQaAgent } from "./chains/qa.chain"
// ── Cadeia de formatação (split do HTML agent, migration 20261039) ──
import {
  invokeHeroChain,
  decideHeroVision,
  heroShapeOf,
} from "./chains/hero.chain"
import {
  invokeTextFormatChain,
  textFormatGuard,
  invokeTextExceptionChain,
} from "./chains/text-format.chain"
import { invokeImageFormatChain } from "./chains/image-format.chain"
import { invokeColorFormatChain } from "./chains/color-format.chain"
import type { FormatChainConfig } from "./chains/format-invoke"
import { usageOf } from "./chains/step-usage"
import {
  loadFormatChainContext,
  resolveHeroVariant,
  buildHeroVars,
  buildTextFormatVars,
  buildImageFormatVars,
  buildColorFormatVars,
  type FormatChainContext,
  type HeroVariantData,
  type HeroVariantSource,
} from "./html/format-context"
import {
  copyMerge,
  mergeBlocksFromContext,
  buildExceptionSlots,
  buildMergeVerifierInput,
  applyStructuralFills,
  tagToBlockIdMap,
  type MergeField,
} from "./html/copy-merge"
import {
  invokeMergeVerifierChain,
  type MergeVerifierExcecao,
} from "./chains/merge-verifier.chain"
import {
  buildQaBlockViews,
  viewsFromBlocksFallback,
  type QaBlockView,
} from "./html/qa-views"
import { annotateSlots, stripSlotAttributes } from "./html/slot-annotate"
import {
  buildBlockContracts,
  contractTags,
  measureOpsAgainstContract,
} from "./html/block-contract"
import {
  locateHeroRegion,
  spliceHero,
  heroUnchanged,
  respliceHero,
  stripSentinels,
  extractHeroBySentinels,
} from "./html/hero-locator"
import {
  graftHeroVariant,
  normalizeFonts,
  type GraftStatus,
} from "./html/hero-graft"
import { effectiveVariantHtml } from "./shared/component-dimensions"
import { resolveRenderedReference } from "./shared/rendered-reference"
import { applyOps, parseOps } from "./html/apply-patches"
import {
  stripUnresolvedPlaceholders,
  stripCfyBlockMarkers,
  stripAgentProtocolBlocks,
  stripNbspIndentation,
  enforceLangAttribute,
} from "./html/post-process"
import { pesquisaToFullText, type PesquisaFields } from "@/lib/briefing/briefing-text"
import {
  logGenerationRun,
  startGenerationRun,
  finishGenerationRun,
  resolveCostCents,
} from "./callbacks/telemetry.callback"
import { buildImagePromptVars } from "./email-generation.service"
import { MAX_AI_IMAGES } from "./image/limits"
import { loadTopProducts } from "./top-products"
import {
  loadEffectiveBlueprint,
  isTextOnlyEmail,
} from "./architect/blueprint-loader"
import { isBrandConfirmed } from "./html/brand-guards"

const log = logger.child("Phase2Runner")

/**
 * true se o email é "somente texto" (email_blueprints.text_only). No fluxo
 * NOVO esses emails nunca chegam aqui (o callback de copy os marca `ready`
 * direto); os guards que usam isto cobrem LEGADO — emails que já estavam em
 * copy_ready/rendering/image_done quando a flag foi ligada.
 */
async function resolveTextOnlyForEmail(
  admin: ReturnType<typeof createAdminClient>,
  emailId: string,
): Promise<boolean> {
  const { data: email } = await admin
    .from("email_flow_emails")
    .select("number, flow_id")
    .eq("id", emailId)
    .maybeSingle()
  if (!email) return false
  const { data: flow } = await admin
    .from("email_flows")
    .select("flow_type")
    .eq("id", email.flow_id as string)
    .maybeSingle()
  if (!flow?.flow_type) return false
  return isTextOnlyEmail(admin, flow.flow_type as string, email.number as number)
}

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

// ── Notify hooks — story AE-7: real dispatchers via generation-notify ──
// Wrappers garantem que falhas no notify NUNCA propagam para o pipeline.
// O proprio notify-service ja faz try/catch interno; este `try` extra e
// uma rede de seguranca para imports / acesso DB.
import {
  notifyBatchComplete,
  notifyBatchAllFailed,
  notifyEmailFailed,
} from "./generation-notify.service"

async function safeNotifyEmailFailed(
  storeId: string,
  emailId: string,
  failureReason: string,
  batchId: string | null,
): Promise<void> {
  try {
    await notifyEmailFailed({ storeId, emailId, failureReason, batchId })
  } catch (err) {
    log.warn("phase2.notify.email_failed_unexpected", {
      storeId,
      emailId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function safeNotifyBatchTerminal(
  storeId: string,
  batchId: string,
): Promise<void> {
  try {
    // Decide entre batch_complete e batch_all_failed olhando o resumo
    // do batch. Mantemos isso aqui (e nao em checkBatchTerminal) para
    // que o caller mantenha controle e testabilidade clara.
    const admin = createAdminClient()
    const { data: emails } = await admin
      .from("email_flow_emails")
      .select("status")
      .eq("generation_batch_id", batchId)
    const list = (emails ?? []) as Array<{ status: string }>
    if (list.length === 0) return
    const allFailed = list.every((e) => e.status === "failed")
    if (allFailed) {
      await notifyBatchAllFailed({ storeId, batchId })
    } else {
      await notifyBatchComplete({ storeId, batchId })
    }
  } catch (err) {
    log.warn("phase2.notify.batch_terminal_unexpected", {
      storeId,
      batchId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// Severity threshold + decisao de bloqueio ficam centralizadas em qa.chain.ts
// (export `computePassed` ou flag `qaResult.passed`). Phase 2 confia em
// `qaResult.passed` — evita divergencia entre dois pontos da logica.

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
async function rollupTotalCost(
  emailId: string,
  batchId: string,
): Promise<number> {
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
  return total
}

// Rollup + alerta de custo (settings.cost_alert_usd). Fire-and-forget:
// nunca propaga falha pro pipeline.
async function rollupCostAndMaybeAlert(input: {
  storeId: string
  emailId: string
  batchId: string
  costAlertUsd: number | null
}): Promise<void> {
  const total = await rollupTotalCost(input.emailId, input.batchId)
  if (input.costAlertUsd != null && total / 100 > input.costAlertUsd) {
    const { notifyCostAlert } = await import("./generation-notify.service")
    await notifyCostAlert({
      storeId: input.storeId,
      emailId: input.emailId,
      batchId: input.batchId,
      totalCostCents: total,
      thresholdUsd: input.costAlertUsd,
    }).catch(() => {})
  }
}

// ── Helper: carrega contexto minimo para image + html + qa ────────────
async function loadMinimalContext(storeId: string, emailId: string) {
  const admin = createAdminClient()
  const { data: storeData } = await admin
    .from("client_stores")
    .select("*")
    .eq("id", storeId)
    .single()

  // Resolve blueprint via email -> flow -> flow_type + email.number
  // ATENCAO: a coluna em email_flow_emails se chama `number` (NAO `email_number`).
  // PostgREST silencia select de coluna inexistente -> retorna null -> blueprint
  // nao carrega e build-vars cai no template global pobre. Outras tabelas
  // (store_email_references, email_blueprints, etc) usam `email_number` mesmo.
  const { data: emailRow } = await admin
    .from("email_flow_emails")
    .select("number, flow_id")
    .eq("id", emailId)
    .maybeSingle()
  const flowIdForBlueprint = (emailRow?.flow_id as string | undefined) ?? null
  const emailNumberForBlueprint = (emailRow?.number as number | undefined) ?? null

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
  let blueprintFull: EmailBlueprint | null = null
  if (flowTypeForBlueprint && emailNumberForBlueprint != null) {
    blueprintFull = await loadEffectiveBlueprint(
      admin,
      storeId,
      flowTypeForBlueprint,
      emailNumberForBlueprint,
    )
    blueprintObjective = blueprintFull?.objective ?? ""
  }

  const orgId = (storeData as Record<string, unknown>)?.org_id as string | undefined

  // Config por agente da cadeia de formatação (hero/text/image/color).
  //
  // SEM o filtro `is_active` de propósito: a linha mais recente vem junto
  // com o flag, para o runner distinguir três estados (resolveAgentSwitch):
  //   - nenhuma row       → agente nunca configurado → roda com defaults
  //   - row ativa         → roda com ela
  //   - rows só inativas  → DESLIGADO na UI → o step é pulado
  // Antes, `is_active=false` só apagava a config: o chain caía nos
  // defaults in-code e rodava igual — o toggle da aba Agentes não
  // desligava nada.
  const fmtConfig = (agentType: string) =>
    admin
      .from("email_agent_configs")
      .select("*")
      .eq("agent_type", agentType)
      .order("is_active", { ascending: false })
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

  const [
    brandRes,
    briefingRes,
    settingsRes,
    imageConfigRes,
    storeOverridesRes,
    heroConfigRes,
    textConfigRes,
    imageFmtConfigRes,
    colorConfigRes,
    mergeVerifierConfigRes,
  ] = await Promise.all([
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
    orgId
      ? admin
          .from("email_generation_settings")
          .select(
            "generate_images, qa_vision_enabled, cost_alert_usd, merge_verifier_mode, hero_vision_model",
          )
          .eq("org_id", orgId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // ── Story AE-11: imagem agora carrega config + overrides do DB ─
    admin
      .from("email_agent_configs")
      .select("system_prompt, user_template, model")
      .eq("agent_type", "image")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("store_image_overrides")
      .select("*")
      .eq("store_id", storeId)
      .maybeSingle(),
    fmtConfig("hero_section"),
    fmtConfig("text_format"),
    fmtConfig("image_format"),
    fmtConfig("color_format"),
    fmtConfig("merge_verifier"),
  ])

  const settingsRow = settingsRes.data as {
    generate_images?: boolean | null
    qa_vision_enabled?: boolean | null
    cost_alert_usd?: number | null
    merge_verifier_mode?: string | null
    hero_vision_model?: string | null
  } | null
  const generateImages = settingsRow?.generate_images ?? true
  // NULL = respeita env (decisão fica no qa.chain); true/false = override da UI.
  const qaVisionEnabled = settingsRow?.qa_vision_enabled ?? null
  const costAlertUsd = settingsRow?.cost_alert_usd ?? null
  // Verificador de merge (7b): default on_flag; valor fora do domínio
  // (settings antigas sem a coluna) cai no default.
  const rawVerifierMode = settingsRow?.merge_verifier_mode
  const mergeVerifierMode: "always" | "on_flag" | "off" =
    rawVerifierMode === "always" || rawVerifierMode === "off"
      ? rawVerifierMode
      : "on_flag"
  // Espelho visual da hero (CM-8): NULL = usa HERO_VISION_MODEL; string
  // vazia = fallback desligado; qualquer outro valor = esse modelo.
  const heroVisionModel = settingsRow?.hero_vision_model ?? null

  // Defesa contra o bug recorrente "store_brand_identities" (plural —
  // tabela nao existe). Supabase JS engole 42P01 em maybeSingle() e
  // retorna data=null, que cai em "Loja sem brand identity" enganoso.
  // Log explicito do .error reduz a chance de regressao silenciosa.
  if (brandRes.error) {
    log.error("phase2.context.brand_query_failed", {
      storeId,
      code: brandRes.error.code,
      message: brandRes.error.message,
    })
  }

  // Fonte única: tabela viva store_top_products (fallback no snapshot).
  const topProducts: TopProduct[] = await loadTopProducts(
    admin,
    storeId,
    ((storeData as Record<string, unknown> | null)?.store_url as
      | string
      | undefined) ?? null,
  )

  return {
    storeRaw: (storeData as Record<string, unknown>) ?? { store_name: "Loja" },
    brand: (brandRes.data as StoreBrandIdentity | null) ?? null,
    briefing: (briefingRes.data as StoreBriefing | null) ?? null,
    topProducts,
    generateImages,
    qaVisionEnabled,
    costAlertUsd,
    blueprintObjective,
    // ── AE-11: contexto extra para o agente de imagem ───────────
    blueprint: blueprintFull,
    storeOverrides:
      (storeOverridesRes.data as StoreImageOverrides | null) ?? null,
    imageConfig:
      (imageConfigRes.data as {
        system_prompt: string | null
        user_template: string
        model: string
      } | null) ?? null,
    // Configs da cadeia de formatação (null → defaults in-code do chain).
    heroConfig: (heroConfigRes.data as EmailAgentConfig | null) ?? null,
    textFormatConfig: (textConfigRes.data as EmailAgentConfig | null) ?? null,
    imageFormatConfig:
      (imageFmtConfigRes.data as EmailAgentConfig | null) ?? null,
    colorFormatConfig:
      (colorConfigRes.data as EmailAgentConfig | null) ?? null,
    mergeVerifierConfig:
      (mergeVerifierConfigRes.data as EmailAgentConfig | null) ?? null,
    mergeVerifierMode,
    heroVisionModel,
    flowType: flowTypeForBlueprint,
    emailNumber: emailNumberForBlueprint,
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

  await safeNotifyBatchTerminal(storeId, batchId)
}

// ── Main: runPhase2InBackground ────────────────────────────────────────
export interface RunPhase2Params {
  storeId: string
  emailId: string
  triggeredBy?: string
  /**
   * Quando true (TestTab), o precheck de brand é relaxado:
   * só falha se brand=null. Cores/logo faltando degradam pra defaults.
   */
  relaxedBrandCheck?: boolean
  /**
   * Orçamento de tempo da cadeia de formatação nesta invocação (ms).
   * Default = PHASE2_CHAIN_BUDGET_MS ?? 760s (rota com maxDuration=800).
   * O fallback in-process do watchdog (cron, maxDuration=300) passa
   * 240_000 — com o resume por estágio, progride 1 step por tick.
   */
  budgetMs?: number
}

/**
 * Reaproveita as imagens da ÚLTIMA geração quando o agente de imagem está
 * DESLIGADO (email_generation_settings.generate_images = false).
 *
 * A copy nova sobrescreve o content dos blocos por inteiro (o callback do
 * n8n troca o objeto), então a image_url anterior se perde. A fonte de
 * verdade que sobrevive é a TELEMETRIA: todo run de imagem success grava
 * parsed_output { blockId, imageUrl } (avatares: + kind/itemIndex). Este
 * helper recupera a URL mais recente por bloco/avatar e re-grava no
 * content — o restante da fase 2 (hero/image_map) consome como se a
 * imagem tivesse sido gerada agora. Blocos sem run anterior (nunca
 * geraram, ou reseed trocou os ids) seguem sem imagem — a cadeia já trata
 * slot vazio (remove a linha).
 */
export async function reuseImagesFromPreviousRuns(
  admin: ReturnType<typeof createAdminClient>,
  emailId: string,
): Promise<number> {
  const [{ data: blocks }, { data: runs }] = await Promise.all([
    admin
      .from("email_blocks")
      .select("id, block_type, content")
      .eq("email_id", emailId)
      .eq("needs_image", true),
    admin
      .from("email_generation_runs")
      .select("parsed_output, input_vars, created_at")
      .eq("email_id", emailId)
      .eq("agent", "image")
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(100),
  ])
  if (!blocks || blocks.length === 0) return 0

  interface ImageRunOutput {
    blockId?: string
    imageUrl?: string
    kind?: string
    itemIndex?: number
  }
  // Runs vêm em ordem desc — o PRIMEIRO por chave é o mais recente.
  // Duas chaves de match, em cascata:
  //   1. blockId — exato, quando os blocos sobreviveram desde a geração.
  //   2. block_type (do input_vars do run) — fallback pro caso comum do
  //      teste completo: o reconcile com estrutura nova faz delete+insert
  //      dos blocos (ids NOVOS) e o match por id deixaria tudo sem imagem.
  const mainByBlock = new Map<string, string>()
  const mainByType = new Map<string, string>()
  const avatarByBlockItem = new Map<string, string>()
  for (const r of runs ?? []) {
    const po = (r.parsed_output ?? {}) as ImageRunOutput
    if (!po.imageUrl) continue
    if (po.kind === "testimonial_avatar") {
      if (!po.blockId) continue
      const key = `${po.blockId}:${po.itemIndex ?? 0}`
      if (!avatarByBlockItem.has(key)) avatarByBlockItem.set(key, po.imageUrl)
      continue
    }
    if (po.blockId && !mainByBlock.has(po.blockId)) {
      mainByBlock.set(po.blockId, po.imageUrl)
    }
    const runBlockType = (
      (r.input_vars ?? {}) as Record<string, unknown>
    ).block_type
    if (typeof runBlockType === "string" && runBlockType && !mainByType.has(runBlockType)) {
      mainByType.set(runBlockType, po.imageUrl)
    }
  }

  let reused = 0
  for (const blk of blocks) {
    const content = ((blk.content as Record<string, unknown>) ?? {}) as Record<
      string,
      unknown
    >
    let changed = false

    if (!content.image_url) {
      const url =
        mainByBlock.get(blk.id as string) ??
        mainByType.get(blk.block_type as string)
      if (url) {
        content.image_url = url
        changed = true
      }
    }

    if (blk.block_type === "testimonials" && Array.isArray(content.items)) {
      const items = content.items as Array<Record<string, unknown>>
      items.forEach((item, idx) => {
        const key = `${blk.id}:${idx}`
        if (!item.avatar_url && avatarByBlockItem.has(key)) {
          item.avatar_url = avatarByBlockItem.get(key)
          changed = true
        }
      })
    }

    if (changed) {
      const { error } = await admin
        .from("email_blocks")
        .update({ content })
        .eq("id", blk.id as string)
      if (!error) reused++
      else {
        log.warn("phase2.image.reuse_update_failed", {
          emailId,
          blockId: blk.id,
          error: error.message,
        })
      }
    }
  }
  return reused
}

/**
 * Phase 2 — etapa 1 (imagem).
 *
 * Faz claim atomico `copy_ready -> rendering`, gera todas as imagens
 * necessarias e, ao final, atualiza status para `image_done`. NAO dispara
 * HTML+QA — o caller (rota HTTP dedicada ou wrapper) e responsavel.
 *
 * Split criado para permitir que image (~250s) e html+qa (~105s) rodem em
 * rotas HTTP separadas, cada uma com seu maxDuration de 300s na Vercel Pro.
 *
 * Retorna:
 *   - `image_done`: imagem gerada com sucesso, pronto para fase HTML+QA
 *   - `failed`: erro fatal (context_load_failed, image_failed)
 *   - `skipped`: status nao estava em `copy_ready` (idempotente)
 */
export async function runPhase2Image(
  params: RunPhase2Params,
): Promise<{ status: "image_done" | "failed" | "skipped" }> {
  const { storeId, emailId, triggeredBy } = params
  const admin = createAdminClient()
  log.info("phase2.image.start", { storeId, emailId })

  // ── Guard -1: email "somente texto" NÃO passa pela fase 2 ────────────
  // ANTES do gate de brand: text_only não depende de identidade visual.
  // Legado (copy_ready antes da flag): vira `ready` direto, sem imagem/HTML.
  if (await resolveTextOnlyForEmail(admin, emailId)) {
    const nowIso = new Date().toISOString()
    const { data: settled } = await admin
      .from("email_flow_emails")
      .update({
        status: "ready",
        ready_at: nowIso,
        updated_at: nowIso,
        html: null,
        qa_issues: [],
        failure_reason: null,
      })
      .eq("id", emailId)
      .eq("status", "copy_ready")
      .select("generation_batch_id")
    log.info("phase2.image.skipped_text_only", {
      storeId,
      emailId,
      settled: (settled ?? []).length > 0,
    })
    const textOnlyBatch =
      (settled?.[0]?.generation_batch_id as string | null) ?? null
    if (textOnlyBatch) {
      await checkBatchTerminal(storeId, textOnlyBatch).catch(() => {})
    }
    return { status: "skipped" }
  }

  // ── Guard 0: GATE 2 — só renderiza com brand confirmada ──────────────
  // Cobre TODOS os caminhos de entrada (watchdog Frente 4, generate-email,
  // signal consumer, monolito legado). Sem brand confirmada o e-mail FICA
  // em copy_ready — nunca vira failed:brand_incomplete.
  if (!params.relaxedBrandCheck && !(await isBrandConfirmed(admin, storeId))) {
    // GATE 2: email FICA em copy_ready (nao vira failed). Antes era log.info
    // silencioso -> ops nao via que o email estava parado esperando brand.
    // WARN torna visivel (logs + alertas), sem mudar o comportamento de
    // produto (nao-bloqueante, so esperando confirmacao da brand).
    log.warn("phase2.image.skipped_brand_not_confirmed", {
      storeId,
      emailId,
      reason: "brand_nao_confirmada_email_parado_em_copy_ready",
    })
    return { status: "skipped" }
  }

  // ── Guard 1: copy_ready -> rendering (atomico) ──────────────────────
  const { data: claimed } = await admin
    .from("email_flow_emails")
    .update({
      status: "rendering",
      rendering_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Geração NOVA nunca herda estágio da cadeia de formatação anterior.
      html_pipeline_stage: null,
    })
    .eq("id", emailId)
    .eq("status", "copy_ready")
    .select("id, flow_id, generation_batch_id")

  if (!claimed || claimed.length === 0) {
    log.info("phase2.image.skipped_already_started", { emailId })
    return { status: "skipped" }
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
    await safeNotifyEmailFailed(storeId, emailId, "context_load_failed", batchId || null)
    if (batchId) await checkBatchTerminal(storeId, batchId).catch(() => {})
    return { status: "failed" }
  }

  // Guard 2 removido (decisão de produto, jun/2026): geração prossegue
  // mesmo sem niche ou top_products. Imagem pode ficar genérica nesses
  // casos — aceitável, melhor que bloquear. Log warning preserva
  // observabilidade pra ops detectar lojas mal-configuradas.
  const niche = (ctx.storeRaw as Record<string, unknown>)?.niche
  const hasNiche = typeof niche === "string" && niche.trim().length > 0
  if (!hasNiche || ctx.topProducts.length === 0) {
    const missing = [
      !hasNiche ? "niche" : null,
      ctx.topProducts.length === 0 ? "products" : null,
    ].filter(Boolean)
    log.warn("phase2.store_data_partial", { emailId, storeId, missing })
  }

  // ── Step 1: Image generation (se habilitado) ─────────────────────────
  if (ctx.generateImages) {
    // Seleção por needs_image (o checkbox "imagem" do blueprint), não mais
    // por block_type hardcoded. Ordena por position (prioriza topo do email)
    // e aplica o teto MAX_AI_IMAGES.
    const { data: imageBlocks } = await admin
      .from("email_blocks")
      .select("id, block_type, label, content, position, needs_image")
      .eq("email_id", emailId)
      .eq("needs_image", true)
      .order("position", { ascending: true })
      .limit(MAX_AI_IMAGES)

    // Observabilidade: avisa se há mais blocos marcados do que o teto permite.
    const { count: needsImageCount } = await admin
      .from("email_blocks")
      .select("id", { count: "exact", head: true })
      .eq("email_id", emailId)
      .eq("needs_image", true)
    if ((needsImageCount ?? 0) > MAX_AI_IMAGES) {
      log.warn("phase2.image.capped", {
        emailId,
        needsImageCount,
        cap: MAX_AI_IMAGES,
      })
    }

    // ── Direção fotográfica por variante (migration 20261060) ──────
    // Uma query por email: as variantes que o Montador casou aos blocos
    // deste blueprint. A direção acompanha o DESENHO do bloco, então é
    // resolvida por variant_id — o mesmo par que o design_system usa na
    // hero. Sem blueprint (fallback global) o mapa fica vazio e o prompt
    // segue como antes.
    const photoDirectionByVariant = await loadPhotoDirections(
      admin,
      ctx.blueprint?.blocks as Array<{ variant_id?: string | null }> | undefined,
    )

    // ── AE-11: log de qual fonte do template (DB seed vs fallback) ─
    log.info("phase2.image.template_source", {
      source: ctx.imageConfig ? "db" : "fallback_hardcoded",
      flowType: ctx.flowType,
      emailNumber: ctx.emailNumber,
      emailId,
    })

    // Degradação graciosa: uma imagem que falha NÃO aborta o email. Contamos as
    // falhas e seguimos pro HTML+QA com os blocos que falharam sem `image_url`
    // (o HTML usa placeholder/slot vazio). O banner do modo teste já avisa que o
    // email pode sair com visual incompleto. Sem isso, 1 timeout/erro de imagem
    // matava o email inteiro e o HTML nunca rodava.
    const imageTotal = (imageBlocks ?? []).length
    type ImageBlockRow = NonNullable<typeof imageBlocks>[number]

    // Geracao das imagens em PARALELO (antes sequencial ~90s x N). Cada bloco
    // e independente: row propria em email_blocks + run proprio em
    // email_generation_runs. Promise.allSettled corta o tempo total ~N x, o
    // que faz image+HTML caberem na MESMA invocacao (sem depender do watchdog
    // pra recuperar emails presos em image_done). Degradacao graciosa
    // preservada: imagem que falha retorna false e NAO aborta as outras nem o
    // email.

    /**
     * Testimonials: gera 1 avatar UGC POR ITEM (não 1 imagem pro bloco
     * inteiro). Cada item.avatar_url recebe URL distinta. Cap em 4 avatares
     * por bloco (custo controlado). Em vez de reutilizar o template do
     * agente (que assume banner landscape), monta um prompt dedicado pra
     * retrato UGC quadrado. Roda em paralelo entre items do mesmo bloco.
     */
    const processTestimonialAvatars = async (
      blk: ImageBlockRow,
    ): Promise<boolean> => {
      const content = (blk.content as Record<string, unknown>) ?? {}
      const rawItems = Array.isArray(content.items)
        ? (content.items as Array<Record<string, unknown>>)
        : []
      if (rawItems.length === 0) return true

      const MAX_AVATARS_PER_BLOCK = 4
      const items = rawItems.slice(0, MAX_AVATARS_PER_BLOCK)

      // Contexto de marca pra alinhar o avatar à audiência da loja.
      const brandName =
        ((ctx.storeRaw as Record<string, unknown>)?.store_name as string | undefined) ??
        "the brand"
      const nicheText =
        ((ctx.storeRaw as Record<string, unknown>)?.niche as string | undefined) ??
        ""
      // icp_persona é um OBJETO estruturado (pilar de pesquisa) — interpolar
      // direto produzia "[object Object]" no prompt (Luxe Lift, 20/jul).
      const personaText = personaToText(
        (ctx.storeRaw as Record<string, unknown>)?.icp_persona,
      )

      // NÃO prefixar o image_brief do bloco: ele descreve a IMAGEM PRINCIPAL
      // da seção de reviews (ex.: "cartões de avaliação, sem rostos
      // identificáveis") e CONTRADIZ o prompt de selfie do avatar — o modelo
      // recebia as duas ordens no mesmo prompt. O prompt dedicado abaixo é
      // autossuficiente.
      const renderAvatarPrompt = (idx: number, author: string): string => {
        const lines = [
          `Generate a square (1:1) portrait avatar for a customer testimonial.`,
          `Customer name: ${author || `Customer ${idx + 1}`}`,
          `Brand: ${brandName}${nicheText ? ` (niche: ${nicheText})` : ""}`,
          personaText ? `Target audience persona: ${personaText}` : "",
          `Style: authentic UGC selfie, warm natural lighting, plain or softly blurred background, friendly genuine expression, no text or logos.`,
          `Vary look between customers: this is avatar #${idx + 1} of ${items.length}, so use distinct age, hair, ethnicity, and pose relative to other avatars in the same set.`,
          `Composition: head-and-shoulders, centered, suitable for cropping to a small circular avatar.`,
        ]
        return lines.filter(Boolean).join("\n\n")
      }

      const processOne = async (
        item: Record<string, unknown>,
        idx: number,
      ): Promise<{ url: string | null; alt: string }> => {
        const itemT0 = Date.now()
        const author =
          (typeof item.author === "string" && item.author.trim()) ||
          `Customer ${idx + 1}`
        const prompt = renderAvatarPrompt(idx, author)
        // Instrumentação opt-in do agente de imagem (tokens + custo real do
        // OpenRouter). Default zerado pro caminho de erro/sem-usage não quebrar.
        let imgMeta = { tokensInput: 0, tokensOutput: 0, costCents: 0 }
        try {
          const imageUrl = await generateEmailImage(prompt, storeId, {
            aspect: "1:1",
            overlayReserveBottom: false,
            mode: "text2img",
            systemPrompt: ctx.imageConfig?.system_prompt ?? undefined,
            // Modelo da config do banco (email_agent_configs.model). O
            // valor era carregado e nunca chegava aqui: trocar o modelo
            // por SQL não surtia efeito nenhum nos emails, só nas
            // campanhas — que já passavam o parâmetro.
            model: ctx.imageConfig?.model || undefined,
            onMeta: (m) => {
              imgMeta = m
            },
          })
          const alt = `${author} — customer of ${brandName}`
          await logGenerationRun({
            storeId,
            flowId,
            emailId,
            triggeredBy,
            batchId,
            agent: "image",
            status: "success",
            model: ctx.imageConfig?.model || OPENROUTER_IMAGE_MODEL,
            durationMs: Date.now() - itemT0,
            renderedPrompt: prompt,
            tokensInput: imgMeta.tokensInput,
            tokensOutput: imgMeta.tokensOutput,
            costCents: imgMeta.costCents,
            parsedOutput: {
              blockId: blk.id,
              kind: "testimonial_avatar",
              itemIndex: idx,
              imageUrl,
            },
          })
          return { url: imageUrl, alt }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Erro no avatar"
          log.error("phase2.image.testimonial_avatar_error", {
            emailId,
            blockId: blk.id,
            itemIndex: idx,
            error: msg,
          })
          await logGenerationRun({
            storeId,
            flowId,
            emailId,
            triggeredBy,
            batchId,
            agent: "image",
            status: "error",
            model: ctx.imageConfig?.model || OPENROUTER_IMAGE_MODEL,
            durationMs: Date.now() - itemT0,
            renderedPrompt: prompt,
            errorMessage: msg,
            tokensInput: imgMeta.tokensInput,
            tokensOutput: imgMeta.tokensOutput,
            costCents: imgMeta.costCents,
            parsedOutput: {
              blockId: blk.id,
              kind: "testimonial_avatar",
              itemIndex: idx,
            },
          })
          return { url: null, alt: "" }
        }
      }

      const results = await Promise.allSettled(items.map(processOne))

      // Mescla URLs nos items preservando os campos existentes; items além do
      // cap ficam intocados (sem avatar_url). Persiste apenas se ao menos 1
      // avatar foi gerado — caso contrário, evita UPDATE desnecessário.
      let anySuccess = false
      const mergedItems = rawItems.map((it, idx) => {
        if (idx >= items.length) return it
        const r = results[idx]
        if (r.status !== "fulfilled" || !r.value.url) return it
        anySuccess = true
        return {
          ...it,
          avatar_url: r.value.url,
          avatar_alt: r.value.alt,
        }
      })

      if (anySuccess) {
        await admin
          .from("email_blocks")
          .update({ content: { ...content, items: mergedItems } })
          .eq("id", blk.id)
      }

      const okCount = results.filter(
        (r) => r.status === "fulfilled" && r.value.url,
      ).length
      log.info("phase2.image.testimonial_avatars_done", {
        emailId,
        blockId: blk.id,
        requested: items.length,
        succeeded: okCount,
      })
      // Considera sucesso parcial como sucesso do bloco (mesmo critério do
      // bloco normal — degradação graciosa).
      return okCount > 0
    }

    const processImageBlock = async (blk: ImageBlockRow): Promise<boolean> => {
      // Testimonials tem semântica especial: 1 avatar por item, não 1 imagem
      // pro bloco. Roteia antes do fluxo normal.
      if ((blk.block_type as string) === "testimonials") {
        return processTestimonialAvatars(blk)
      }
      const imgT0 = Date.now()
      // Declarados fora do try pra o catch tambem registrar o input no run.
      let promptVars: Record<string, string> | undefined
      let promptWithAspect = ""
      // Run 'running' aberto antes da chamada de imagem (live view).
      let imgRunId = ""
      // Instrumentação opt-in do agente de imagem (tokens + custo real do
      // OpenRouter). Fora do try pra o catch também repassar (zerado se o
      // onMeta não chegou a disparar).
      let imgMeta = { tokensInput: 0, tokensOutput: 0, costCents: 0 }
      try {
        // CONTRATO COM AE-16: o campo opcional em `email_blocks.content` se
        // chama EXATAMENTE `image_instruction` (string). Se AE-16 nomear
        // diferente, este leitor silenciosamente vira no-op (instrucao
        // sumiria do prompt). Manter os nomes em sincronia.
        const blockContent = (blk.content as Record<string, unknown> | null) ?? {}
        const instrucaoAdicional =
          typeof blockContent.image_instruction === "string"
            ? (blockContent.image_instruction as string)
            : undefined

        // ⚠️ SYNC CONTRACT WITH AE-16: a logica abaixo (aspect + mode +
        // fallback description + render final do prompt) deve ficar
        // identica a `src/lib/agents/image/resolve-block-prompt.service.ts`,
        // que e usada pelos endpoints resolve-prompt e regenerate-image.
        // Se voce alterar este trecho, atualize la tambem — senao o
        // modal de preview na UI mostrara prompt diferente do que esta
        // rodando aqui (bug silencioso). Idealmente, extraia para um
        // helper compartilhado em uma proxima refatoracao.

        // Master Prompt v2: aspect + mode são RESOLVIDOS ANTES do
        // buildImagePromptVars pra ficarem disponíveis ao template como
        // vars (`aspect_ratio`, `mode`, `product_ref`) e pra alimentar
        // `deriveShotArchetype`. A reordenação muda só a sequência —
        // o resultado final do prompt continua igual.

        // AE-12: resolve aspect ratio (blueprint override > matriz >
        // default) + inject instrucao textual no prompt. O resize final
        // pra forcar a dimensao acontece dentro de generateEmailImage.
        const blueprintAspectRaw = ctx.blueprint?.image_aspect ?? null
        const blueprintAspectIsValid =
          !!blueprintAspectRaw && isAspectKey(blueprintAspectRaw)
        // AE-12 review S1: blueprint com valor invalido (ex "16:9") cai
        // pra matriz silenciosamente — logar warn pra observabilidade.
        if (blueprintAspectRaw && !blueprintAspectIsValid) {
          log.warn("phase2.image.blueprint_aspect_invalid", {
            emailId,
            blockId: blk.id,
            invalidValue: blueprintAspectRaw,
          })
        }
        // Hero v5 (jul/2026): a imagem do hero é um <img> standalone e o texto
        // é HTML SEPARADO (não sobreposto) → a imagem NÃO reserva área pro
        // texto. reserveBottom fica desligado (a instrução de "fundo/overlay"
        // não se aplica mais). SYNC CONTRACT com resolve-block-prompt.service.ts.
        const reserveBottom = false
        // Aspect POR BLOCO (blocks[].image_aspect, derivado das tags do
        // template via registry) — prioridade máxima sobre o nível-email.
        const blockAspectRaw = blockAspectFromBlueprint(
          ctx.blueprint?.blocks as
            | Array<{ type?: string; image_aspect?: string | null }>
            | undefined,
          blk.position as number | undefined,
          blk.block_type as string | undefined,
        )
        const blockAspectIsValid =
          !!blockAspectRaw && isAspectKey(blockAspectRaw)
        const aspect: AspectKey = resolveAspectForBlock({
          blockAspect: blockAspectRaw,
          blueprintAspect: blueprintAspectRaw as AspectKey | null | undefined,
          flowType: ctx.flowType,
          emailNumber: ctx.emailNumber,
        })
        // AE-12 review C1: source so eh "block"/"blueprint" se o valor era
        // VALIDO. Caso contrario, caiu na matriz ou default.
        const aspectSource = blockAspectIsValid
          ? "block"
          : blueprintAspectIsValid
            ? "blueprint"
            : ctx.flowType === "welcome" && ctx.emailNumber != null
              ? "matrix"
              : "default"
        log.info("phase2.image.aspect_resolved", {
          emailId,
          blockId: blk.id,
          aspect,
          reserveBottom,
          source: aspectSource,
        })

        // Dimensões EXATAS declaradas no campo de imagem do schema
        // (image_width × image_height) — prioridade sobre o aspect tipado.
        // Persistidas em blocks[].fields pelo builder (F1). SYNC CONTRACT
        // com resolve-block-prompt.service.ts.
        const customDims = imageDimsFromBlueprint(
          ctx.blueprint?.blocks as
            | Array<{
                type?: string
                fields?: Array<{
                  type?: string
                  image_width?: number | null
                  image_height?: number | null
                }>
              }>
            | undefined,
          blk.position as number | undefined,
          blk.block_type as string | undefined,
        )

        // ── AE-13: resolve mode (product_ref vs text2img) + fallbacks ──
        const multimodalEnabled =
          process.env.IMAGE_MULTIMODAL_ENABLED === "true"
        // topProductImageUrl vem de brand.top_products[0].image_url,
        // tipicamente uma signed URL Supabase com validade ~365 dias
        // (segura entre as fases copy → image → upload final).
        const topProductImageUrl = ctx.topProducts[0]?.image_url ?? null
        let { mode, source: modeSource } = resolveImageMode({
          blueprintMode: ctx.blueprint?.image_mode ?? null,
          flowType: ctx.flowType,
          emailNumber: ctx.emailNumber,
          topProductImageUrl,
          multimodalEnabled,
        })

        // ── Guarda de integração (product_ref) ──────────────────────────
        // Antes de mandar a URL do produto como referência visual ao modelo,
        // confirma que ela é baixável E é imagem. URLs 403/404/HTML (asset de
        // e-mail removido, CDN restrito, link reaproveitado) fariam o modelo
        // cair em imagem genérica silenciosamente. Reprovou → text2img + a
        // descrição textual do produto (fallback abaixo).
        if (mode === "product_ref" && topProductImageUrl) {
          const check = await isUsableProductImage(topProductImageUrl)
          if (!check.usable) {
            log.warn("phase2.image.product_ref_url_unusable", {
              emailId,
              blockId: blk.id,
              reason: check.reason,
              status: check.status,
              contentType: check.contentType,
            })
            mode = "text2img"
            modeSource = "fallback_text2img_unreachable"
          }
        }

        log.info("phase2.image.mode_resolved", {
          emailId,
          blockId: blk.id,
          mode,
          source: modeSource,
          hasRefUrl: !!topProductImageUrl,
        })

        promptVars = buildImagePromptVars({
          brand: ctx.brand,
          briefing: ctx.briefing,
          topProducts: ctx.topProducts,
          storeRaw: ctx.storeRaw,
          blockPurpose: (blk.label as string) ?? "hero",
          // ── AE-11: vars niche-adaptive + contexto ─────────────
          // emailNumber e flowType ja produzem `email_number` e `flow_type`
          // (snake_case) no retorno — usados pelo switch do template
          // handlebars-lite. Nao precisa mutacao posterior.
          emailNumber: ctx.emailNumber ?? undefined,
          flowType: ctx.flowType ?? undefined,
          blueprint: ctx.blueprint,
          storeOverrides: ctx.storeOverrides,
          instrucaoAdicional,
          // ── Master Prompt v2 — contexto por bloco ───────────
          blockType: (blk.block_type as string) ?? undefined,
          blockLabel: (blk.label as string) ?? undefined,
          blockPosition: (blk.position as number) ?? undefined,
          // Copy real do bloco → copy_do_grupo dos slots em IMAGE_SLOTS.
          blockContent:
            (blk.content as Record<string, unknown> | null) ?? undefined,
          imageOverlayReserveBottom: reserveBottom,
          aspect,
          mode,
          photoDirectionByVariant,
        })

        // Se config existe no DB: renderImageTemplate (handlebars-lite,
        // suporta switch + if). Sem config: fallback pro template
        // hardcoded com o renderImagePrompt legacy (compat retroativa).
        const prompt = ctx.imageConfig
          ? renderImageTemplate(ctx.imageConfig.user_template, promptVars)
          : renderImagePrompt(DEFAULT_IMAGE_PROMPT_TEMPLATE, promptVars)

        // Dims declaradas no schema vencem o aspect tipado também na
        // instrução de composição (o modelo compõe pro frame exato).
        const geometryInstruction = customDims
          ? dimsInstructionForPrompt(
              customDims.width,
              customDims.height,
              reserveBottom,
            )
          : aspectInstructionForPrompt(aspect, reserveBottom)
        promptWithAspect = `${prompt}\n\n${geometryInstruction}`

        // Se caimos no fallback E o slot esperava product_ref, adiciona
        // descricao textual rica do produto pra compensar a perda visual.
        // Vale mesmo quando flag esta off (fallback_text2img_disabled) ou
        // quando o produto nao tem imagem (fallback_text2img_no_product):
        // o modelo ainda pode "evocar" o produto via texto detalhado.
        if (
          (modeSource === "fallback_text2img_disabled" ||
            modeSource === "fallback_text2img_no_product" ||
            modeSource === "fallback_text2img_unreachable") &&
          ctx.topProducts[0]?.name
        ) {
          promptWithAspect += `\n\n${productRefDescriptionFallback({
            productName: ctx.topProducts[0].name,
            productImageUrl: topProductImageUrl,
          })}`
        }

        imgRunId = await startGenerationRun({
          storeId,
          flowId,
          emailId,
          triggeredBy,
          batchId,
          agent: "image",
          model: ctx.imageConfig?.model || OPENROUTER_IMAGE_MODEL,
          inputVars: promptVars,
          renderedPrompt: promptWithAspect || undefined,
        })

        const imageUrl = await generateEmailImage(
          promptWithAspect,
          storeId,
          {
            aspect,
            // Dims declaradas no schema vencem o aspect tipado no resize.
            customDims,
            overlayReserveBottom: reserveBottom,
            mode,
            referenceImageUrl:
              mode === "product_ref" && topProductImageUrl
                ? topProductImageUrl
                : undefined,
            // Master Prompt v2: Part A do email_agent_configs.system_prompt.
            // Quando ausente (config v1 ainda ativa), generateEmailImage
            // não envia role:"system" e mantém comportamento legacy.
            systemPrompt: ctx.imageConfig?.system_prompt ?? undefined,
            // Ver comentário na outra chamada: o model da config do
            // banco precisa chegar na chain.
            model: ctx.imageConfig?.model || undefined,
            onMeta: (m) => {
              imgMeta = m
            },
          },
        )

        // Story AE-15: image_alt descritivo via buildImageAlt
        // (PRODUTO_HEROI em CENARIO, mood MOOD). Fallback gracioso
        // pra blk.label se o helper retornar string vazia por
        // qualquer motivo — preserva compat retroativa com blocos
        // antigos que dependiam de blk.label.
        let altText: string
        try {
          altText = buildImageAlt(promptVars) || (blk.label as string)
        } catch {
          altText = (blk.label as string) ?? ""
        }
        const merged = {
          ...((blk.content as Record<string, unknown>) ?? {}),
          image_url: imageUrl,
          image_alt: altText,
        }
        await admin.from("email_blocks").update({ content: merged }).eq("id", blk.id)

        await finishGenerationRun(imgRunId, {
          storeId,
          flowId,
          emailId,
          triggeredBy,
          batchId,
          agent: "image",
          status: "success",
          model: ctx.imageConfig?.model || OPENROUTER_IMAGE_MODEL,
          durationMs: Date.now() - imgT0,
          inputVars: promptVars,
          renderedPrompt: promptWithAspect || undefined,
          tokensInput: imgMeta.tokensInput,
          tokensOutput: imgMeta.tokensOutput,
          costCents: imgMeta.costCents,
          parsedOutput: { blockId: blk.id, imageUrl },
        })
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro na imagem"
        log.error("phase2.image.error", { emailId, blockId: blk.id, error: msg })
        await finishGenerationRun(imgRunId, {
          storeId,
          flowId,
          emailId,
          triggeredBy,
          batchId,
          agent: "image",
          status: "error",
          model: ctx.imageConfig?.model || OPENROUTER_IMAGE_MODEL,
          durationMs: Date.now() - imgT0,
          inputVars: promptVars,
          renderedPrompt: promptWithAspect || undefined,
          errorMessage: msg,
          tokensInput: imgMeta.tokensInput,
          tokensOutput: imgMeta.tokensOutput,
          costCents: imgMeta.costCents,
        })
        // NÃO aborta: sinaliza falha e deixa as outras imagens seguirem. O
        // bloco fica sem `image_url` (placeholder no HTML). Quem decide o
        // estado terminal do email é a fase HTML+QA, não uma imagem isolada.
        return false
      }
    }

    const imageResults = await Promise.allSettled(
      (imageBlocks ?? []).map((blk) => processImageBlock(blk)),
    )
    const imageFailures = imageResults.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && r.value === false),
    ).length

    if (imageFailures > 0) {
      log.warn("phase2.image.partial", {
        emailId,
        storeId,
        failed: imageFailures,
        total: imageTotal,
      })
    }
  } else {
    // Agente de imagem DESLIGADO (aba Configurações → "Gerar imagens"):
    // reaproveita as imagens da última geração via telemetria em vez de
    // pagar/esperar o modelo de imagem (o step mais instável do pipeline).
    const reused = await reuseImagesFromPreviousRuns(admin, emailId)
    log.info("phase2.image.reuse", { storeId, emailId, reused })
    await logGenerationRun({
      storeId,
      flowId,
      emailId,
      triggeredBy,
      batchId,
      agent: "image",
      status: "skipped",
      model: "reuse",
      parsedOutput: {
        skip_reason: "generate_images_off",
        reused_images: reused,
      },
    })
  }

  // ── Fim da fase imagem: marca image_done para que a fase HTML+QA
  // (rota dedicada ou wrapper) possa fazer o claim atomico.
  await admin
    .from("email_flow_emails")
    .update({
      status: "image_done",
      updated_at: new Date().toISOString(),
    })
    .eq("id", emailId)

  log.info("phase2.image.done", { storeId, emailId, batchId })
  return { status: "image_done" }
}

/**
 * QA agent flag. REMOVIDO do fluxo (natural e teste) por decisao de produto:
 * o agente vinha reprovando emails legitimos (`qa_failed`) e travando a
 * entrega. Default DESLIGADO. Reativar com `EMAIL_QA_ENABLED=true`.
 */
function isQaEnabled(): boolean {
  return process.env.EMAIL_QA_ENABLED === "true"
}

/**
 * Phase 2 — etapa 2 (HTML + QA).
 *
 * Faz claim atomico aceitando `image_done` (caminho split novo) OU `rendering`
 * (compat com watchdog / runPhase2InBackground wrapper) e roda HTML + QA.
 * Marca status final `ready` (sucesso) ou `failed` (html_failed, brand_incomplete,
 * qa_failed).
 *
 * Idempotente: se o claim nao matchar (email ja em outro status), retorna
 * sem fazer nada.
 *
 * Retorna:
 *   - `ready`: pipeline concluido com sucesso
 *   - `failed`: erro fatal ou QA bloqueou
 */
// ── Cadeia de formatação: budget dinâmico + retry por step ───────────
//
// A cadeia (hero → texto → imagem → cores) roda inteira dentro do status
// `rendering`. Cada step tem timeout próprio (env-overridable, espelho dos
// chains) e o budget da ROTA é dinâmico: se o tempo restante não comporta o
// próximo step, o estágio fica persistido em html_pipeline_stage e o
// watchdog re-entra depois (resume do ponto exato — NUNCA failed por budget).

const DEFAULT_CHAIN_BUDGET_MS = 760_000
function chainBudgetMs(): number {
  const env = Number(process.env.PHASE2_CHAIN_BUDGET_MS)
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_CHAIN_BUDGET_MS
}

type FormatAgent =
  | "hero_section"
  | "text_format"
  | "image_format"
  | "color_format"

// Espelham os defaults/envs dos chains — o runner precisa deles pro guard
// de budget ANTES de invocar (o chain só conhece o próprio timeout).
const FMT_STEP_TIMEOUT: Record<FormatAgent, { envVar: string; def: number }> = {
  hero_section: { envVar: "HERO_CHAIN_TIMEOUT_MS", def: 240_000 },
  text_format: { envVar: "TEXT_FORMAT_TIMEOUT_MS", def: 540_000 },
  image_format: { envVar: "IMAGE_FORMAT_TIMEOUT_MS", def: 180_000 },
  color_format: { envVar: "COLOR_FORMAT_TIMEOUT_MS", def: 240_000 },
}
function stepTimeoutMs(agent: FormatAgent): number {
  const env = Number(process.env[FMT_STEP_TIMEOUT[agent].envVar])
  return Number.isFinite(env) && env > 0 ? env : FMT_STEP_TIMEOUT[agent].def
}

// failure_reason por agente (color_format é fail-open — nunca gera failed).
const FMT_FAILURE_REASON: Record<FormatAgent, string> = {
  hero_section: "hero_failed",
  text_format: "text_format_failed",
  image_format: "image_format_failed",
  color_format: "color_format_failed",
}

const FMT_DEFAULTS: Record<
  FormatAgent,
  { temperature: number; maxTokens: number }
> = {
  hero_section: { temperature: 0.3, maxTokens: 16384 },
  text_format: { temperature: 0.3, maxTokens: 65536 },
  image_format: { temperature: 0.2, maxTokens: 8192 },
  color_format: { temperature: 0.3, maxTokens: 16384 },
}
// Kimi K3 via OpenRouter (migration 20261047 — swap do z-ai/glm-5.2).
const FMT_DEFAULT_MODEL = "moonshotai/kimi-k3"

/**
 * Estado do toggle da aba Agentes para um step da cadeia.
 *
 * `row` é a linha MAIS RECENTE do agent_type (ativa quando existe ativa —
 * o select ordena por is_active desc). Três estados:
 *   - row == null            → nunca configurado → roda com defaults
 *   - row.is_active === true → roda com a config
 *   - row.is_active !== true → desativado na UI → step PULADO
 */
function resolveAgentSwitch(row: EmailAgentConfig | null): {
  config: EmailAgentConfig | null
  disabled: boolean
} {
  if (!row) return { config: null, disabled: false }
  const active = (row as unknown as { is_active?: boolean }).is_active === true
  return { config: active ? row : null, disabled: !active }
}

function toChainConfig(
  config: EmailAgentConfig | null,
  agent: FormatAgent,
): FormatChainConfig {
  return {
    model: config?.model || FMT_DEFAULT_MODEL,
    temperature: config?.temperature ?? FMT_DEFAULTS[agent].temperature,
    max_tokens: config?.max_tokens ?? FMT_DEFAULTS[agent].maxTokens,
    system_prompt: config?.system_prompt ?? "",
    user_template: config?.user_template ?? "",
  }
}

// Verificador de merge (7b): não é step da cadeia (sem failStep/budget
// próprios — falha vira fallback mecânico), então tem defaults próprios.
// Kimi K3 via OpenRouter (mesma conta do resto da cadeia) — o seed
// original em Haiku morria por falta de crédito na Anthropic (28/07).
function verifierChainConfig(config: EmailAgentConfig | null): FormatChainConfig {
  return {
    model: config?.model || FMT_DEFAULT_MODEL,
    temperature: config?.temperature ?? 0.2,
    max_tokens: config?.max_tokens ?? 2048,
    system_prompt: config?.system_prompt ?? "",
    user_template: config?.user_template ?? "",
  }
}

/** Hash curto pra auditoria "output do step N = input do step N+1". */
function sha8(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 8)
}

/**
 * Snapshot do DOCUMENTO resultante do step pra telemetria
 * (parsed_output.output_html) — é o que permite VER o email como ficou
 * depois de cada agente no drill-down dos logs (os agentes de ops só têm
 * JSON no raw_output). Cap de segurança pra não inflar o JSONB.
 */
const OUTPUT_HTML_SNAPSHOT_CAP = 200_000
function htmlSnapshot(s: string): string {
  return s.length > OUTPUT_HTML_SNAPSHOT_CAP
    ? `${s.slice(0, OUTPUT_HTML_SNAPSHOT_CAP)}\n<!-- …snapshot truncado -->`
    : s
}

/**
 * Nº de runs em erro deste (email, batch, agent) — a fonte de verdade do
 * retry 1x, cobrindo retry in-process E cross-invocação (resume do watchdog).
 */
async function countStepErrors(
  admin: ReturnType<typeof createAdminClient>,
  emailId: string,
  batchId: string,
  agent: FormatAgent,
): Promise<number> {
  let q = admin
    .from("email_generation_runs")
    .select("id", { count: "exact", head: true })
    .eq("email_id", emailId)
    .eq("agent", agent)
    .eq("status", "error")
  q = batchId ? q.eq("batch_id", batchId) : q.is("batch_id", null)
  const { count } = await q
  return count ?? 0
}

interface StepAttemptResult<T> {
  value: T
  tokensInput: number
  tokensOutput: number
  costUsd: number
  renderedPrompt: string
  rawOutput: string
  parsed: Record<string, unknown>
}

type StepOutcome<T> =
  | { kind: "ok"; value: T }
  | { kind: "out_of_budget" }
  | { kind: "failed"; lastError: string }

/**
 * Executa um step da cadeia com budget dinâmico + retry 1x + telemetria
 * completa (input sha8/len, output no parsed, raw persistido no erro).
 * NÃO marca o email failed — o caller decide (color_format é fail-open).
 */
async function executeFormatStep<T>(p: {
  ids: {
    storeId: string
    flowId: string
    emailId: string
    triggeredBy?: string
    batchId: string
  }
  agent: FormatAgent
  config: EmailAgentConfig | null
  model: string
  routeT0: number
  budgetMs: number
  inputHtml: string
  attempt: () => Promise<StepAttemptResult<T>>
}): Promise<StepOutcome<T>> {
  const admin = createAdminClient()
  const { storeId, flowId, emailId, triggeredBy, batchId } = p.ids
  const timeout = stepTimeoutMs(p.agent)

  let priorErrors = await countStepErrors(admin, emailId, batchId, p.agent)
  let lastError = ""

  while (priorErrors < 2) {
    const remaining = p.budgetMs - (Date.now() - p.routeT0)
    if (remaining < timeout + 30_000) {
      log.warn("phase2.fmt.out_of_budget", {
        emailId,
        agent: p.agent,
        remainingMs: remaining,
        stepTimeoutMs: timeout,
      })
      return { kind: "out_of_budget" }
    }

    const t0 = Date.now()
    const runId = await startGenerationRun({
      storeId,
      flowId,
      emailId,
      triggeredBy,
      batchId,
      agent: p.agent,
      agentConfigId: p.config?.id,
      model: p.model,
      retryCount: priorErrors,
      inputVars: {
        stage: p.agent,
        input_html_len: p.inputHtml.length,
        input_sha8: sha8(p.inputHtml),
        attempt: priorErrors,
      },
    })

    try {
      const r = await p.attempt()
      await finishGenerationRun(runId, {
        storeId,
        flowId,
        emailId,
        triggeredBy,
        batchId,
        agent: p.agent,
        agentConfigId: p.config?.id,
        status: "success",
        model: p.model,
        renderedPrompt: r.renderedPrompt,
        rawOutput: r.rawOutput,
        parsedOutput: r.parsed,
        tokensInput: r.tokensInput,
        tokensOutput: r.tokensOutput,
        costCents: resolveCostCents({
          model: p.model,
          tokensInput: r.tokensInput,
          tokensOutput: r.tokensOutput,
          costUsd: r.costUsd,
        }),
        durationMs: Date.now() - t0,
        retryCount: priorErrors,
      })
      return { kind: "ok", value: r.value }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      // Erros tipados carregam o output CRU (HtmlTruncatedError /
      // HeroOutputInvalidError / OpsParseError) — persistido no run pra o
      // "OUTPUT BRUTO" do painel mostrar ONDE o modelo parou.
      const raw =
        err instanceof Error && typeof (err as { raw?: unknown }).raw === "string"
          ? ((err as { raw?: string }).raw ?? "")
          : ""
      // O modelo respondeu e o parser rejeitou: a chamada foi PAGA. O chain
      // gruda o consumo no erro (step-usage) justamente para o run de erro
      // não fechar com 0 token e $0 — e para o prompt rejeitado ficar
      // disponível, que é o único insumo de debug que importa aqui.
      const usage = usageOf(err)
      log.error("phase2.fmt.step_error", {
        emailId,
        agent: p.agent,
        attempt: priorErrors,
        error: lastError,
        tokensOutput: usage?.tokensOutput ?? 0,
      })
      await finishGenerationRun(runId, {
        storeId,
        flowId,
        emailId,
        triggeredBy,
        batchId,
        agent: p.agent,
        agentConfigId: p.config?.id,
        status: "error",
        model: p.model,
        durationMs: Date.now() - t0,
        errorMessage: lastError,
        retryCount: priorErrors,
        ...(raw ? { rawOutput: raw } : {}),
        ...(usage
          ? {
              tokensInput: usage.tokensInput,
              tokensOutput: usage.tokensOutput,
              costCents: resolveCostCents({
                model: p.model,
                tokensInput: usage.tokensInput,
                tokensOutput: usage.tokensOutput,
                costUsd: usage.costUsd,
              }),
              ...(usage.renderedPrompt
                ? { renderedPrompt: usage.renderedPrompt }
                : {}),
            }
          : {}),
      }).catch(() => {})
      priorErrors += 1
    }
  }

  return { kind: "failed", lastError }
}


/**
 * Cadeia de formatação (split do HTML agent): HERO → TEXTO → IMAGEM →
 * CORES, com resume por html_pipeline_stage, retry 1x por step e budget
 * dinâmico. Substitui o Step 2 (HTML monolítico) + Step 2.5 (Refinador).
 *
 * - hero/texto/imagem: 2ª falha → failed com o failure_reason do agente.
 * - cores: FAIL-OPEN — 2ª falha ou budget esgotado → segue com o HTML do
 *   step de imagem (o email já está completo; cores são polimento).
 * - out_of_budget (hero/texto/imagem): estágio persistido, status continua
 *   `rendering`, watchdog re-entra e retoma do ponto.
 */
async function runFormattingChain(p: {
  ctx: Awaited<ReturnType<typeof loadMinimalContext>>
  storeId: string
  flowId: string
  emailId: string
  triggeredBy?: string
  batchId: string
  relaxedBrandCheck?: boolean
  routeT0: number
  budgetMs: number
}): Promise<
  | { status: "ok"; html: string; qaViews: QaBlockView[] }
  | { status: "failed" }
  | { status: "out_of_budget" }
> {
  const admin = createAdminClient()
  const {
    ctx,
    storeId,
    flowId,
    emailId,
    triggeredBy,
    batchId,
    relaxedBrandCheck,
    routeT0,
    budgetMs,
  } = p
  const ids = { storeId, flowId, emailId, triggeredBy, batchId }

  const failStep = async (agent: FormatAgent, lastError: string) => {
    const reason = FMT_FAILURE_REASON[agent]
    log.error("phase2.fmt.step_failed", { emailId, agent, reason, lastError })
    await markEmailFailed(emailId, reason)
    await safeNotifyEmailFailed(storeId, emailId, reason, batchId || null)
    if (batchId) {
      await rollupCostAndMaybeAlert({
        storeId,
        emailId,
        batchId,
        costAlertUsd: ctx.costAlertUsd,
      }).catch(() => {})
      await checkBatchTerminal(storeId, batchId).catch(() => {})
    }
  }

  // ── Contexto compartilhado da cadeia (queries 1x) ──────────────────
  let fmtCtx: FormatChainContext
  try {
    fmtCtx = await loadFormatChainContext({
      emailId,
      brand: ctx.brand,
      briefing: ctx.briefing,
      blueprint: ctx.blueprint,
      topProducts: ctx.topProducts,
      storeRaw: ctx.storeRaw,
      flowType: ctx.flowType,
      emailNumber: ctx.emailNumber,
      admin,
      relaxedBrandCheck,
    })
  } catch (err) {
    const isBrandIncomplete =
      err instanceof Error && err.name === "BrandIncompleteError"
    const reason = isBrandIncomplete ? "brand_incomplete" : "context_load_failed"
    log.error("phase2.fmt.context_error", {
      emailId,
      reason,
      error: err instanceof Error ? err.message : String(err),
    })
    await markEmailFailed(emailId, reason)
    await safeNotifyEmailFailed(storeId, emailId, reason, batchId || null)
    if (batchId) await checkBatchTerminal(storeId, batchId).catch(() => {})
    return { status: "failed" }
  }

  // ── Resume: retoma do último step CONCLUÍDO (watchdog re-entry) ─────
  const { data: st } = await admin
    .from("email_flow_emails")
    .select("html, html_pipeline_stage")
    .eq("id", emailId)
    .maybeSingle()
  let stage = (st?.html_pipeline_stage as "hero" | "text" | "image" | null) ?? null
  let currentHtml = stage ? ((st?.html as string | null) ?? "") : ""
  if (stage && !currentHtml) {
    // Estado inconsistente (stage sem HTML) → recomeça a cadeia do zero.
    log.warn("phase2.fmt.stage_without_html", { emailId, stage })
    stage = null
  }
  if (stage) log.info("phase2.fmt.resumed_from", { emailId, stage })

  // ── Toggles da aba Agentes ─────────────────────────────────────────
  // Agente DESATIVADO tem o step pulado (run 'skipped', HTML inalterado) —
  // o toggle passa a ser kill-switch de verdade, sem migration nem env.
  const heroSwitch = resolveAgentSwitch(ctx.heroConfig)
  const textSwitch = resolveAgentSwitch(ctx.textFormatConfig)
  const imageFmtSwitch = resolveAgentSwitch(ctx.imageFormatConfig)
  const colorSwitch = resolveAgentSwitch(ctx.colorFormatConfig)
  const verifierSwitch = resolveAgentSwitch(ctx.mergeVerifierConfig)
  const disabledAgents = (
    [
      ["hero_section", heroSwitch],
      ["text_format", textSwitch],
      ["image_format", imageFmtSwitch],
      ["color_format", colorSwitch],
      ["merge_verifier", verifierSwitch],
    ] as const
  )
    .filter(([, s]) => s.disabled)
    .map(([a]) => a)
  if (disabledAgents.length > 0) {
    log.info("phase2.fmt.agents_disabled", { emailId, disabledAgents })
  }

  /** Registra o step pulado por toggle (visível no drill-down dos logs). */
  const logStepDisabled = async (
    agent: FormatAgent | "merge_verifier",
    html: string,
  ) => {
    await logGenerationRun({
      ...ids,
      agent,
      status: "skipped",
      model: "disabled",
      inputVars: { input_html_len: html.length, input_sha8: sha8(html) },
      parsedOutput: {
        reason: "agent_disabled",
        output_html_len: html.length,
        output_sha8: sha8(html),
      },
      costCents: 0,
      durationMs: 0,
    }).catch(() => {})
  }

  const persistStage = async (
    html: string,
    stageVal: "hero" | "text" | "image" | null,
    extra?: Record<string, unknown>,
  ) => {
    await admin
      .from("email_flow_emails")
      .update({
        html,
        html_pipeline_stage: stageVal,
        updated_at: new Date().toISOString(),
        ...(extra ?? {}),
      })
      .eq("id", emailId)
  }

  // ── ENXERTO DA HERO (arquitetura por ID, jul/2026) ─────────────────
  // O Montador escolhe a variante; quem escreve a hero no documento é o
  // CÓDIGO, com o HTML canônico da biblioteca (html_tagged aprovado, senão
  // html). Antes o Montador (LLM) reescrevia o documento inteiro e achatava
  // a variante — banda escura do logo, 2º CTA e subtítulo sumiam antes de
  // qualquer agente rodar, e o agente de hero só podia reproduzir o que
  // recebeu (o `rendered_html` das variantes é mockup de imagem, não serve
  // de espelho). Enxertado ANTES da anotação de slots para que os
  // placeholders da variante entrem no endereçamento como os demais.
  let heroVariant: HeroVariantData | null = null
  let heroVariantSource: HeroVariantSource = null
  let heroGraftStatus:
    | GraftStatus
    // resume: o enxerto já está no HTML persistido.
    | "skipped_resume"
    // MC-5: a reference veio do assembleDocument — a hero canônica já está lá.
    | "skipped_assembled" = "skipped_resume"
  /** blueprint × slot_map apontam variantes diferentes (blueprint venceu). */
  let heroVariantMismatch = false
  // MC-5: o enxerto só vale para reference que NÃO veio da montagem por
  // código. Desde a CM-2 o `assembleDocument` já coloca a hero canônica no
  // documento — reenxertá-la era refazer o mesmo trabalho e aplicar
  // `normalizeFonts` duas vezes no mesmo HTML. Sobra o caso legítimo:
  // reference antiga (persistida antes da CM-2) e o fallback para o
  // template global, onde a hero é a do template, não a da biblioteca.
  const heroGraftApplies =
    stage === null && fmtCtx.referenceSource !== "assembler"
  if (stage === null && !heroGraftApplies) {
    heroGraftStatus = "skipped_assembled"
    log.info("phase2.fmt.hero_graft_skipped_assembled", {
      emailId,
      hint: "reference montada por código já traz a hero canônica",
    })
  }
  if (heroGraftApplies) {
    const resolved = await resolveHeroVariant(admin, {
      storeId,
      flowType: ctx.flowType,
      emailNumber: ctx.emailNumber,
      slotMap: fmtCtx.slotMap,
      blueprint: ctx.blueprint,
    })
    heroVariant = resolved.variant
    heroVariantSource = resolved.source
    heroVariantMismatch = resolved.mismatch
    const graft = graftHeroVariant(
      fmtCtx.referenceHtml,
      heroVariant ? effectiveVariantHtml(heroVariant) : null,
    )
    heroGraftStatus = graft.status
    if (graft.status === "grafted") {
      // Componentes vêm de origens diferentes (Arial, Courier, Trebuchet):
      // sem isso o email sai com 3 tipografias. A da loja sempre vence.
      const fonts = normalizeFonts(graft.html, {
        heading: fmtCtx.fontHeading,
        body: fmtCtx.fontBody,
      })
      fmtCtx.referenceHtml = fonts.html
      log.info("phase2.fmt.hero_grafted", {
        emailId,
        variantId: heroVariant?.id ?? null,
        variantSource: heroVariantSource,
        replacedLen: graft.replaced_len,
        variantLen: graft.variant_len,
        fontsNormalized: fonts.replaced,
      })
    } else {
      log.warn("phase2.fmt.hero_graft_skipped", {
        emailId,
        status: graft.status,
        variantId: heroVariant?.id ?? null,
        variantSource: heroVariantSource,
      })
    }
  }

  // ── Contrato dos blocos (MC-3) ─────────────────────────────────────
  // O que cada bloco DEVE conter — campos, natureza, limite — extraído do
  // snapshot gravado na linha. Vai para os formatadores como INPUT (slot
  // vazio cujo campo está no contrato é campo esperando valor, não sujeira
  // a remover) e serve de régua para MEDIR as ops que eles emitem.
  const blockContracts = buildBlockContracts(fmtCtx.blocks)
  const blockContractsJson = JSON.stringify(blockContracts, null, 2)
  const contractTagSet = contractTags(fmtCtx.blocks)

  // ── Anotação de slots (Fase 2 do endereçamento) ────────────────────
  // Injeta data-cfy-slot/data-cfy-row por CÓDIGO (offset exato) antes de
  // qualquer agente rodar. Feito aqui — e não no Montador — para valer
  // também para as references JÁ persistidas, sem regerar nada. Os
  // atributos são internos: a limpeza final (após o step de imagem) os
  // remove junto com os marcadores cfy:block.
  {
    const ann = annotateSlots(fmtCtx.referenceHtml)
    if (ann.annotated > 0) {
      fmtCtx.referenceHtml = ann.html
      log.info("phase2.fmt.slots_annotated", {
        emailId,
        annotated: ann.annotated,
      })
    }
  }

  // ── STEP 1 — HERO SECTION ──────────────────────────────────────────
  if (stage === null && heroSwitch.disabled) {
    // Desativado: segue com a reference (enxerto incluso, se houve) sem o
    // LLM da hero. Os placeholders da região vão intactos pro merge.
    currentHtml = fmtCtx.referenceHtml
    await logStepDisabled("hero_section", currentHtml)
    await persistStage(currentHtml, "hero")
    stage = "hero"
  }
  if (stage === null) {
    // Enxertada → a região é o trecho entre as sentinelas cfy:hero (os
    // marcadores cfy:block da hero foram consumidos pelo splice). Sem
    // enxerto, cascata normal do localizador.
    const grafted = heroGraftStatus === "grafted"
    // A REGIÃO é canônica em dois casos: quando o enxerto a colocou, e
    // quando ela já veio canônica da montagem por código (MC-5). Nos dois
    // o agente faz substituição PURA — `hero_source: library`, variante
    // enviada vazia (a região já é a referência). Sem esta distinção o
    // pulo do enxerto reintroduziria o modo `montador`, em que o agente
    // trata a variante como verdade estrutural a RESTAURAR — justamente o
    // comportamento que a montagem por código tornou desnecessário.
    const regionIsCanonical =
      grafted || heroGraftStatus === "skipped_assembled"
    const sentinel = grafted ? extractHeroBySentinels(fmtCtx.referenceHtml) : null
    const region = sentinel
      ? { start: sentinel.start, end: sentinel.end, mode: "marker" as const }
      : locateHeroRegion(fmtCtx.referenceHtml)
    const variant = heroVariant
    const variantSource = heroVariantSource

    // CM-5: sem a região não há o que finalizar. O fallback `full_doc` — o
    // agente devolvendo o documento inteiro com a hero trocada — foi
    // removido: com a montagem por código os marcadores são sempre válidos,
    // então região ausente virou sinal de bug (ou reference legada sem
    // marcador que também escapou do tag-locator), e autorizar a reescrita
    // do email todo era a maior superfície de risco da cadeia.
    if (!region) {
      log.error("phase2.fmt.hero_region_not_found", {
        emailId,
        graftStatus: heroGraftStatus,
        variantId: variant?.id ?? null,
      })
      await failStep("hero_section", "hero_region_not_found")
      return { status: "failed" }
    }

    const regionHtml = fmtCtx.referenceHtml.slice(region.start, region.end)
    const vars = buildHeroVars(fmtCtx, {
      regionHtml,
      variant,
      grafted: regionIsCanonical,
    })
    const config = toChainConfig(heroSwitch.config, "hero_section")

    // Espelho visual (CM-8). A decisão é tomada AQUI, e não dentro do
    // chain, porque o run é aberto com um `model` — e com o fallback ativo
    // esse campo tem de registrar o modelo que de fato roda, senão o custo
    // por email aparece atribuído ao modelo errado.
    const heroRendered = heroVariant
      ? resolveRenderedReference(heroVariant)
      : null
    const visionDecision = decideHeroVision(config.model, {
      kind: heroRendered?.kind ?? "empty",
      renderedHtml: heroRendered?.html ?? null,
      modelOverride: ctx.heroVisionModel,
    })

    const outcome = await executeFormatStep<string>({
      ids,
      agent: "hero_section",
      config: heroSwitch.config,
      model: visionDecision.model,
      routeT0,
      budgetMs,
      inputHtml: fmtCtx.referenceHtml,
      attempt: async () => {
        const r = await invokeHeroChain({
          config,
          vars,
          vision: visionDecision,
          // A região é trocada pelo fragmento NO MESMO lugar: ele tem de
          // voltar com a mesma fronteira. Em modo marker a região é uma
          // <tr>; em modo tag, uma <table>.
          expectShape:
            heroShapeOf(
              fmtCtx.referenceHtml.slice(region.start, region.end),
            ) ?? undefined,
        })
        const next = spliceHero(fmtCtx.referenceHtml, region, r.output)
        return {
          value: next,
          tokensInput: r.tokensInput,
          tokensOutput: r.tokensOutput,
          costUsd: r.costUsd,
          renderedPrompt: r.renderedPrompt,
          rawOutput: r.rawOutput,
          parsed: {
            hero_mode: region.mode,
            hero_source: regionIsCanonical ? "library" : "montador",
            graft_status: heroGraftStatus,
            variant_source: variantSource,
            variant_id: variant?.id ?? null,
            variant_mismatch: heroVariantMismatch,
            // Relatório do que o agente descartou (CM-5). Ausente → o
            // fragmento vale do mesmo jeito; só a observabilidade se perde.
            hero_report: r.report,
            hero_report_missing: r.report === null,
            // CM-6: por que o exemplo renderizado da variante entrou (ou
            // não) no prompt. `stale` alimenta o selo dos logs.
            rendered_reference: heroRendered
              ? {
                  used: heroRendered.html !== null,
                  reason: heroRendered.reason,
                  stale: heroRendered.stale,
                  kind: heroRendered.kind,
                  caveats: heroRendered.caveats,
                }
              : null,
            // CM-8: o exemplo foi ANEXADO como imagem (e em qual modelo) ou
            // seguiu como texto. `reason` diz por quê — sem isso, o custo do
            // fallback subiria sem explicação no relatório de geração.
            vision: r.vision,
            output_html_len: next.length,
            output_sha8: sha8(next),
            output_html: htmlSnapshot(next),
          },
        }
      },
    })

    if (outcome.kind === "out_of_budget") return { status: "out_of_budget" }
    if (outcome.kind === "failed") {
      await failStep("hero_section", outcome.lastError)
      return { status: "failed" }
    }
    currentHtml = outcome.value
    await persistStage(currentHtml, "hero")
    stage = "hero"
  }

  // ── STEP 2 — FORMATAÇÃO DE TEXTO ───────────────────────────────────
  // Relatório do merge visível aos ramos seguintes (exceção × legado).
  let lastMergeReport: import("./html/copy-merge").CopyMergeReport | null = null
  // Blocos do merge (com block_id) — amarram as views do agente de exceção
  // à mesma chave do n8n.
  let lastMergeBlocks: import("./html/copy-merge").MergeBlock[] | null = null
  // Triagem do Verificador (7b) por tag — null = verificador off/falhou/
  // não rodou → o agente de exceção segue com a fila mecânica pura.
  let verifierTriage: Map<string, MergeVerifierExcecao> | null = null
  // Views por bloco do QA (F5) — extraídas ANTES do strip dos marcadores
  // cfy:block. Vazio no resume pós-strip (o QA cai no fallback por content).
  let qaViews: QaBlockView[] = []
  if (stage === "hero") {
    // ── Estágio 0 (Fase A): merge determinístico de copy — CÓDIGO, sem
    // LLM. Campo com fields.tag resolvido + valor do n8n é trocado pelo
    // Integrador; run próprio (agent='copy_merge') com métricas completas.
    // Tudo resolvido → o LLM de texto é PULADO (run 'skipped').
    const mergeInput = currentHtml
    const mergeT0 = Date.now()
    lastMergeReport = null
    const mergeBlocks = mergeBlocksFromContext(
      fmtCtx.blocks as Array<{
        id?: string
        position: number
        block_type: string
        content: Record<string, unknown> | null
      }>,
      fmtCtx.blueprint?.blocks as
        | Array<{ type: string; fields?: MergeField[] | null }>
        | undefined,
    )
    const merge = copyMerge(mergeInput, mergeBlocks)
    lastMergeBlocks = mergeBlocks

    // Estruturais por CÓDIGO (título/preheader/marca/ano/logo/unsubscribe).
    // Links de footer/social ficam intactos — o strip final limpa o token
    // sem apagar a linha. Nada disso vai pro LLM (incidente Luxe Lift:
    // o agente de exceção apagava o rodapé inteiro por "slot sem copy").
    const structural = applyStructuralFills(merge.html, {
      subject: fmtCtx.emailRow?.subject ?? "",
      preheader: fmtCtx.emailRow?.preheader ?? "",
      brandName: fmtCtx.brandName,
      logoUrl: fmtCtx.logoLight,
      year: new Date().getFullYear(),
    })
    merge.html = structural.html

    // Guard anti-colapso: fila de copy tomando quase todo o documento =
    // blueprint sem âncoras (fields.tag null — variantes não tagueadas),
    // não "copy faltando". Antes isso passava silencioso e o LLM comia
    // seções inteiras.
    const copySlots = merge.report.slots_total - merge.report.structural_out.length
    const collapsed =
      copySlots >= 10 && merge.report.left_for_llm.length / copySlots > 0.6
    if (collapsed) {
      log.error("phase2.fmt.merge_anchor_collapse", {
        emailId,
        slots_total: merge.report.slots_total,
        merged: merge.report.merged,
        left_for_llm: merge.report.left_for_llm.length,
        hint: "blueprint sem fields.tag — passar as variantes pelo Taguedor",
      })
    }
    // O schema é a base: a key do campo deveria ser a mesma chave que o n8n
    // devolve. Todo campo que só casou pelo copyKey canônico é uma variante
    // ainda no vocabulário velho — e é o que segura a ponte de
    // copy-key-resolve viva.
    if (merge.report.keys_via_canonical.length > 0) {
      log.warn("phase2.fmt.merge_via_canonical_key", {
        emailId,
        keys: merge.report.keys_via_canonical,
        hint: "schema da variante fora do vocabulário do n8n — alinhar as keys",
      })
    }
    await logGenerationRun({
      ...ids,
      agent: "copy_merge",
      status: "success",
      model: "deterministic",
      inputVars: {
        stage: "text",
        input_html_len: mergeInput.length,
        input_sha8: sha8(mergeInput),
        slots_total: merge.report.slots_total,
        ops_built: merge.report.ops_built,
      },
      parsedOutput: {
        merged: merge.report.merged,
        left_for_llm: merge.report.left_for_llm,
        unanchored_keys: merge.report.unanchored_keys,
        // Ponte do vocabulário antigo: campos que só casaram pelo copyKey
        // canônico do tag-registry, e não pela key do schema. Enquanto isso
        // não zerar, o n8n ainda devolve copy no vocabulário velho e
        // copy-key-resolve não pode ser removido. Zerou = pode cair fora.
        keys_via_canonical: merge.report.keys_via_canonical,
        // Estruturais: posse do código (nunca vão pro LLM).
        structural_out: merge.report.structural_out,
        structural_filled: structural.filled,
        structural_left: structural.left,
        // Blueprint sem âncoras → fila de copy engole o documento.
        anchor_collapse: collapsed,
        ops_skipped: merge.report.skipped.map((s) => ({
          action: s.op.action,
          tag: "tag" in s.op ? s.op.tag : null,
          block_id: s.op.block_id ?? null,
          reason: s.reason,
        })),
        output_html_len: merge.html.length,
        output_sha8: sha8(merge.html),
        output_html: htmlSnapshot(merge.html),
      },
      costCents: 0,
      durationMs: Date.now() - mergeT0,
    }).catch(() => {})
    currentHtml = merge.html
    lastMergeReport = merge.report

    // ── 7b: Verificador de merge (LLM barato; migration 20261043) ────
    // Audita o resultado do merge com views (nunca o documento) e tria a
    // fila do agente de exceção. Modo via settings: on_flag (default) só
    // roda quando o relatório acusa algo; always audita tudo; off = fila
    // mecânica. FALLBACK OBRIGATÓRIO: erro/timeout aqui NUNCA derruba a
    // geração — verifierTriage fica null e o fluxo segue como antes.
    // Doc legado sem slots (slots_total=0) não tem o que triar — pula.
    // Toggle desativado na aba Agentes equivale a modo 'off'.
    const verifierMode = verifierSwitch.disabled ? "off" : ctx.mergeVerifierMode
    const reportFlagged =
      merge.report.left_for_llm.length > 0 ||
      merge.report.unanchored_keys.length > 0 ||
      merge.report.skipped.length > 0
    if (verifierMode !== "off" && merge.report.slots_total > 0) {
      const shouldRun = verifierMode === "always" || reportFlagged
      if (!shouldRun) {
        await logGenerationRun({
          ...ids,
          agent: "merge_verifier",
          status: "skipped",
          model: "n/a",
          parsedOutput: { skip_reason: "merge_clean", mode: verifierMode },
          costCents: 0,
          durationMs: 0,
        }).catch(() => {})
      } else {
        const vT0 = Date.now()
        const vConfig = verifierChainConfig(verifierSwitch.config)
        try {
          const vInput = buildMergeVerifierInput(
            merge.html,
            mergeBlocks,
            merge.report,
          )
          const v = await invokeMergeVerifierChain({
            config: vConfig,
            vars: {
              relatorio_merge_json: JSON.stringify(
                {
                  slots_total: merge.report.slots_total,
                  merged: merge.report.merged,
                  left_for_llm: merge.report.left_for_llm,
                  unanchored_keys: merge.report.unanchored_keys,
                },
                null,
                2,
              ),
              slots_preenchidos_json: JSON.stringify(
                vInput.slots_preenchidos,
                null,
                2,
              ),
              slots_sobrando_json: JSON.stringify(
                vInput.slots_sobrando,
                null,
                2,
              ),
              copy_nao_usada_json: JSON.stringify(
                vInput.copy_nao_usada,
                null,
                2,
              ),
            },
          })
          // Só entradas fixáveis pelo 7c (tags que AINDA têm token no doc)
          // alimentam a fila; flags sobre slots preenchidos são telemetria
          // (o 7c não tem op pra reescrever valor já aplicado).
          const leftSet = new Set(merge.report.left_for_llm)
          const fixable = v.result.excecoes.filter((e) => leftSet.has(e.tag))
          verifierTriage = new Map(fixable.map((e) => [e.tag, e]))
          await logGenerationRun({
            ...ids,
            agent: "merge_verifier",
            status: "success",
            model: vConfig.model,
            inputVars: {
              stage: "text",
              mode: verifierMode,
              flagged: reportFlagged,
              slots_preenchidos: vInput.slots_preenchidos.length,
              slots_sobrando: vInput.slots_sobrando.length,
              copy_nao_usada: vInput.copy_nao_usada.length,
            },
            renderedPrompt: v.renderedPrompt,
            rawOutput: v.rawOutput.slice(0, 8000),
            parsedOutput: {
              aprovado: v.result.aprovado,
              excecoes: v.result.excecoes,
              fila_para_excecao: fixable.length,
              flags_slots_preenchidos: v.result.excecoes.filter(
                (e) => !leftSet.has(e.tag),
              ),
            },
            tokensInput: v.tokensInput,
            tokensOutput: v.tokensOutput,
            costCents: resolveCostCents({
              model: vConfig.model,
              tokensInput: v.tokensInput,
              tokensOutput: v.tokensOutput,
              costUsd: v.costUsd,
            }),
            durationMs: Date.now() - vT0,
          }).catch(() => {})
        } catch (err) {
          verifierTriage = null // fallback: fila mecânica decide
          const msg = err instanceof Error ? err.message : String(err)
          log.warn("phase2.fmt.merge_verifier_failed_fallback", {
            emailId,
            error: msg,
          })
          await logGenerationRun({
            ...ids,
            agent: "merge_verifier",
            status: "error",
            model: vConfig.model,
            errorMessage: msg.slice(0, 500),
            parsedOutput: { fallback: "mechanical_queue" },
            costCents: 0,
            durationMs: Date.now() - vT0,
          }).catch(() => {})
        }
      }
    }

    // Skip só quando o doc TINHA slots e todos resolveram — documento
    // legado sem {{TAGS}} (slots_total=0) precisa do full-doc pra colocar
    // a copy (senão ela se perderia).
    if (
      merge.report.left_for_llm.length === 0 &&
      merge.report.slots_total > 0
    ) {
      // Biblioteca 100% ancorada: nada pro LLM — a baleia é pulada.
      await logGenerationRun({
        ...ids,
        agent: "text_format",
        status: "skipped",
        model: "deterministic",
        parsedOutput: {
          skip_reason: "copy_merge_resolveu_tudo",
          output_html_len: currentHtml.length,
          output_sha8: sha8(currentHtml),
        },
        costCents: 0,
        durationMs: 0,
      }).catch(() => {})
      await persistStage(currentHtml, "text")
      stage = "text"
    }
  }
  // text_format desativado na aba Agentes: o que o merge não resolveu
  // fica como está (o strip final limpa os tokens órfãos) — nenhum LLM
  // toca o texto.
  if (stage === "hero" && textSwitch.disabled) {
    await logStepDisabled("text_format", currentHtml)
    await persistStage(currentHtml, "text")
    stage = "text"
  }
  // ── A3b — agente de EXCEÇÃO por slot: só a fila do merge, output em
  // ops do protocolo do Integrador (posse = tags da fila; hero vetada).
  if (
    stage === "hero" &&
    lastMergeReport &&
    lastMergeReport.left_for_llm.length > 0
  ) {
    const inputHtml = currentHtml
    const leftTags = lastMergeReport.left_for_llm
    // View base por slot; quando o Verificador (7b) rodou, cada slot ganha
    // a triagem dele (motivo + copy candidata pareada + ação sugerida) —
    // fila triada. Sem verificador (off/falha) segue a view mecânica pura.
    const slots = buildExceptionSlots(
      inputHtml,
      leftTags,
      lastMergeBlocks ? tagToBlockIdMap(lastMergeBlocks) : undefined,
    ).map((s) => {
      const t = verifierTriage?.get(s.tag)
      return t
        ? {
            ...s,
            motivo: t.motivo,
            copy_candidata: t.copy_candidata,
            acao_sugerida: t.acao_sugerida,
          }
        : s
    })
    const config = toChainConfig(textSwitch.config, "text_format")

    const outcome = await executeFormatStep<string>({
      ids,
      agent: "text_format",
      config: textSwitch.config,
      model: config.model,
      routeT0,
      budgetMs,
      inputHtml,
      attempt: async () => {
        const textVars = buildTextFormatVars(fmtCtx, inputHtml)
        const r = await invokeTextExceptionChain({
          config,
          vars: {
            exception_slots_json: JSON.stringify(slots, null, 2),
            blocks_with_content_json:
              textVars.blocks_with_content_json ?? "[]",
            block_contracts_json: blockContractsJson,
          },
        })
        const ops = parseOps(r.rawOps)
        const applied = applyOps(inputHtml, ops, {
          allowHero: false,
          allowedTags: new Set(leftTags),
        })
        return {
          value: applied.html,
          tokensInput: r.tokensInput,
          tokensOutput: r.tokensOutput,
          costUsd: r.costUsd,
          renderedPrompt: r.renderedPrompt,
          rawOutput: r.rawOutput,
          parsed: {
            mode: "exception_slots",
            slots_sent: slots.length,
            contrato: measureOpsAgainstContract(ops, contractTagSet),
            ops_applied: applied.applied,
            ops_skipped: applied.skipped.map((s) => ({
              action: s.op.action,
              tag: "tag" in s.op ? s.op.tag : null,
              block_id: s.op.block_id ?? null,
              reason: s.reason,
            })),
            output_html_len: applied.html.length,
            output_sha8: sha8(applied.html),
            output_html: htmlSnapshot(applied.html),
          },
        }
      },
    })

    if (outcome.kind === "out_of_budget") return { status: "out_of_budget" }
    if (outcome.kind === "failed") {
      await failStep("text_format", outcome.lastError)
      return { status: "failed" }
    }
    currentHtml = outcome.value
    await persistStage(currentHtml, "text")
    stage = "text"
  }

  if (stage === "hero") {
    const inputHtml = currentHtml
    const vars = buildTextFormatVars(fmtCtx, inputHtml)
    const config = toChainConfig(textSwitch.config, "text_format")

    const outcome = await executeFormatStep<string>({
      ids,
      agent: "text_format",
      config: textSwitch.config,
      model: config.model,
      routeT0,
      budgetMs,
      inputHtml,
      attempt: async () => {
        const r = await invokeTextFormatChain({ config, vars })
        let out = r.html
        let heroRespliced = false
        // Hero byte-idêntica entre sentinelas; divergiu → re-splice
        // determinístico (restaura a hero canônica do step anterior).
        if (!heroUnchanged(inputHtml, out)) {
          const restored = respliceHero(out, inputHtml)
          if (restored) {
            out = restored
            heroRespliced = true
          }
          // Sem sentinelas em um dos lados: o guard abaixo acusa
          // hero_sentinels_lost (ou o modo full_doc nunca teve sentinelas
          // e o guard não cobra).
        }
        const guard = textFormatGuard(inputHtml, out)
        if (!guard.ok) throw new Error(`guard: ${guard.reason}`)
        return {
          value: out,
          tokensInput: r.tokensInput,
          tokensOutput: r.tokensOutput,
          costUsd: r.costUsd,
          renderedPrompt: r.renderedPrompt,
          rawOutput: r.rawOutput,
          parsed: {
            hero_respliced: heroRespliced,
            output_html_len: out.length,
            output_sha8: sha8(out),
            output_html: htmlSnapshot(out),
          },
        }
      },
    })

    if (outcome.kind === "out_of_budget") return { status: "out_of_budget" }
    if (outcome.kind === "failed") {
      await failStep("text_format", outcome.lastError)
      return { status: "failed" }
    }
    currentHtml = outcome.value
    await persistStage(currentHtml, "text")
    stage = "text"
  }

  // ── STEP 3 — FORMATAÇÃO DE IMAGEM ──────────────────────────────────
  if (stage === "text" && imageFmtSwitch.disabled) {
    await logStepDisabled("image_format", currentHtml)
    await persistStage(currentHtml, "image")
    stage = "image"
  }
  if (stage === "text") {
    const inputHtml = currentHtml
    const vars: Record<string, string> = {
      ...buildImageFormatVars(fmtCtx, inputHtml),
      block_contracts_json: blockContractsJson,
    }
    const config = toChainConfig(imageFmtSwitch.config, "image_format")

    const outcome = await executeFormatStep<string>({
      ids,
      agent: "image_format",
      config: imageFmtSwitch.config,
      model: config.model,
      routeT0,
      budgetMs,
      inputHtml,
      attempt: async () => {
        const r = await invokeImageFormatChain({ config, vars })
        const applied = applyOps(inputHtml, r.ops, { allowHero: false })
        let slotsSent = 0
        try {
          slotsSent = (JSON.parse(vars.image_slots_json) as unknown[]).length
        } catch {
          /* view ausente (prompt custom antigo) — segue 0 */
        }
        return {
          value: applied.html,
          tokensInput: r.tokensInput,
          tokensOutput: r.tokensOutput,
          costUsd: r.costUsd,
          renderedPrompt: r.renderedPrompt,
          rawOutput: r.rawOutput,
          parsed: {
            slots_sent: slotsSent,
            contrato: measureOpsAgainstContract(r.ops, contractTagSet),
            ops_applied: applied.applied,
            ops_skipped: applied.skipped.map((s) => ({
              action: s.op.action,
              target:
                s.op.action === "replace"
                  ? s.op.find.slice(0, 60)
                  : s.op.action === "recolor"
                    ? s.op.from
                    : s.op.tag,
              reason: s.reason,
            })),
            output_html_len: applied.html.length,
            output_sha8: sha8(applied.html),
            output_html: htmlSnapshot(applied.html),
          },
        }
      },
    })

    if (outcome.kind === "out_of_budget") return { status: "out_of_budget" }
    if (outcome.kind === "failed") {
      await failStep("image_format", outcome.lastError)
      return { status: "failed" }
    }

    // Views do QA (F5): extraídas AQUI, com os marcadores ainda no doc —
    // depois do strip eles somem e a view por bloco fica irrecuperável.
    qaViews = buildQaBlockViews(
      outcome.value,
      (fmtCtx.blocks ?? []).map((b) => ({
        id: b.id,
        position: b.position,
        block_type: b.block_type,
      })),
    )

    // Limpeza final do documento (era o fim do postProcessHtml do agente
    // monolítico): sentinelas + marcadores cfy:block fora, indentação
    // &nbsp; do GLM removida, placeholders órfãos limpos, lang da loja.
    // O color_format recebe o documento já apresentável.
    currentHtml = enforceLangAttribute(
      stripUnresolvedPlaceholders(
        stripNbspIndentation(
          stripSlotAttributes(
            stripCfyBlockMarkers(
              stripAgentProtocolBlocks(stripSentinels(outcome.value)),
            ),
          ),
        ),
      ),
      fmtCtx.locale,
    )
    // Snapshot pré-polimento (compare de 3 vias na UI) — semântica da
    // coluna preservada: "HTML antes do último retoque visual".
    await persistStage(currentHtml, "image", { html_pre_refiner: currentHtml })
    stage = "image"
  }

  // ── STEP 4 — CORES & BOTÕES (substitui o Refinador; FAIL-OPEN) ─────
  if (colorSwitch.disabled) {
    await logStepDisabled("color_format", currentHtml)
  } else {
    const inputHtml = currentHtml
    const config = toChainConfig(colorSwitch.config, "color_format")
    const storeRaw = ctx.storeRaw as Record<string, unknown>
    const vars = buildColorFormatVars(fmtCtx, inputHtml, {
      brand: ctx.brand,
      niche: (storeRaw.niche as string) || "",
      tones: deriveToneKeys(
        ((storeRaw.tone_description as string) ??
          (storeRaw.tom_de_voz as string)) ||
          null,
      ).join(", "),
      pesquisaFullText: pesquisaToFullText(storeRaw as PesquisaFields),
    })

    const outcome = await executeFormatStep<{
      html: string
      applied: number
      skipped: number
    }>({
      ids,
      agent: "color_format",
      config: colorSwitch.config,
      model: config.model,
      routeT0,
      budgetMs,
      inputHtml,
      attempt: async () => {
        const r = await invokeColorFormatChain({ config, vars })
        const applied = applyOps(inputHtml, r.ops, { allowHero: true })
        // Guard: ops replace não podem quebrar a estrutura (um find/replace
        // que engole um </table> corrompe o documento).
        const count = (s: string) => (s.match(/<table[\s>]/gi) ?? []).length
        if (count(applied.html) !== count(inputHtml)) {
          throw new Error("guard: table_count_changed_by_ops")
        }
        return {
          value: {
            html: applied.html,
            applied: applied.applied,
            skipped: applied.skipped.length,
          },
          tokensInput: r.tokensInput,
          tokensOutput: r.tokensOutput,
          costUsd: r.costUsd,
          renderedPrompt: r.renderedPrompt,
          rawOutput: r.rawOutput,
          parsed: {
            contrato: measureOpsAgainstContract(r.ops, contractTagSet),
            ops_applied: applied.applied,
            ops_skipped: applied.skipped.map((s) => ({
              action: s.op.action,
              target:
                s.op.action === "replace"
                  ? s.op.find.slice(0, 60)
                  : s.op.action === "recolor"
                    ? s.op.from
                    : s.op.tag,
              reason: s.reason,
            })),
            output_html_len: applied.html.length,
            output_sha8: sha8(applied.html),
            output_html: htmlSnapshot(applied.html),
          },
        }
      },
    })

    if (outcome.kind === "ok") {
      currentHtml = outcome.value.html
      await persistStage(currentHtml, null)
    } else {
      // FAIL-OPEN: cores são polimento — budget esgotado ou 2 falhas mantêm
      // o HTML do step de imagem e seguem pra ready. Telemetria: skipped.
      log.warn("phase2.fmt.color_fail_open", {
        emailId,
        reason: outcome.kind === "failed" ? outcome.lastError : "out_of_budget",
      })
      if (outcome.kind === "out_of_budget") {
        await logGenerationRun({
          storeId,
          flowId,
          emailId,
          triggeredBy,
          batchId,
          agent: "color_format",
          status: "skipped",
          model: config.model,
          parsedOutput: { reason: "out_of_budget" },
        }).catch(() => {})
      }
      await persistStage(currentHtml, null)
    }
  }

  return { status: "ok", html: currentHtml, qaViews }
}


export async function runPhase2HtmlQa(
  params: RunPhase2Params,
): Promise<{ status: "ready" | "failed" | "skipped" }> {
  const { storeId, emailId, triggeredBy, relaxedBrandCheck } = params
  const admin = createAdminClient()
  // Relógio da invocação — o Refinador (Step 2.5) pula quando o orçamento
  // de tempo da rota (maxDuration=300s) está quase esgotado.
  const routeT0 = Date.now()
  log.info("phase2.html_qa.start", { storeId, emailId })

  // ── Guard -1: email "somente texto" NÃO gera HTML/QA ─────────────────
  // Legado preso no meio do pipeline (image_done/rendering quando a flag
  // foi ligada): vira `ready` direto com html null.
  if (await resolveTextOnlyForEmail(admin, emailId)) {
    const guardNow = new Date().toISOString()
    const { data: settled } = await admin
      .from("email_flow_emails")
      .update({
        status: "ready",
        ready_at: guardNow,
        updated_at: guardNow,
        html: null,
        qa_issues: [],
        failure_reason: null,
      })
      .eq("id", emailId)
      .in("status", ["image_done", "rendering"])
      .select("generation_batch_id")
    log.info("phase2.html_qa.skipped_text_only", {
      storeId,
      emailId,
      settled: (settled ?? []).length > 0,
    })
    const textOnlyBatch =
      (settled?.[0]?.generation_batch_id as string | null) ?? null
    if (textOnlyBatch) {
      await checkBatchTerminal(storeId, textOnlyBatch).catch(() => {})
    }
    return { status: "skipped" }
  }

  // ── Claim atomico: image_done OR rendering -> rendering ──────────────
  // Aceita ambos porque:
  //   - image_done: caminho split (rota run-phase2-image -> run-phase2-html-qa)
  //   - rendering: caminho legacy (runPhase2InBackground em monolito) +
  //     watchdog disparando direto pra esta rota com email travado em rendering
  const nowIso = new Date().toISOString()
  // Renova `rendering_started_at` no claim: o relógio de timeout do watchdog
  // (PHASE2_TIMEOUT_MIN=10min, Front 3) usa esse campo. Sem isso o HTML+QA
  // herdaria os ~190s já consumidos pela fase imagem e seria morto cedo.
  const { data: claimed } = await admin
    .from("email_flow_emails")
    .update({
      status: "rendering",
      rendering_started_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", emailId)
    .in("status", ["image_done", "rendering"])
    .select("id, flow_id, generation_batch_id")

  if (!claimed || claimed.length === 0) {
    log.info("phase2.html_qa.skipped_no_claim", { emailId })
    return { status: "skipped" }
  }

  const flowId = claimed[0].flow_id as string
  const batchId = (claimed[0].generation_batch_id as string | null) ?? ""

  let ctx: Awaited<ReturnType<typeof loadMinimalContext>>
  try {
    ctx = await loadMinimalContext(storeId, emailId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao carregar contexto"
    log.error("phase2.html_qa.context.error", { emailId, error: msg })
    await markEmailFailed(emailId, "context_load_failed")
    await safeNotifyEmailFailed(storeId, emailId, "context_load_failed", batchId || null)
    if (batchId) await checkBatchTerminal(storeId, batchId).catch(() => {})
    return { status: "failed" }
  }


  // ── Step 2: Cadeia de formatação (HERO → TEXTO → IMAGEM → CORES) ────
  // Substitui o agente HTML monolítico + o Refinador (corte seco,
  // migration 20261039). Resume por html_pipeline_stage; retry 1x por
  // step; budget dinâmico (out_of_budget → status fica rendering e o
  // watchdog re-entra pra retomar do ponto).
  const budgetMs = params.budgetMs ?? chainBudgetMs()
  const fmtResult = await runFormattingChain({
    ctx,
    storeId,
    flowId,
    emailId,
    triggeredBy,
    batchId,
    relaxedBrandCheck,
    routeT0,
    budgetMs,
  })
  if (fmtResult.status === "failed") return { status: "failed" }
  if (fmtResult.status === "out_of_budget") {
    log.warn("phase2.html_qa.out_of_budget", { emailId })
    return { status: "skipped" }
  }
  const finalHtml = fmtResult.html

  // ── QA REMOVIDO do fluxo (EMAIL_QA_ENABLED != 'true') ────────────────
  // Bypass do agente LLM: HTML pronto -> status `ready` direto, sem custo,
  // sem qa_failed. As checagens DETERMINISTICAS (computeRenderChecks — sem
  // LLM) continuam rodando: NAO bloqueiam, so persistem issues informativos
  // em qa_issues pra dar visibilidade de formatacao ao designer.
  // Claim atomico `rendering -> ready` mantem idempotencia.
  if (!isQaEnabled()) {
    const renderIssues = computeRenderChecks(finalHtml)
    if (renderIssues.length > 0) {
      log.warn("phase2.qa.render_checks_issues", {
        emailId,
        count: renderIssues.length,
        types: renderIssues.map((i) => i.type),
      })
    }
    const { data: readyClaimed } = await admin
      .from("email_flow_emails")
      .update({
        status: "ready",
        ready_at: new Date().toISOString(),
        qa_issues: renderIssues,
        updated_at: new Date().toISOString(),
      })
      .eq("id", emailId)
      .eq("status", "rendering")
      .select("id")
    if (!readyClaimed || readyClaimed.length === 0) {
      log.info("phase2.qa.skipped_already_started", { emailId })
      return { status: "skipped" }
    }
    // Telemetria: registra o QA como pulado (visivel no painel de logs).
    await logGenerationRun({
      storeId,
      flowId,
      emailId,
      triggeredBy,
      batchId: batchId ?? "",
      agent: "qa",
      status: "skipped",
      model: "disabled",
      parsedOutput: {
        reason: "qa_disabled_flag",
        passed: true,
        issues_count: renderIssues.length,
      },
    }).catch(() => {})
    if (batchId) await rollupCostAndMaybeAlert({ storeId, emailId, batchId, costAlertUsd: ctx.costAlertUsd }).catch(() => {})
    if (batchId) await checkBatchTerminal(storeId, batchId).catch(() => {})
    log.info("phase2.qa.disabled_ready", { storeId, emailId, batchId })
    return { status: "ready" }
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
    return { status: "skipped" }
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
      .select("id, position, block_type, label, content, fields")
      .eq("email_id", emailId)
      .order("position", { ascending: true })
    const blocksForQa = (qaBlocks ?? []).map((b: Record<string, unknown>) => ({
      block_type: (b.block_type as string) ?? "unknown",
      content: ((b.content as Record<string, unknown>) ?? {}),
    }))
    // MC-3: o QA passa a ver o CONTRATO, não só o documento. Campo do
    // contrato ausente no HTML é achado de QA — antes ele só podia julgar
    // o que estava escrito, e um bloco que perdeu um slot parecia apenas
    // um bloco menor.
    const qaContracts = buildBlockContracts(
      (qaBlocks ?? []).map((b: Record<string, unknown>) => ({
        id: (b.id as string) ?? "",
        position: (b.position as number) ?? 0,
        block_type: (b.block_type as string) ?? "unknown",
        label: (b.label as string | null) ?? null,
        fields: b.fields,
      })),
    )
    // F5: views extraídas pela cadeia (com marcadores); resume pós-strip
    // deixa a lista vazia → fallback por content dos blocos.
    const blockViews =
      fmtResult.qaViews.length > 0
        ? fmtResult.qaViews
        : viewsFromBlocksFallback(
            (qaBlocks ?? []).map((b: Record<string, unknown>) => ({
              id: (b.id as string) ?? "",
              position: (b.position as number) ?? 0,
              block_type: (b.block_type as string) ?? "unknown",
              content: (b.content as Record<string, unknown>) ?? null,
            })),
          )
    qaResult = await runQaAgent({
      storeId,
      emailId,
      flowId,
      batchId,
      triggeredBy,
      html: finalHtml,
      blocks: blocksForQa,
      blockViews,
      briefing: ctx.briefing,
      brand: ctx.brand,
      blueprintObjective: ctx.blueprintObjective,
      qaVisionEnabled: ctx.qaVisionEnabled,
      // fields v2 do blueprint híbrido → validação max_len/required no QA.
      blueprintBlocks: ctx.blueprint?.blocks ?? [],
      blockContracts: qaContracts,
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
  // `qaResult.passed` ja embute o threshold de severidade (computado em
  // qa.chain.ts via EMAIL_QA_BLOCK_SEVERITY). Confiar nessa flag evita
  // double-check redundante.
  if (!qaResult.passed) {
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
    await safeNotifyEmailFailed(storeId, emailId, "qa_failed", batchId || null)
    if (batchId) await rollupCostAndMaybeAlert({ storeId, emailId, batchId, costAlertUsd: ctx.costAlertUsd }).catch(() => {})
    if (batchId) await checkBatchTerminal(storeId, batchId).catch(() => {})
    log.info("phase2.qa.blocked", { emailId, issuesCount: qaResult.issues.length })
    return { status: "failed" }
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
  if (batchId) await rollupCostAndMaybeAlert({ storeId, emailId, batchId, costAlertUsd: ctx.costAlertUsd }).catch(() => {})
  if (batchId) await checkBatchTerminal(storeId, batchId).catch(() => {})

  log.info("phase2.done", { storeId, emailId, batchId })
  return { status: "ready" }
}

/**
 * Wrapper monolitico: roda imagem + html + qa em sequencia, dentro do
 * mesmo runtime. Mantido por retrocompat com callers que NAO precisam de
 * split HTTP (notavelmente o watchdog dispatchando direto e os testes
 * unitarios). Tem custo proibitivo de tempo (~355s) — evitar em rotas HTTP
 * com maxDuration=300s.
 */
export async function runPhase2InBackground(
  params: RunPhase2Params,
): Promise<void> {
  const r = await runPhase2Image(params)
  if (r.status === "image_done") {
    await runPhase2HtmlQa(params)
  }
}


/**
 * Direção fotográfica das variantes casadas aos blocos do blueprint,
 * indexada por `variant_id`.
 *
 * Uma query por email em vez de uma por bloco: os blocos de um email
 * costumam repetir variantes (dois blocos de produto da mesma grade), e a
 * direção é o mesmo texto. Blueprint ausente, legado (sem `variant_id`) ou
 * nenhuma direção escrita → mapa vazio, e o prompt de imagem fica idêntico
 * ao de antes.
 */
async function loadPhotoDirections(
  admin: SupabaseClient,
  blocks: Array<{ variant_id?: string | null }> | undefined,
): Promise<Record<string, string>> {
  const ids = [
    ...new Set(
      (blocks ?? [])
        .map((b) => (b.variant_id ?? "").trim())
        .filter((id): id is string => id.length > 0),
    ),
  ]
  if (ids.length === 0) return {}

  const { data, error } = await admin
    .from("email_component_variants")
    .select("id, photo_direction")
    .in("id", ids)
  if (error) {
    // Sem direção o agente compõe como sempre compôs — não é motivo para
    // derrubar a geração da imagem.
    log.warn("phase2.image.photo_direction_load_failed", {
      error: error.message,
      ids: ids.length,
    })
    return {}
  }

  const out: Record<string, string> = {}
  for (const row of (data ?? []) as Array<{
    id: string
    photo_direction: string | null
  }>) {
    const text = (row.photo_direction ?? "").trim()
    if (text) out[row.id] = text
  }
  return out
}
