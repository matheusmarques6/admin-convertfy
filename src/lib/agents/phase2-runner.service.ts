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
  BlueprintBlockField,
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
import {
  deriveToneKeys,
  deriveFieldNature,
} from "./shared/component-dimensions"
import {
  resolveAspectForField,
  blockAspectFromBlueprint,
  imageDimsFromBlueprint,
  aspectInstructionForPrompt,
  dimsInstructionForPrompt,
  isAspectKey,
  type AspectKey,
} from "./image/aspect-ratio"
import {
  resolveImageMode,
  resolveImageAppendices,
} from "./image/mode-resolution"
import { isUsableProductImage } from "./image/product-image-guard"
import { loadPhotoDirections } from "./image/photo-directions"
import { pickProductForField } from "./image/product-for-field"
import { personaToText } from "./image/persona-text"
import { buildImageAlt } from "./image/resolve-block-prompt.service"
import { computeRenderChecks } from "./html/render-checks"
import {
  runQaAgent,
  runSchemaChecks,
  type SchemaCheckBlueprintBlock,
} from "./chains/qa.chain"
// ── Cadeia de formatação (split do HTML agent, migration 20261039) ──
import {
  invokeHeroChain,
  decideHeroVision,
  heroShapeOf,
} from "./chains/hero.chain"
import {
  invokeTextFormatChain,
  textFormatGuard,
} from "./chains/text-format.chain"
import { invokeColorFormatChain } from "./chains/color-format.chain"
import type { FormatChainConfig } from "./chains/format-invoke"
import { attachUsage, usageOf } from "./chains/step-usage"
import {
  buildSegmentedPrompt,
  concatSegments,
  type InputSummaryItem,
  type PromptSegment,
  type SegmentOrigin,
} from "./shared/prompt-provenance"
import {
  loadFormatChainContext,
  resolveHeroVariant,
  buildHeroVars,
  buildTextFormatVars,
  buildColorFormatVars,
  takeContractDrift,
  type FormatChainContext,
  type HeroVariantData,
  type HeroVariantSource,
} from "./html/format-context"
import {
  copyMergeByExample,
  heroCopyPreserved,
  isLogoKey,
  mergeBlocksFromContext,
  applyStructuralFills,
  type MergeField,
  type MergeAnchor,
} from "./html/copy-merge"
import { imageMerge } from "./html/image-merge"
import {
  defaultBackgroundFitDeps,
  fitBackgrounds,
} from "./image/background-fit.service"
import { fixHeroOverlayText } from "./html/fix-hero-overlay"
import {
  buildQaBlockViews,
  viewsFromBlocksFallback,
  type QaBlockView,
} from "./html/qa-views"
import { buildBlockContracts } from "./html/block-contract"
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
import { resolveRenderedReference } from "./shared/rendered-reference"
import { applyOps } from "./html/apply-patches"
import { colorOccurrenceCount,
  coresForaDaPaleta,
} from "./html/color-inventory"
import {
  stripUnresolvedPlaceholders,
  stripUnresolvedAttrTokens,
  stripSlotAttributes,
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
import { buildImagePromptWithSegments } from "./image/prompt-vars-builder"
import { MAX_AI_IMAGES, selectImageSlots } from "./image/limits"
import { runSlotWithRetry } from "./image/retry-slot"
import { flattenGroups, buildImageWorklist } from "./image/slot-groups"
import {
  overlaySpec,
  measureOverlayLuminance,
  overlayIsLight,
} from "./image/overlay-luminance"
import { loadTopProducts } from "./top-products"
import {
  loadEffectiveBlueprint,
  isTextOnlyEmail,
} from "./architect/blueprint-loader"
import { isBrandConfirmed } from "./html/brand-guards"

const log = logger.child("Phase2Runner")

// ── Fase de imagem: geração por SLOT ──────────────────────────────────
//
// Um bloco gera uma imagem POR CAMPO `imagem_gerada` do schema. Até 22/08
// gerava uma só, e a variante `produtos 7 - dois produtos` (8 slots) saía
// com sete `<img src="">` no e-mail do cliente.

/** Item da worklist: o campo, o grupo dele e o papel na ordem de geração. */
type SlotWork = ReturnType<typeof flattenGroups>[number]

/**
 * Concorrência da fase de imagem. Antes era `allSettled` sem limite sobre no
 * máximo 4 blocos; com ~16 slots por e-mail, disparar todos de uma vez vira
 * martelo no provedor.
 */
function imageConcurrency(): number {
  const env = Number(process.env.IMAGE_CONCURRENCY)
  return Number.isFinite(env) && env > 0 ? Math.floor(env) : 6
}

/**
 * Orçamento de tempo da fase de imagem. Não existia — só a cadeia de
 * formatação tinha guard (`PHASE2_CHAIN_BUDGET_MS`). Com uma imagem por
 * bloco o risco era baixo; com uma por slot, um e-mail pesado encosta no
 * `maxDuration` da rota (800s) e morre sem gravar nada. Estourado, para de
 * lançar slots novos e segue para o HTML com o que já tem.
 */
function imagePhaseBudgetMs(): number {
  const env = Number(process.env.IMAGE_PHASE_BUDGET_MS)
  return Number.isFinite(env) && env > 0 ? env : 600_000
}

/**
 * Campos do bloco. `email_blocks.fields` é o contrato da instância
 * (migration 20261065) e vence; o blueprint é fallback para linhas
 * anteriores a ela.
 */
function fieldsForImageBlock(
  blk: { position?: number | null; block_type?: string | null; fields?: unknown },
  blueprint: { blocks?: unknown } | null | undefined,
): BlueprintBlockField[] {
  if (Array.isArray(blk.fields) && blk.fields.length > 0) {
    return blk.fields as BlueprintBlockField[]
  }
  const bpBlocks = (blueprint?.blocks ?? []) as Array<{
    type?: string
    fields?: BlueprintBlockField[]
  }>
  const pos = blk.position ?? null
  const byIndex = (i: number) => {
    const cand = bpBlocks[i]
    return cand && cand.type === blk.block_type ? cand : null
  }
  const matched =
    pos != null ? (byIndex(pos - 1) ?? byIndex(pos)) : null
  return Array.isArray(matched?.fields) ? matched.fields : []
}

/** Blocos únicos por id, preservando a ordem. */
function dedupeBlocks<T extends { id: unknown }>(blocks: T[]): T[] {
  const seen = new Set<unknown>()
  return blocks.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)))
}

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
    /** Slot que a URL preenche (geração por campo). */
    fieldKey?: string | null
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
  // Geração por SLOT: uma URL por campo. Sem esta chave o reuse regravava
  // uma imagem só por bloco e desfazia, no modo "agente desligado", tudo o
  // que o fan-out por campo tinha resolvido.
  const slotByBlockField = new Map<string, string>()
  for (const r of runs ?? []) {
    const po = (r.parsed_output ?? {}) as ImageRunOutput
    if (!po.imageUrl) continue
    if (po.kind === "testimonial_avatar") {
      if (!po.blockId) continue
      const key = `${po.blockId}:${po.itemIndex ?? 0}`
      if (!avatarByBlockItem.has(key)) avatarByBlockItem.set(key, po.imageUrl)
      continue
    }
    if (po.blockId && po.fieldKey) {
      const key = `${po.blockId}:${po.fieldKey}`
      if (!slotByBlockField.has(key)) slotByBlockField.set(key, po.imageUrl)
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

    // Slots do bloco, um a um. Preserva o que já existe: o reuse só
    // preenche buraco, nunca sobrescreve imagem viva.
    const slotUrls: Record<string, { url: string; alt: string }> = {
      ...((content.images as Record<string, { url: string; alt: string }>) ??
        {}),
    }
    for (const [key, url] of slotByBlockField) {
      const [blockId, fieldKey] = key.split(":")
      if (blockId !== (blk.id as string)) continue
      if (slotUrls[fieldKey]?.url) continue
      slotUrls[fieldKey] = { url, alt: "" }
      changed = true
    }
    if (Object.keys(slotUrls).length > 0) content.images = slotUrls

    if (!content.image_url) {
      const url =
        // A principal sai do mapa de slots quando ele existe — assim o
        // espelho aponta para uma imagem que de fato está no bloco.
        Object.values(slotUrls)[0]?.url ??
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
/**
 * Segmentos do prompt de avatar. O texto é in-code; o nome do autor vem da
 * copy do n8n — separar os dois é o que diz, num avatar estranho, se o
 * problema é o template ou o dado.
 */
function avatarSegments(prompt: string, author: string): PromptSegment[] | null {
  const i = author ? prompt.indexOf(author) : -1
  if (i < 0) {
    return [
      { cls: "agente", rotulo: "Template do avatar (in-code)", texto: prompt, chars: prompt.length, parte: "user" },
    ]
  }
  const antes = prompt.slice(0, i)
  const depois = prompt.slice(i + author.length)
  return [
    ...(antes ? [{ cls: "agente" as const, rotulo: "Template do avatar (in-code)", texto: antes, chars: antes.length, parte: "user" as const }] : []),
    { cls: "upstream", rotulo: "Autor do depoimento — copy do n8n", texto: author, chars: author.length, parte: "user" },
    ...(depois ? [{ cls: "agente" as const, rotulo: "Template do avatar (in-code)", texto: depois, chars: depois.length, parte: "user" as const }] : []),
  ]
}

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
    // por block_type hardcoded. Ordena por position (prioriza topo do email).
    //
    // O teto NÃO entra aqui: ele conta IMAGENS, e um bloco gera uma imagem
    // por slot do schema. Cortar blocos na query era o que fazia o Welcome 1
    // da Luxe Lift perder a seção de reviews inteira (5 blocos marcados,
    // teto de 4 BLOCOS) — o corte agora é na worklist, por slot.
    //
    // `fields` é o contrato do bloco (migration 20261065): é dele que saem
    // os slots de imagem. Sem ele o bloco cai no caminho legado (1 imagem).
    const { data: imageBlocks } = await admin
      .from("email_blocks")
      .select("id, block_type, label, content, position, needs_image, fields")
      .eq("email_id", emailId)
      .eq("needs_image", true)
      .order("position", { ascending: true })

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
            // O prompt do avatar é 100% in-code (`renderAvatarPrompt`), com
            // o nome do autor interpolado — um segmento de agente e um da
            // copy que veio do n8n.
            promptSegments: avatarSegments(prompt, author),
            inputSummary: [
              {
                rotulo: "Bloco",
                cls: "upstream",
                valor: `depoimento #${idx + 1} de ${(blk.label as string) ?? "testimonials"}`,
              },
              { rotulo: "Autor do depoimento", cls: "upstream", valor: author },
              { rotulo: "Marca", cls: "loja", valor: brandName },
            ] as InputSummaryItem[],
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
            // O prompt do avatar é 100% in-code (`renderAvatarPrompt`), com
            // o nome do autor interpolado — um segmento de agente e um da
            // copy que veio do n8n.
            promptSegments: avatarSegments(prompt, author),
            inputSummary: [
              {
                rotulo: "Bloco",
                cls: "upstream",
                valor: `depoimento #${idx + 1} de ${(blk.label as string) ?? "testimonials"}`,
              },
              { rotulo: "Autor do depoimento", cls: "upstream", valor: author },
              { rotulo: "Marca", cls: "loja", valor: brandName },
            ] as InputSummaryItem[],
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

    /**
     * Gera UMA imagem: a do `slot` (um campo `imagem_gerada` do schema do
     * bloco) ou, quando `slot` é null, a imagem única do bloco — caminho
     * legado para bloco sem schema de imagem.
     *
     * `referenceUrl` é a imagem da ÂNCORA do grupo, passada aos slots
     * dependentes para que a miniatura mostre o mesmo item, cor e luz da
     * foto grande. É o que o cadastro pede ("o mesmo item e cor", "mesmo
     * enquadramento e mesma luz do painel 1").
     */
    const runImageSlot = async (
      blk: ImageBlockRow,
      slot: SlotWork | null,
      referenceUrl?: string | null,
      anchorKey?: string | null,
    ): Promise<{
      ok: boolean
      fieldKey: string | null
      url: string | null
      alt: string
      /** Luminância da faixa de overlay, quando o slot recebe texto por cima. */
      overlayLuminance?: number | null
    }> => {
      const fieldKey = slot?.field.key ?? null
      // Cadastro diz se este slot recebe overlay e em que fração da altura
      // ("sobrepostos aos 43% superiores"). null = imagem sem texto por cima.
      const overlayTexto = `${slot?.field.guidance ?? ""} ${slot?.field.image_spec ?? ""}`
      // O MESMO `overlaySpec` decide a instrução dada ao modelo (mais
      // abaixo) e a faixa medida aqui — pedir a faixa de cima e medir a de
      // baixo seria auditar com régua diferente da que gerou.
      const overlayMedida = overlaySpec(overlayTexto)
      let overlayLum: number | null = null
      const fail = { ok: false, fieldKey, url: null, alt: "" }
      const imgT0 = Date.now()
      // Declarados fora do try pra o catch tambem registrar o input no run.
      let promptVars: Record<string, string> | undefined
      let promptWithAspect = ""
      let promptSegments: PromptSegment[] | null = null
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
        // Reserva de overlay: sai do CADASTRO do campo, não de um booleano
        // fixo.
        //
        // Estava travada em `false` desde "Hero v5 (jul/2026)", com a
        // justificativa de que "a imagem do hero é um <img> standalone e o
        // texto é HTML separado". Essa premissa morreu quando a biblioteca
        // de componentes virou a fonte da arquitetura: `welcome - hero
        // section 4` põe a foto como background de TUDO e sobrepõe logo,
        // headline, cupom e CTA aos 43% de cima. O código dizia ao modelo o
        // contrário do que o schema pedia, na mesma chamada.
        //
        // É o MESMO texto que alimenta a medição de luminância mais abaixo
        // e o `especificidade` do IMAGE_SLOTS — três leitores, um cadastro.
        // SYNC CONTRACT com resolve-block-prompt.service.ts.
        const overlay = overlaySpec(overlayTexto)
        const reserveBottom = overlay != null
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
        const aspect: AspectKey = resolveAspectForField({
          // O aspect do SLOT vence: uma variante mistura 9:16 (foto grande)
          // com 4:5 (miniaturas), e herdar o do bloco gera errado.
          fieldAspect: slot?.field.image_aspect ?? null,
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
          fieldKey,
        )

        // ── AE-13: resolve mode (product_ref vs text2img) + fallbacks ──
        const multimodalEnabled =
          process.env.IMAGE_MULTIMODAL_ENABLED === "true"
        // topProductImageUrl vem de brand.top_products[0].image_url,
        // tipicamente uma signed URL Supabase com validade ~365 dias
        // (segura entre as fases copy → image → upload final).
        // Produto DESTE campo (03/09): `panel_2_*` → 2º produto. Antes toda
        // geração anexava o 1º, e o painel do CarScan saía com o EnergySave.
        const { product: productForField } = pickProductForField(
          ctx.topProducts,
          fieldKey,
        )
        const topProductImageUrl = productForField?.image_url ?? null
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
          // Copy real do bloco → mede as areas_de_texto dos slots em
          // IMAGE_SLOTS (o texto não sai daqui; só o papel e o tamanho).
          blockContent:
            (blk.content as Record<string, unknown> | null) ?? undefined,
          imageOverlayReserveBottom: reserveBottom,
          aspect,
          mode,
          photoDirectionByVariant,
          // Um slot por chamada: o prompt carrega só o brief deste campo.
          fieldKey,
          productForField,
          anchorKey: anchorKey ?? null,
        })

        // Se config existe no DB: renderImageTemplate (handlebars-lite,
        // suporta switch + if). Sem config: fallback pro template
        // hardcoded com o renderImagePrompt legacy (compat retroativa).
        const imageTemplate =
          ctx.imageConfig?.user_template ?? DEFAULT_IMAGE_PROMPT_TEMPLATE

        // Dims declaradas no schema vencem o aspect tipado também na
        // instrução de composição (o modelo compõe pro frame exato).
        const geometryInstruction = customDims
          ? dimsInstructionForPrompt(
              customDims.width,
              customDims.height,
              overlay,
            )
          : aspectInstructionForPrompt(aspect, overlay)
        // O prompt de imagem é montado e segmentado num lugar só
        // (`buildImagePromptWithSegments`) e os apêndices são decididos em
        // outro (`resolveImageAppendices`) — as mesmas funções que o
        // resolve-block-prompt e a regeneração manual usam, para os três
        // caminhos não saírem de sincronia.
        const { fidelity, fallbackDescription } = resolveImageAppendices({
          mode,
          modeSource,
          productName: productForField?.name,
          productImageUrl: topProductImageUrl,
        })

        const montado = buildImagePromptWithSegments({
          template: imageTemplate,
          vars: promptVars,
          fromConfig: Boolean(ctx.imageConfig),
          geometry: geometryInstruction,
          fallbackDescription,
          fidelity,
        })
        promptWithAspect = montado.prompt
        promptSegments = montado.segments

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
          promptSegments,
          inputSummary: [
            {
              rotulo: "Bloco",
              cls: "upstream",
              valor: `#${blk.position} ${blk.block_type} — ${(blk.label as string) ?? "sem rótulo"}`,
            },
            {
              rotulo: "Ideia do email",
              cls: "upstream",
              valor: promptVars.EMAIL_IDEIA || "(sem fio nem messaging)",
            },
            {
              rotulo: "Direção fotográfica",
              cls: "biblioteca",
              valor: promptVars.PHOTO_DIRECTION
                ? "da variante deste bloco"
                : "(não cadastrada na variante)",
            },
            {
              rotulo: "Produto de referência",
              cls: "loja",
              valor: mode === "product_ref"
                ? `foto real anexada — ${productForField?.name ?? "?"}${anchorKey ? ` · âncora ${anchorKey} anexada` : ""}`
                : `sem anexo (${modeSource})`,
            },
            {
              rotulo: "Geometria",
              cls: "sistema",
              valor: customDims
                ? `${customDims.width}×${customDims.height} (schema)`
                : `aspect ${aspect}`,
            },
          ] as InputSummaryItem[],
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
            // Refs ROTULADAS (03/09). Antes a âncora ia com o rótulo
            // "anchor" e SUBSTITUÍA a foto do produto (referenceImages
            // supersede referenceImageUrl): a thumb via só a foto grande,
            // sem instrução, e devolvia um recorte dela. Agora vão as duas,
            // cada uma dizendo o que é — o produto dá a identidade do objeto,
            // a âncora dá a sessão; o slot diz o que muda.
            ...(mode === "product_ref" && topProductImageUrl
              ? {
                  referenceImages: [
                    {
                      label: `CFY_REF_PRODUCT — the real product "${productForField?.name ?? ""}": shape, materials, colours, label. Identity only; do not copy its angle or background.`,
                      url: topProductImageUrl,
                    },
                    // Coerência dentro do grupo: a miniatura nasce DA foto
                    // grande. Ausente quando a âncora falhou — o slot gera
                    // sozinho em vez de cascatear a falha.
                    ...(referenceUrl
                      ? [
                          {
                            label: `CFY_REF_ANCHOR — the main photo of this same block${anchorKey ? ` (${anchorKey})` : ""}: same session, same product, same light and colour treatment. This frame MUST differ in angle, distance and framing as the slot brief says — never a crop or a repeat of it.`,
                            url: referenceUrl,
                          },
                        ]
                      : []),
                  ],
                }
              : {}),
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
            // Slot que recebe texto por cima (a hero): mede a faixa antes
            // do upload. Contraste sobre FOTO não se calcula com aritmética
            // de cor — o fundo ali é bitmap, não hex.
            ...(overlayMedida != null
              ? {
                  onFinalBuffer: async (buf: Buffer) => {
                    overlayLum = await measureOverlayLuminance(
                      buf,
                      overlayMedida.fraction,
                      overlayMedida.side,
                    )
                    log.info("phase2.image.overlay_luminance", {
                      emailId,
                      blockId: blk.id,
                      fieldKey,
                      side: overlayMedida.side,
                      fraction: overlayMedida.fraction,
                      luminance: overlayLum,
                      light: overlayIsLight(overlayLum),
                    })
                  },
                }
              : {}),
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
        // NÃO grava aqui: os slots do mesmo bloco correm em paralelo e um
        // read-modify-write por slot faria o último sobrescrever os outros.
        // Quem persiste é o orquestrador, uma vez por bloco, depois que
        // todos os slots dele assentam.
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
          promptSegments,
          tokensInput: imgMeta.tokensInput,
          tokensOutput: imgMeta.tokensOutput,
          costCents: imgMeta.costCents,
          parsedOutput: {
            blockId: blk.id,
            imageUrl,
            // O endereço do slot. Sem ele o reuse (agente desligado) não
            // sabe em qual campo regravar a URL e volta a 1 imagem/bloco.
            fieldKey,
            groupKey: slot?.groupKey ?? null,
            role: slot?.role ?? null,
            // Só em slot com overlay: é o que diz se a foto aguenta o texto
            // branco por cima, e a única chance de auditar essa decisão
            // depois — o valor persistido no bloco é sobrescrito na próxima
            // geração. O veredito acompanha o número: o corte mora junto do
            // `sharp` e não pode ser reimplementado no browser.
            overlayLuminance: overlayLum,
            overlayLight: overlayLum != null ? overlayIsLight(overlayLum) : null,
          },
        })
        return {
          ok: true,
          fieldKey,
          url: imageUrl,
          alt: altText,
          overlayLuminance: overlayLum,
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro na imagem"
        log.error("phase2.image.error", {
          emailId,
          blockId: blk.id,
          fieldKey,
          error: msg,
        })
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
          promptSegments,
          errorMessage: msg,
          tokensInput: imgMeta.tokensInput,
          tokensOutput: imgMeta.tokensOutput,
          costCents: imgMeta.costCents,
          parsedOutput: {
            blockId: blk.id,
            fieldKey,
            groupKey: slot?.groupKey ?? null,
            role: slot?.role ?? null,
          },
        })
        // NÃO aborta: sinaliza falha e deixa as outras imagens seguirem. O
        // slot fica sem URL (o image-merge remove a linha ou limpa o token).
        // Quem decide o estado terminal do email é a fase HTML+QA, não uma
        // imagem isolada.
        return fail
      }
    }

    // ── Worklist: um item por SLOT, não por bloco ────────────────────
    //
    // Testimonials mantém a semântica própria (1 avatar por depoimento) e
    // fica fora da worklist.
    const testimonialBlocks = (imageBlocks ?? []).filter(
      (b) => (b.block_type as string) === "testimonials",
    )
    const slotBlocks = (imageBlocks ?? []).filter(
      (b) => (b.block_type as string) !== "testimonials",
    )
    const work = buildImageWorklist(
      slotBlocks,
      (blk) => fieldsForImageBlock(blk, ctx.blueprint),
      MAX_AI_IMAGES,
      selectImageSlots,
    )
    const selected = [...work.anchors, ...work.dependents]

    if (work.droppedByCap > 0) {
      log.warn("phase2.image.capped", {
        emailId,
        generating: selected.length,
        dropped: work.droppedByCap,
        cap: MAX_AI_IMAGES,
      })
    }
    if (work.lockupSkipped > 0) {
      // Slot de lockup/ícone não vai ao modelo (wordmark e line-art saem
      // deformados). Registrado para não virar omissão silenciosa.
      log.info("phase2.image.lockup_slots_skipped", {
        emailId,
        count: work.lockupSkipped,
      })
    }

    // Acumulador por bloco: os slots do mesmo bloco correm em paralelo, e
    // gravar `content` dentro de cada um faria o último sobrescrever os
    // outros. Persiste uma vez por bloco, ao fim de cada onda.
    const imagesByBlock = new Map<
      string,
      Record<string, { url: string; alt: string; overlay_luminance?: number }>
    >()
    const anchorUrlByGroup = new Map<string, string>()
    const anchorKeyByGroup = new Map<string, string>()

    const persistBlock = async (blk: ImageBlockRow): Promise<void> => {
      const images = imagesByBlock.get(blk.id as string)
      if (!images || Object.keys(images).length === 0) return
      const content = (blk.content as Record<string, unknown>) ?? {}
      const anchorKey = Object.keys(images)[0]
      await admin
        .from("email_blocks")
        .update({
          content: {
            ...content,
            images,
            // ESPELHO da imagem principal do bloco. Todo o preview do
            // designer (render-html, email-detail-view, email-card) lê
            // `image_url`; mantê-lo evita quebrar essas telas de graça.
            image_url: images[anchorKey].url,
            image_alt: images[anchorKey].alt,
          },
        })
        .eq("id", blk.id)
    }

    const record = (
      blk: ImageBlockRow,
      r: {
        ok: boolean
        fieldKey: string | null
        url: string | null
        alt: string
        overlayLuminance?: number | null
      },
      groupKey?: string,
    ): void => {
      if (!r.ok || !r.url) return
      const id = blk.id as string
      const acc = imagesByBlock.get(id) ?? {}
      // Bloco legado (sem slot) grava numa chave sintética só para o
      // espelho; o image-merge dele resolve por bloco, não por campo.
      acc[r.fieldKey ?? "image"] = {
        url: r.url,
        alt: r.alt,
        // Só em slot com overlay. Quem consome é a correção de texto da
        // hero — o único jeito de saber se a foto aguenta branco em cima.
        ...(r.overlayLuminance != null
          ? { overlay_luminance: Number(r.overlayLuminance.toFixed(4)) }
          : {}),
      }
      imagesByBlock.set(id, acc)
      if (groupKey) {
        anchorUrlByGroup.set(`${id}:${groupKey}`, r.url)
        if (r.fieldKey) anchorKeyByGroup.set(`${id}:${groupKey}`, r.fieldKey)
      }
    }

    const t0Images = Date.now()
    const budgetLeft = () => imagePhaseBudgetMs() - (Date.now() - t0Images)
    let totalRetried = 0

    const runWave = async (
      items: typeof selected,
      withReference: boolean,
    ): Promise<number> => {
      let failures = 0
      let skippedNoBudget = 0
      let retried = 0
      const queue = [...items]
      const workers = Array.from(
        { length: Math.min(imageConcurrency(), queue.length) },
        async () => {
          for (;;) {
            const item = queue.shift()
            if (!item) return
            if (budgetLeft() <= 0) {
              skippedNoBudget++
              continue
            }
            const ref =
              withReference && item.slot
                ? anchorUrlByGroup.get(`${item.blk.id}:${item.slot.groupKey}`)
                : undefined
            const anchorKey =
              withReference && item.slot && ref
                ? anchorKeyByGroup.get(`${item.blk.id}:${item.slot.groupKey}`)
                : undefined
            try {
              // UMA segunda chance por slot. O retry envolve `runImageSlot`
              // por fora, e não mora dentro dele, de propósito: cada chamada
              // abre o próprio run de telemetria, então as duas tentativas
              // aparecem no Estúdio — a primeira com o erro real. Escondê-lo
              // lá dentro apagaria a tentativa perdida do histórico.
              const { result: r, retried: tentouDeNovo } = await runSlotWithRetry(
                () => runImageSlot(item.blk, item.slot, ref, anchorKey),
                budgetLeft,
              )
              if (tentouDeNovo) {
                retried++
                log.warn("phase2.image.retry", {
                  emailId,
                  blockId: item.blk.id,
                  fieldKey: item.slot?.field.key ?? null,
                  recuperado: r.ok,
                })
              }
              if (!r.ok) failures++
              record(
                item.blk,
                r,
                item.slot?.role === "anchor" ? item.slot.groupKey : undefined,
              )
            } catch {
              failures++
            }
          }
        },
      )
      await Promise.all(workers)
      if (skippedNoBudget > 0) {
        log.warn("phase2.image.out_of_budget", {
          emailId,
          skipped: skippedNoBudget,
          budgetMs: imagePhaseBudgetMs(),
        })
      }
      totalRetried += retried
      return failures
    }

    // ONDA 1 — âncoras e singletons. ONDA 2 — dependentes, cada um com a
    // imagem da sua âncora como referência visual. Na maioria dos e-mails a
    // onda 2 é vazia: a biblioteca inteira tem só 4 grupos com mais de um
    // slot.
    let imageFailures = await runWave(work.anchors, false)
    for (const blk of dedupeBlocks(work.anchors.map((w) => w.blk))) {
      await persistBlock(blk)
    }

    if (work.dependents.length > 0) {
      imageFailures += await runWave(work.dependents, true)
      for (const blk of dedupeBlocks(work.dependents.map((w) => w.blk))) {
        await persistBlock(blk)
      }
    }

    const avatarResults = await Promise.allSettled(
      testimonialBlocks.map((blk) => processTestimonialAvatars(blk)),
    )
    imageFailures += avatarResults.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && r.value === false),
    ).length

    const imageTotal = selected.length + testimonialBlocks.length
    if (imageFailures > 0) {
      log.warn("phase2.image.partial", {
        emailId,
        storeId,
        failed: imageFailures,
        total: imageTotal,
      })
    }
    log.info("phase2.image.slots_done", {
      emailId,
      slots: selected.length,
      waves: work.dependents.length > 0 ? 2 : 1,
      retried: totalRetried,
      elapsedMs: Date.now() - t0Images,
    })
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
// TETO POR STEP — e, por tabela, o que cada um EXIGE de folga: o guard de
// orçamento sai como `out_of_budget` quando `remaining < timeout + 30s`.
//
// Isso amarra o teto ao menor orçamento em que o step precisa caber, que é
// o do watchdog (240s, cron com maxDuration=300) e NÃO o da rota principal
// (760s). Um step com teto acima de 210s nunca é sequer TENTADO num tick do
// watchdog — e como o resume reentra pelo mesmo estágio, o email fica num
// laço: cada tick refaz copy_merge + merge_verifier e sai no mesmo ponto,
// sem registrar run do step travado (Luxe Lift, 10/08).
//
// O `text_format` estava em 540s, herança do modo full-doc em que ele
// reescrevia o documento inteiro. Hoje ele roda em modo EXCEÇÃO: recebe os
// slots pendentes e devolve um JSON de ops pequeno — o merge_verifier, mesmo
// modelo e mesmo tipo de saída, leva ~38s.
export const WATCHDOG_BUDGET_MS = 240_000
/** Folga exigida pelo guard: `remaining < timeout + BUDGET_HEADROOM_MS`. */
export const BUDGET_HEADROOM_MS = 30_000

export const FMT_STEP_TIMEOUT: Record<
  FormatAgent,
  { envVar: string; def: number }
> = {
  // 141s observado no caso bom (Luxe Lift, 10/08); 180 dá folga sem
  // estourar o tick.
  hero_section: { envVar: "HERO_CHAIN_TIMEOUT_MS", def: 180_000 },
  text_format: { envVar: "TEXT_FORMAT_TIMEOUT_MS", def: 120_000 },
  image_format: { envVar: "IMAGE_FORMAT_TIMEOUT_MS", def: 180_000 },
  // JSON de ops pequeno e fail-open — 240s era teto de sobra.
  color_format: { envVar: "COLOR_FORMAT_TIMEOUT_MS", def: 120_000 },
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
  /** O mesmo prompt marcado por origem (migration 20261085). */
  promptSegments?: PromptSegment[] | null
  /** A Entrada estruturada do step — o que ele recebeu, com origem. */
  inputSummary?: InputSummaryItem[] | null
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
  /**
   * `tentativa` = índice desta tentativa (0 = primeira, 1 = a última antes
   * de o step falhar). Só a hero usa: o guard de copy cobra na primeira e
   * ACEITA na última, em vez de matar o email inteiro.
   */
  attempt: (tentativa: number) => Promise<StepAttemptResult<T>>
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
      const r = await p.attempt(priorErrors)
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
        promptSegments: r.promptSegments,
        inputSummary: r.inputSummary,
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
        // A Entrada do step vale no erro tanto quanto no sucesso — é ela que
        // diz se o agente recebeu o que deveria antes de falhar.
        ...(usage?.inputSummary ? { inputSummary: usage.inputSummary } : {}),
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
              ...(usage.promptSegments
                ? { promptSegments: usage.promptSegments }
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
  | {
      status: "ok"
      html: string
      qaViews: QaBlockView[]
      /** Copy da hero que o guard reprovou e que seguiu assim mesmo. */
      heroCopyAceita: string[]
    }
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

  /**
   * Marca o email como falho por um motivo qualquer. Extraído do `failStep`
   * porque o `copy_merge` também precisa reprovar (bloco com copy e sem
   * contrato) e ele não é um `FormatAgent` — não tem chain nem retry.
   */
  const failEmail = async (reason: string, agent: string, lastError: string) => {
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

  const failStep = async (agent: FormatAgent, lastError: string) =>
    failEmail(FMT_FAILURE_REASON[agent], agent, lastError)

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
  const disabledAgents = (
    [
      ["hero_section", heroSwitch],
      ["text_format", textSwitch],
      ["image_format", imageFmtSwitch],
      ["color_format", colorSwitch],
    ] as const
  )
    .filter(([, s]) => s.disabled)
    .map(([a]) => a)
  if (disabledAgents.length > 0) {
    log.info("phase2.fmt.agents_disabled", { emailId, disabledAgents })
  }

  /** Registra o step pulado por toggle (visível no drill-down dos logs). */
  const logStepDisabled = async (agent: FormatAgent, html: string) => {
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

  // O strip dos marcadores deixou de ser ETAPA da cadeia e virou fronteira
  // de SAÍDA (27/08): `html` — a coluna que todo mundo lê e que vira o email
  // do cliente — sai sempre limpa, e `html_marked` guarda o mesmo documento
  // com os `cfy:block`, que é o que torna a região de cada bloco
  // endereçável depois que a geração terminou (edição manual de estrutura).
  //
  // Sem isto, reordenar um bloco na tela só mexia no contrato de copy: o
  // HTML final não tinha mais âncora nenhuma e o email não mudava.
  const persistStage = async (
    html: string,
    stageVal: "hero" | "text" | "image" | null,
    extra?: Record<string, unknown>,
  ) => {
    await admin
      .from("email_flow_emails")
      .update({
        html: stripCfyBlockMarkers(html),
        html_marked: html,
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

  // RESOLVER a variante e ENXERTÁ-LA são coisas diferentes, e juntá-las foi
  // um erro. A resolução também é de onde sai o `design_system` — a
  // especificação escrita à mão de como aquela hero DEVE ficar, que é o
  // insumo mais importante do agente. Com a MC-5 pulando o bloco inteiro
  // para reference montada, `variant` virava null e o `<design_system>`
  // sumia do prompt; o próprio contrato do agente lê ausência de spec como
  // "a região é final, faça só substituição" — e a hero saiu achatada
  // (Luxe Lift, 10/08). Resolver SEMPRE; enxertar só quando faz falta.
  if (stage === null) {
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
  }

  if (stage === null && !heroGraftApplies) {
    heroGraftStatus = "skipped_assembled"
    log.info("phase2.fmt.hero_graft_skipped_assembled", {
      emailId,
      variantId: heroVariant?.id ?? null,
      hasDesignSystem: Boolean(heroVariant?.design_system?.trim()),
      hint: "reference montada por código já traz a hero canônica",
    })
  }
  if (heroGraftApplies) {
    const graft = graftHeroVariant(
      fmtCtx.referenceHtml,
      heroVariant?.html ?? null,
    )
    heroGraftStatus = graft.status
    if (graft.status === "grafted") {
      // Componentes vêm de origens diferentes (Arial, Courier, Trebuchet):
      // sem isso o email sai com 3 tipografias. A da loja sempre vence.
      const fonts = normalizeFonts(graft.html, {
        heading: fmtCtx.fontHeading,
        body: fmtCtx.fontBody,
        headingWeight: fmtCtx.fontHeadingWeight,
        bodyWeight: fmtCtx.fontBodyWeight,
      })
      fmtCtx.referenceHtml = fonts.html
      log.info("phase2.fmt.hero_grafted", {
        emailId,
        variantId: heroVariant?.id ?? null,
        variantSource: heroVariantSource,
        replacedLen: graft.replaced_len,
        variantLen: graft.variant_len,
        fontsNormalized: fonts.replaced,
        weightsNormalized: fonts.weightsReplaced,
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

  // ── Estágio 0 — MERGE POR EXAMPLE (antes da hero, D1) ──────────────
  // O endereço da copy é a frase do `example` do schema, encontrada no HTML
  // pelo anchor-match — e a hero (LLM) reescreveria a região e mataria as
  // âncoras, então o merge roda ANTES do STEP 1 e escreve TAMBÉM dentro das
  // sentinelas cfy:hero. O guard `heroCopyPreserved` cobra, no fragmento
  // devolvido pelo agente, cada valor aplicado na região.
  //
  // `mergeBlocks`/`textFieldsTotal` são computados SEMPRE (resume incluso):
  // a decisão de pular o text_format depende de saber se o blueprint tem
  // campos de texto, mesmo quando o merge já rodou numa invocação anterior.
  const { blocks: mergeBlocks, blocos_sem_contrato: blocosSemContrato } =
    mergeBlocksFromContext(
      fmtCtx.blocks as Array<{
        id?: string
        position: number
        block_type: string
        content: Record<string, unknown> | null
        fields?: MergeField[] | null
      }>,
      fmtCtx.blueprint?.blocks as
        | Array<{ type: string; fields?: MergeField[] | null }>
        | undefined,
    )
  const textFieldsTotal = mergeBlocks.reduce(
    (n, b) =>
      n + b.fields.filter((f) => deriveFieldNature(f) === "copy").length,
    0,
  )
  /** Valores que o merge aplicou DENTRO da hero — insumo do guard do STEP 1. */
  let heroValues: string[] = []
  /**
   * Valores da hero que vieram de campo de LOGO. O prompt manda trocar o
   * wordmark em texto pelo `<img>` do logo real, então a string some do
   * texto por ORDEM nossa — o guard precisa saber quais são para aceitar a
   * imagem no lugar (ver heroCopyPreserved).
   */
  let heroLogoValues: string[] = []
  /**
   * Valores que o guard reprovou na ÚLTIMA tentativa e que seguiram assim
   * mesmo. Vira issue na aba QA do email — o operador precisa ver, e o
   * email precisa existir para ele ver.
   */
  let heroCopyAceita: string[] = []
  /** Campos da hero que o merge NÃO escreveu — o agente decide as linhas. */
  let heroPending: Array<{ key: string; motivo: string; tem_valor: boolean }> =
    []

  // Bloco com copy do n8n e SEM contrato: existe texto para escrever e
  // nenhum endereço. Até 28/08 isso era fail-open MUDO — o bloco seguia
  // sem fields, os campos nunca viravam slot e o email era entregue com o
  // texto de exemplo da variante (a InnovaBay, que vende medidor de
  // energia, saiu falando de bolsas de couro europeias). Reprovar é pior
  // para o operador e MUITO melhor para o cliente: um email interrompido
  // se vê; um email com a copy da biblioteca passa direto.
  if (blocosSemContrato.length > 0) {
    const resumo = blocosSemContrato
      .map((b) => `#${b.position} ${b.block_type} (${b.keys_na_copy.length} campo(s))`)
      .join(", ")
    log.error("phase2.fmt.merge_sem_contrato", {
      emailId,
      blocos: blocosSemContrato,
      hint: "email_blocks.fields vazio com content preenchido — reseed do email ou blueprint regerado sem contrato",
    })
    await logGenerationRun({
      ...ids,
      agent: "copy_merge",
      status: "error",
      model: "deterministic",
      errorMessage: `blocos com copy e sem contrato: ${resumo}`,
      parsedOutput: { blocos_sem_contrato: blocosSemContrato },
      costCents: 0,
    }).catch(() => {})
    await failEmail("merge_sem_contrato", "copy_merge", resumo)
    return { status: "failed" }
  }

  if (stage === null) {
    const mergeInput = fmtCtx.referenceHtml
    const mergeT0 = Date.now()
    // Região da hero no PRIMEIRO passe: sentinelas quando o graft rodou;
    // senão a mesma cascata do STEP 1 (marcadores/tags do hero-locator).
    const heroRegionForMerge =
      extractHeroBySentinels(mergeInput) ?? locateHeroRegion(mergeInput)
    const merge = copyMergeByExample(mergeInput, mergeBlocks, {
      heroRange: heroRegionForMerge
        ? { start: heroRegionForMerge.start, end: heroRegionForMerge.end }
        : null,
    })

    // Estruturais por CÓDIGO: logo (src="URL_DO_LOGO_AQUI") e marca
    // (NOME_DA_MARCA em texto/alt) — fora da hero, que é posse do agente
    // (contraste de logo em banda escura é juízo dele). Os tokens {{}}
    // seguem como sobrevida do caminho full-doc legado.
    const logoUrl = /src\s*=\s*"([^"]+)"/i.exec(fmtCtx.logoLight)?.[1] ?? ""
    const structural = applyStructuralFills(merge.html, {
      brandName: fmtCtx.brandName,
      logoUrl,
      subject: fmtCtx.emailRow?.subject ?? "",
      preheader: fmtCtx.emailRow?.preheader ?? "",
      logoMarkup: fmtCtx.logoLight,
      year: new Date().getFullYear(),
    })

    // Guard anti-colapso: maioria dos campos sem lugar = biblioteca com
    // examples podres (cadastro divergiu do HTML), não "copy faltando".
    // Fail-open por decisão — registra alto e claro, nunca derruba.
    // Campos que não chegaram a virar slot contam como perda: sem isso o
    // denominador encolhe junto com o numerador e o guard fica cego —
    // foi o que deixou passar o 31/31 do Welcome 1 da InnovaBay.
    const perdidosSemContrato = blocosSemContrato.reduce(
      (n, b) => n + b.keys_na_copy.length,
      0,
    )
    const denominador = merge.report.slots_total + perdidosSemContrato
    const perdidos = merge.report.sem_lugar.length + perdidosSemContrato
    const collapsed = denominador >= 10 && perdidos / denominador > 0.6
    if (collapsed) {
      log.error("phase2.fmt.merge_anchor_collapse", {
        emailId,
        slots_total: merge.report.slots_total,
        merged: merge.report.merged,
        sem_lugar: merge.report.sem_lugar.length,
        sem_contrato: perdidosSemContrato,
        hint: "examples do schema não batem com o HTML — revisar o cadastro das variantes",
      })
    }

    // Texto do HTML que nenhum campo endereça. `suspeito` = vocabulário de
    // exemplo da biblioteca, e isso é erro de CADASTRO: sem campo no schema,
    // o trecho não vai ao n8n, não volta como copy e nenhum agente tem
    // alçada para tocá-lo — sai no email como está (os selos "SELO n /
    // OFF n" da InnovaBay, 28/08). Fail-open, mas nunca mais em silêncio.
    const orfaosSuspeitos = merge.report.texto_orfao.filter((t) => t.suspeito)
    if (orfaosSuspeitos.length > 0) {
      log.warn("phase2.fmt.texto_de_exemplo_no_documento", {
        emailId,
        total: orfaosSuspeitos.length,
        trechos: orfaosSuspeitos.slice(0, 10).map((t) => t.texto),
        hint: "cadastrar o campo no output_schema da variante (aba Componentes) — sem contrato ninguém escreve ali",
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
      },
      // Sem prompt — é código. A Entrada é o que explica de onde veio o que
      // foi escrito no documento.
      inputSummary: [
        {
          rotulo: "Documento de entrada",
          cls: "upstream",
          valor: `${mergeInput.length.toLocaleString("pt-BR")} chars (sha8 ${sha8(mergeInput)})`,
        },
        {
          rotulo: "Copy a ancorar",
          cls: "upstream",
          valor: `${merge.report.slots_total} campo(s) do contrato, com valor do callback do n8n`,
        },
        {
          rotulo: "Âncoras",
          cls: "biblioteca",
          valor: "example de cada campo no HTML da variante (mesma régua do cadastro)",
        },
      ] as InputSummaryItem[],
      parsedOutput: {
        slots_total: merge.report.slots_total,
        ops_built: merge.report.ops_built,
        merged: merge.report.merged,
        campos: merge.report.campos,
        sem_lugar: merge.report.sem_lugar,
        ambiguos: merge.report.ambiguos,
        estruturais: structural.filled,
        estruturais_left: structural.cleaned,
        skipped: merge.report.skipped,
        hero_values: merge.report.hero_values,
        // Sempre presente, mesmo vazio: é o contador que prova que a
        // checagem rodou. Ausência de campo não é ausência de problema.
        blocos_sem_contrato: blocosSemContrato,
        anchor_collapse: collapsed,
        // Teto de 40 para não estourar o parsed_output num rodapé prolixo;
        // o contador total continua exato.
        // Cada campo ancorou dentro do próprio bloco? "global" só quando
        // o documento não tem marcadores (legado). `escopo_degradado` é o
        // bloco cujo marcador não bateu — sinal de montagem torta.
        escopo: merge.report.escopo,
        escopo_degradado: merge.report.escopo_degradado,
        texto_orfao: merge.report.texto_orfao.slice(0, 40),
        texto_orfao_total: merge.report.texto_orfao.length,
        texto_orfao_suspeito: orfaosSuspeitos.length,
        output_html_len: structural.html.length,
        output_sha8: sha8(structural.html),
        output_html: htmlSnapshot(structural.html),
      },
      costCents: 0,
      durationMs: Date.now() - mergeT0,
    }).catch(() => {})

    fmtCtx.referenceHtml = structural.html
    heroValues = merge.report.hero_values
    heroLogoValues = merge.anchors
      .filter((a) => a.applied && a.inHero && isLogoKey(a.key) && a.value)
      .map((a) => a.value as string)

    // Escopo da hero: blocos com âncora aplicada dentro das sentinelas +
    // o bloco type='hero' (variante composta engole vizinhos). O agente
    // recebe os campos NÃO escritos desses blocos — é a única base legítima
    // para remover uma linha (CTA sem copy) na região.
    const heroBlockIds = new Set(
      merge.anchors
        .filter((a) => a.applied && a.inHero && a.block_id)
        .map((a) => a.block_id as string),
    )
    const isHeroAnchor = (a: MergeAnchor) =>
      a.block_type === "hero" || (a.block_id ? heroBlockIds.has(a.block_id) : false)
    heroPending = merge.anchors
      .filter((a) => isHeroAnchor(a) && !a.applied)
      .map((a) => ({
        key: a.key,
        motivo: a.motivo ?? a.desfecho,
        tem_valor: a.value != null,
      }))
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
      heroPending,
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

    // Frases que o guard derrubou na tentativa anterior. O retry sempre
    // rodou o prompt IDÊNTICO — a reclamação nunca chegava ao modelo, e
    // contra um desacordo determinístico a 2ª chamada só repetia a 1ª
    // (Luxe Lift 23/08: mesma frase, 44,1s e 44,9s). As tentativas são
    // sequenciais, então a variável de fechamento basta; se o processo
    // serverless recomeçar entre elas, degrada para o comportamento antigo
    // (`priorErrors` vem do banco, esta lista não).
    let faltantesAnteriores: string[] = []

    const outcome = await executeFormatStep<string>({
      ids,
      agent: "hero_section",
      config: heroSwitch.config,
      model: visionDecision.model,
      routeT0,
      budgetMs,
      inputHtml: fmtCtx.referenceHtml,
      attempt: async (tentativa) => {
        const r = await invokeHeroChain({
          config,
          vars,
          vision: visionDecision,
          missingCopy: faltantesAnteriores,
          // A região é trocada pelo fragmento NO MESMO lugar: ele tem de
          // voltar com a mesma fronteira. Em modo marker a região é uma
          // <tr>; em modo tag, uma <table>.
          expectShape:
            heroShapeOf(
              fmtCtx.referenceHtml.slice(region.start, region.end),
            ) ?? undefined,
        })
        // Guard D1: a região chegou com a copy do merge APLICADA — o
        // fragmento tem de devolvê-la inteira (re-espaçar passa; sumir com
        // o texto derruba a tentativa e o retry cobra de novo).
        const preserved = heroCopyPreserved(heroValues, r.output, {
          logoValues: heroLogoValues,
          logoSrcs: [
            /src\s*=\s*"([^"]+)"/i.exec(fmtCtx.logoLight)?.[1] ?? "",
            /src\s*=\s*"([^"]+)"/i.exec(fmtCtx.logoDark)?.[1] ?? "",
          ].filter(Boolean),
        })
        // ÚLTIMA tentativa: aceita e grita, em vez de matar o email.
        //
        // O critério contíguo reprovou cinco formas de agente fazendo o
        // certo e derrubou 5 gerações inteiras (US$ 4,00, 70 runs no lixo)
        // sem nunca ter pego uma perda real. Com o critério novo
        // (frasePreservada) isto deve deixar de acontecer — mas se
        // acontecer, "email com uma linha faltando, marcado em vermelho na
        // tela" é melhor que "nenhum email e o dinheiro gasto". A primeira
        // tentativa CONTINUA lançando: o retry cobra do agente.
        if (!preserved.ok && tentativa >= 1) {
          heroCopyAceita = preserved.missing
          log.error("phase2.fmt.hero_copy_lost_aceito", {
            emailId,
            valores: preserved.missing,
            hint: "fragmento aceito na última tentativa — a issue vai para a aba QA do email",
          })
        }
        if (!preserved.ok && tentativa < 1) {
          faltantesAnteriores = preserved.missing
          // O output CRU e o consumo vão grudados no erro: a chamada foi
          // PAGA e este é o run que mais precisa ser depurado. Sem isso o
          // painel mostra 0 token, $0 e as abas "Prompt"/"Saída" vazias —
          // foi assim que o falso positivo de markup na frase (21/08)
          // sobreviveu a quatro tentativas sem deixar rastro nenhum.
          // O que SOBREVIVEU entra na mensagem junto do que faltou: sem
          // isso, "hero_copy_lost: InnovaBay" não distingue um agente que
          // apagou a marca de um que a trocou pelo logo (28/08).
          const salvos =
            preserved.viaAtributo.length + preserved.viaLogo.length
          const err = new Error(
            `guard: hero_copy_lost: ${preserved.missing
              .map((m) => m.slice(0, 60))
              .join(" | ")}${salvos > 0 ? ` (${salvos} salvo(s) por alt/logo)` : ""}`,
          ) as Error & { raw?: string }
          err.raw = r.rawOutput
          throw attachUsage(err, {
            tokensInput: r.tokensInput,
            tokensOutput: r.tokensOutput,
            costUsd: r.costUsd,
            renderedPrompt: r.renderedPrompt,
          })
        }
        if (preserved.viaAtributo.length > 0) {
          log.warn("phase2.fmt.hero_copy_via_alt", {
            emailId,
            valores: preserved.viaAtributo,
          })
        }
        // Wordmark que virou o `<img>` do logo — comportamento MANDADO pelo
        // prompt. Registrado para se saber com que frequência acontece: é o
        // número que diz se o guard segue calibrado ou virou ruído.
        if (preserved.viaLogo.length > 0) {
          log.warn("phase2.fmt.hero_copy_via_logo", {
            emailId,
            valores: preserved.viaLogo,
          })
        }
        const next = spliceHero(fmtCtx.referenceHtml, region, r.output)
        return {
          value: next,
          tokensInput: r.tokensInput,
          tokensOutput: r.tokensOutput,
          costUsd: r.costUsd,
          renderedPrompt: r.renderedPrompt,
          promptSegments: r.promptSegments,
          inputSummary: [
            {
              rotulo: "Região da hero",
              cls: "upstream",
              valor: `${region.mode} · ${regionIsCanonical ? "variante enxertada pelo código" : "HTML do Montador"}`,
            },
            {
              rotulo: "Variante",
              cls: "biblioteca",
              // A variante carregada aqui não traz `name` (HeroVariantData é o
              // recorte mínimo); o id é o que cruza com a escolha do Montador.
              valor: variant
                ? `${variant.id} (${variantSource ?? "origem desconhecida"})`
                : "(nenhuma resolvida)",
            },
            {
              rotulo: "Copy da hero",
              cls: "upstream",
              valor: `${heroPending.length} campo(s) pendente(s) do copy_merge`,
            },
            {
              rotulo: "Imagem da hero",
              cls: "upstream",
              valor: fmtCtx.imageMap.find((e) => e.block_type === "hero")?.url
                ? "gerada e disponível"
                : "(sem imagem)",
            },
            {
              rotulo: "Exemplo renderizado",
              cls: "biblioteca",
              valor: visionDecision.used
                ? `anexado como imagem (${visionDecision.model})`
                : (heroRendered?.reason ?? "não usado"),
            },
          ] as InputSummaryItem[],
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
            // Copy que sobreviveu SÓ no alt/title — o wordmark trocado
            // pelo logo é o caso normal. Medir a frequência é o que
            // impede a permissão de virar silêncio.
            ...(preserved.viaAtributo.length > 0
              ? { hero_copy_via_alt: preserved.viaAtributo }
              : {}),
            // Wordmark que virou o `<img>` do logo REAL da loja. Mesma
            // razão do de cima: o guard deixou passar por VERIFICAR que o
            // logo entrou, e esse número tem de ser consultável.
            ...(preserved.viaLogo.length > 0
              ? { hero_copy_via_logo: preserved.viaLogo }
              : {}),
            ...(heroCopyAceita.length > 0
              ? { hero_copy_perdida: heroCopyAceita }
              : {}),
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
  // Views por bloco do QA (F5) — extraídas ANTES do strip dos marcadores
  // cfy:block. Vazio no resume pós-strip (o QA cai no fallback por content).
  let qaViews: QaBlockView[] = []
  // text_format desativado na aba Agentes: o que o merge não resolveu
  // fica como está (o strip final limpa o que sobrou) — nenhum LLM toca o
  // texto.
  if (stage === "hero" && textSwitch.disabled) {
    await logStepDisabled("text_format", currentHtml)
    await persistStage(currentHtml, "text")
    stage = "text"
  }
  // Merge por example é o caminho ÚNICO de texto quando o blueprint tem
  // campos (decisão 20/08: sem LLM de recurso — sem_lugar/ambíguo são
  // telemetria, não fila; a fila do agente de exceção morreu junto com o
  // verificador de merge). O LLM full-doc abaixo sobrevive SÓ para o
  // documento legado sem schema (textFieldsTotal === 0), onde a copy não
  // teria como entrar de outro jeito.
  if (stage === "hero" && textFieldsTotal > 0) {
    await logGenerationRun({
      ...ids,
      agent: "text_format",
      status: "skipped",
      model: "deterministic",
      parsedOutput: {
        skip_reason: "merge_por_exemplo",
        output_html_len: currentHtml.length,
        output_sha8: sha8(currentHtml),
      },
      costCents: 0,
      durationMs: 0,
    }).catch(() => {})
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
          promptSegments: r.promptSegments,
          inputSummary: [
            {
              rotulo: "Documento de entrada",
              cls: "upstream",
              valor: `${inputHtml.length.toLocaleString("pt-BR")} chars — saída do step da hero (sha8 ${sha8(inputHtml)})`,
            },
            {
              rotulo: "Copy a colocar",
              cls: "upstream",
              valor: `${(fmtCtx.blocksWithContent ?? []).filter((b) => b.type !== "hero").length} bloco(s) não-hero, do callback do n8n`,
            },
            {
              rotulo: "Contrato de campos",
              cls: "biblioteca",
              valor: "schema das variantes casadas (fields do blueprint)",
            },
          ] as InputSummaryItem[],
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
    // ── Imagem DETERMINÍSTICA (F3): o slot se autodenuncia no HTML
    // (src="URL_DA_IMAGEM_1") e o casamento campo↔token é mecânico — o LLM
    // do image_format morreu. Mesmo agent key, model 'deterministic' (o
    // grafo do Estúdio e a máquina de estágios ficam intactos).
    const inputHtml = currentHtml
    const imgT0 = Date.now()
    let overlayTextFixed = 0
    let overlaySlotsLight = 0
    try {
      const im = imageMerge({
        html: inputHtml,
        blocks: mergeBlocks,
        imageMap: (fmtCtx.imageMap ?? []).map((e) => ({
          block_type: e.block_type,
          url: e.url,
          tag: e.tag ?? null,
          field_key: e.field_key ?? null,
          // `position` sai do id, e só a entrada ÂNCORA de cada bloco
          // conserva a forma `IMG_{position}` — os demais slots levam
          // sufixo. Os outros casam por `field_key`, que é endereço
          // melhor; este regex fica para o caminho legado.
          position:
            e.block_position ??
            (Number(/^IMG_(\d+)$/.exec(e.id ?? "")?.[1]) || null),
        })),
      })

      // ── Overlay claro: adapta o TEXTO à foto que saiu ──────────────
      // Branco sobre foto é o certo — o problema é a foto ter vindo
      // clara. Aritmética de cor não alcança bitmap, então quem decide é
      // a luminância medida na geração
      // (`content.images[key].overlay_luminance`). O alvo é a URL, não a
      // região do bloco: `review 7` tem TRÊS bandas com overlay e cada
      // uma tem a sua medição — escurecer o bloco inteiro criaria o
      // defeito oposto na banda escura.
      let mergedHtml = im.html
      for (const blk of fmtCtx.blocks ?? []) {
        const imgs = (blk.content as { images?: unknown } | null)?.images
        if (!imgs || typeof imgs !== "object") continue
        for (const val of Object.values(
          imgs as Record<string, { url?: unknown; overlay_luminance?: unknown }>,
        )) {
          const lum =
            typeof val?.overlay_luminance === "number"
              ? val.overlay_luminance
              : null
          if (!overlayIsLight(lum)) continue
          overlaySlotsLight++
          // URL ausente do documento é no-op: slot declarado dentro de
          // `style` não é preenchido pelo merge (o slot-finder só varre
          // src/alt/href), e corrigir às cegas seria pior.
          const url = typeof val?.url === "string" ? val.url : ""
          const fix = fixHeroOverlayText(mergedHtml, url, fmtCtx.roles.text)
          mergedHtml = fix.html
          overlayTextFixed += fix.fixed
        }
      }
      if (overlaySlotsLight > 0) {
        log.info("phase2.fmt.overlay_text_fixed", {
          emailId,
          slots_light: overlaySlotsLight,
          fixed: overlayTextFixed,
        })
      }

      await logGenerationRun({
        ...ids,
        agent: "image_format",
        status: "success",
        model: "deterministic",
        inputVars: {
          stage: "image",
          input_html_len: inputHtml.length,
          input_sha8: sha8(inputHtml),
        },
        inputSummary: [
          {
            rotulo: "Documento de entrada",
            cls: "upstream",
            valor: `${inputHtml.length.toLocaleString("pt-BR")} chars (sha8 ${sha8(inputHtml)})`,
          },
          {
            rotulo: "Imagens a colocar",
            cls: "upstream",
            valor: `${im.report.slots_total} slot(s) — URLs do agente de imagem`,
          },
          {
            rotulo: "Tokens de destino",
            cls: "biblioteca",
            valor: "atributos src do HTML da variante (URL_DA_IMAGEM_N)",
          },
        ] as InputSummaryItem[],
        parsedOutput: {
          slots_total: im.report.slots_total,
          merged: im.report.merged,
          campos: im.report.campos,
          alts_limpos: im.report.alts_limpos,
          rows_removidas: im.report.rows_removidas,
          overlay_slots_light: overlaySlotsLight,
          overlay_text_fixed: overlayTextFixed,
          output_html_len: mergedHtml.length,
          output_sha8: sha8(mergedHtml),
          output_html: htmlSnapshot(mergedHtml),
        },
        costCents: 0,
        durationMs: Date.now() - imgT0,
      }).catch(() => {})
      currentHtml = mergedHtml
    } catch (err) {
      // Determinístico não tem retry que ajude — erro aqui é bug nosso.
      const msg = err instanceof Error ? err.message : String(err)
      await logGenerationRun({
        ...ids,
        agent: "image_format",
        status: "error",
        model: "deterministic",
        errorMessage: msg.slice(0, 500),
        costCents: 0,
        durationMs: Date.now() - imgT0,
      }).catch(() => {})
      await failStep("image_format", msg)
      return { status: "failed" }
    }

    // Views do QA (F5): extraídas AQUI, com os marcadores ainda no doc —
    // depois do strip eles somem e a view por bloco fica irrecuperável.
    qaViews = buildQaBlockViews(
      currentHtml,
      (fmtCtx.blocks ?? []).map((b) => ({
        id: b.id,
        position: b.position,
        block_type: b.block_type,
      })),
    )

    // Limpeza final do documento (era o fim do postProcessHtml do agente
    // monolítico): sentinelas + marcadores cfy:block fora, indentação
    // &nbsp; do GLM removida, placeholders {{}} órfãos e tokens de
    // atributo crus limpos, lang da loja. O color_format recebe o
    // documento já apresentável.
    // `stripCfyBlockMarkers` NÃO entra aqui: os marcadores seguem no
    // documento até a fronteira de saída (persistStage). O STEP 4 abaixo é
    // seguro com eles — o agente de cores não recebe o documento, recebe
    // `color_inventory_json` e devolve ops aplicadas por código.
    currentHtml = enforceLangAttribute(
      stripUnresolvedAttrTokens(
        stripUnresolvedPlaceholders(
          stripNbspIndentation(
            stripSlotAttributes(
              stripAgentProtocolBlocks(stripSentinels(currentHtml)),
            ),
          ),
        ),
      ),
      fmtCtx.locale,
    )
    // Snapshot pré-polimento (compare de 3 vias na UI) — semântica da
    // coluna preservada: "HTML antes do último retoque visual". Limpo, como
    // toda coluna que a UI mostra.
    await persistStage(currentHtml, "image", {
      html_pre_refiner: stripCfyBlockMarkers(currentHtml),
    })
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
    // Var exigida pelo schema que o builder não montou. Em produção isso só
    // virava log.warn — e foi assim que `color_surface`/`color_surface_strong`
    // ficaram fora do prompt sem ninguém ver, deixando o agente sem destino
    // legal para painel e o email metade na cor do template. Aqui vira
    // telemetria do run, ao lado do brand_share que denuncia o efeito.
    const contractDrift = takeContractDrift("color_format")

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
        const applied = applyOps(inputHtml, r.ops, {
          allowHero: true,
          // Para onde reerguer um painel que o agente colapsou no próprio
          // fundo. Sem os tons a guarda não roda — e o painel some, que é o
          // comportamento de antes.
          // `?? ""` porque um contexto sem os papéis novos (chamada antiga,
          // ctx parcial) não pode derrubar o passo de cor INTEIRO: applyOps
          // trata tom inválido como guarda desligada.
          surfaces: {
            surface: fmtCtx.roles?.surface ?? "",
            surface_strong: fmtCtx.roles?.surface_strong ?? "",
          },
        })
        // GUARD DE PALETA (02/09): cor saturada fora da paleta que o
        // agente deixou passar é recolorida por CÓDIGO, pelo mesmo
        // aplicador (guarda de contraste incluída). O `#D00000` do exemplo
        // da variante body-4 foi ao cliente porque este ramo não existia.
        const foraDaPaleta = fmtCtx.roles
          ? coresForaDaPaleta(applied.html, fmtCtx.roles)
          : []
        let htmlFinal = applied.html
        let corrigidasFora = 0
        if (foraDaPaleta.length > 0) {
          const guarda = applyOps(
            applied.html,
            foraDaPaleta.map((c) => ({
              action: "recolor" as const,
              from: c.valor,
              to: c.para,
              where: c.contexto,
            })),
            {
              allowHero: true,
              surfaces: {
                surface: fmtCtx.roles?.surface ?? "",
                surface_strong: fmtCtx.roles?.surface_strong ?? "",
              },
            },
          )
          htmlFinal = guarda.html
          corrigidasFora = guarda.recoloredOccurrences
          log.warn("color_format.fora_da_paleta", {
            emailId,
            cores: foraDaPaleta.map((c) => `${c.valor}(${c.contexto}×${c.ocorrencias})→${c.para}`),
            ocorrencias_corrigidas: corrigidasFora,
          })
        }
        const restantesFora = fmtCtx.roles ? coresForaDaPaleta(htmlFinal, fmtCtx.roles) : []
        // Guard: ops replace não podem quebrar a estrutura (um find/replace
        // que engole um </table> corrompe o documento).
        const count = (s: string) => (s.match(/<table[\s>]/gi) ?? []).length
        if (count(htmlFinal) !== count(inputHtml)) {
          throw new Error("guard: table_count_changed_by_ops")
        }
        return {
          value: {
            html: htmlFinal,
            applied: applied.applied,
            skipped: applied.skipped.length,
          },
          tokensInput: r.tokensInput,
          tokensOutput: r.tokensOutput,
          costUsd: r.costUsd,
          renderedPrompt: r.renderedPrompt,
          promptSegments: r.promptSegments,
          inputSummary: [
            {
              rotulo: "Documento de entrada",
              cls: "upstream",
              valor: `${inputHtml.length.toLocaleString("pt-BR")} chars (sha8 ${sha8(inputHtml)})`,
            },
            {
              rotulo: "Inventário de cores",
              cls: "sistema",
              valor: `${colorOccurrenceCount(inputHtml)} ocorrência(s) extraídas do documento por código`,
            },
            {
              rotulo: "Paleta da marca",
              cls: "loja",
              valor: "cores aprovadas em store_brand_identity + papéis derivados",
            },
          ] as InputSummaryItem[],
          rawOutput: r.rawOutput,
          parsed: {
            ops_applied: applied.applied,
            ...(contractDrift.length > 0
              ? { contract_drift: contractDrift }
              : {}),
            // OPS não medem conformidade: 11 ops que trocam 1 ocorrência
            // cada contavam igual a 11 que trocariam 30, e foi assim que a
            // Luxe Lift saiu com "11 aplicadas" e o email fora da marca.
            // `brand_share` é a fração do inventário que a marca cobre —
            // a métrica que denuncia a regressão sem abrir o HTML.
            recolor_summary: {
              occurrences_recolored: applied.recoloredOccurrences,
              occurrences_total: colorOccurrenceCount(inputHtml),
              brand_share: (() => {
                const total = colorOccurrenceCount(inputHtml)
                return total > 0
                  ? Number((applied.recoloredOccurrences / total).toFixed(3))
                  : 0
              })(),
              scoped_ops: r.ops.filter(
                (o) => o.action === "recolor" && o.where != null,
              ).length,
              // Legibilidade: quantos textos o código reescreveu para
              // sobreviver ao fundo que o agente pintou, e quantos pares
              // continuam abaixo do mínimo AA (fundo em foto, ou contraste
              // que já estava quebrado antes deste step).
              contrast_fixed: applied.pairedTextFixes,
              contrast_remaining: applied.contrastRemaining,
              // Painéis que colapsaram no próprio fundo e o código
              // reergueu. `0` com painel sumido é o estado que estamos
              // consertando — por isso a contagem é explícita.
              panel_fixes: applied.panelFixes,
              // Cores saturadas fora da paleta que o agente deixou e o
              // código recoloriu — a medida do que ele está deixando passar.
              fora_da_paleta_corrigidas: foraDaPaleta,
              fora_da_paleta_ocorrencias: corrigidasFora,
              fora_da_paleta_restantes: restantesFora.map((c) => c.valor),
            },
            ops_skipped: applied.skipped.map((s) => ({
              action: s.op.action,
              target:
                s.op.action === "replace" ? s.op.find.slice(0, 60) : s.op.from,
              ...(s.op.action === "recolor" && s.op.where
                ? { where: s.op.where }
                : {}),
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

  // ── STEP 5 — FUNDO NO TAMANHO DECLARADO (código; FAIL-OPEN) ────────
  // O fundo de um elemento tem de ter o tamanho que ele declara. A
  // `welcome - hero section 5` põe `background-size:598px 1217px` num td
  // cujo arquivo, por cadastro, é faixa chapada (585px, cor primária) +
  // foto de 632px na base — o pipeline gerava a foto certa e o email
  // client a esticava para o bloco inteiro: o texto caía em cima da
  // pessoa (Innova Bay, batch 5b778483). Roda DEPOIS do step de cor para
  // pintar a faixa com a cor que o td JÁ tem — texto e faixa contrastam
  // por construção — e mesmo quando o step de cor foi pulado.
  {
    const bgT0 = Date.now()
    const inputHtml = currentHtml
    try {
      const fit = await fitBackgrounds(
        {
          html: inputHtml,
          blocks: fmtCtx.blocks ?? [],
          storeId,
          fallbackColor: fmtCtx.roles?.surface_strong ?? null,
        },
        {
          ...defaultBackgroundFitDeps,
          // Grava a composição ao lado da URL original — a foto gerada
          // continua rastreável e um resume enxerga a composta como
          // "deste email".
          persistComposed: async (blockId, key, composed) => {
            const { data: row } = await admin
              .from("email_blocks")
              .select("content")
              .eq("id", blockId)
              .maybeSingle()
            const content = ((row?.content as Record<string, unknown> | null) ?? {}) as Record<string, unknown>
            const images = ((content.images as Record<string, Record<string, unknown>> | undefined) ?? {})
            images[key] = {
              ...(images[key] ?? {}),
              composed: {
                url: composed.para,
                width: composed.width,
                height: composed.height,
                band_color: composed.band_color,
                band_height: composed.band_height,
                side: composed.side,
              },
            }
            await admin
              .from("email_blocks")
              .update({ content: { ...content, images } })
              .eq("id", blockId)
          },
        },
      )
      if (fit.report.boxes.length > 0) {
        currentHtml = fit.html
        if (fit.report.compostos.length > 0) {
          await persistStage(currentHtml, null)
          log.info("phase2.fmt.background_fit", {
            emailId,
            compostos: fit.report.compostos.map(
              (c) => `${c.key}: ${c.width}×${c.height} faixa ${c.band_color} ${c.band_height}px (${c.side}) ×${c.replaced}`,
            ),
          })
        }
        await logGenerationRun({
          ...ids,
          agent: "background_fit",
          status: fit.report.falhas.length > 0 && fit.report.compostos.length === 0 ? "error" : "success",
          model: "deterministic",
          inputVars: {
            input_html_len: inputHtml.length,
            input_sha8: sha8(inputHtml),
            boxes: fit.report.boxes,
          },
          inputSummary: [
            {
              rotulo: "Documento de entrada",
              cls: "upstream",
              valor: `${inputHtml.length.toLocaleString("pt-BR")} chars — saída do step de cores (sha8 ${sha8(inputHtml)})`,
            },
            {
              rotulo: "Boxes de fundo",
              cls: "sistema",
              valor: `${fit.report.boxes.length} elemento(s) com background e tamanho declarado (background-size / v:rect)`,
            },
            {
              rotulo: "Cor da faixa",
              cls: "sistema",
              valor: "background-color do próprio elemento (decidida pelo Cores & Botões); fallback surface_strong",
            },
          ] as InputSummaryItem[],
          parsedOutput: {
            boxes: fit.report.boxes.length,
            compostos: fit.report.compostos,
            sem_ajuste: fit.report.sem_ajuste,
            falhas: fit.report.falhas,
            output_html_len: currentHtml.length,
            output_sha8: sha8(currentHtml),
            output_html: htmlSnapshot(currentHtml),
          },
          errorMessage:
            fit.report.falhas.length > 0
              ? fit.report.falhas.map((f) => `${f.key ?? "?"}: ${f.erro}`).join(" | ").slice(0, 500)
              : undefined,
          costCents: 0,
          durationMs: Date.now() - bgT0,
        }).catch(() => {})
      }
    } catch (err) {
      // FAIL-OPEN: o documento do step anterior segue.
      log.warn("phase2.fmt.background_fit_fail_open", {
        emailId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { status: "ok", html: currentHtml, qaViews, heroCopyAceita }
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
  // O QA e os checks determinísticos julgam o EMAIL, não o andaime: o
  // documento chega da cadeia com os marcadores de bloco (a fronteira de
  // saída é o persistStage), e aqui eles saem. As views por bloco vêm
  // separadas, extraídas do documento marcado.
  const finalHtml = stripCfyBlockMarkers(fmtResult.html)

  // Copy da hero aceita apesar do guard (última tentativa). Vai para a aba
  // QA do email, que é onde o operador olha — e o email EXISTE para ele
  // olhar, que é a diferença em relação ao comportamento antigo.
  const heroCopyIssues: QaIssue[] = fmtResult.heroCopyAceita.map((valor) => ({
    type: "hero_copy_perdida" as const,
    severity: "high" as const,
    message: `A copy "${valor.slice(0, 80)}" não foi encontrada no bloco da hero depois da formatação. Confira a hero antes de aprovar.`,
    location: "hero",
  }))

  // ── QA REMOVIDO do fluxo (EMAIL_QA_ENABLED != 'true') ────────────────
  // Bypass do agente LLM: HTML pronto -> status `ready` direto, sem custo,
  // sem qa_failed. As checagens DETERMINISTICAS (computeRenderChecks — sem
  // LLM) continuam rodando: NAO bloqueiam, so persistem issues informativos
  // em qa_issues pra dar visibilidade de formatacao ao designer.
  // Claim atomico `rendering -> ready` mantem idempotencia.
  if (!isQaEnabled()) {
    // Contrato do bloco: copy estourando `max_len` e campo obrigatório
    // vazio. O check já existia, mas SÓ dentro do agente de QA — com o QA
    // desligado (que é o caso desta loja) ninguém era avisado. Na Luxe
    // Lift de 23/08 SEIS campos estouraram o limite (231/200, 218/200,
    // 193/156, 175/130, 170/130, 101/90), todos medidos e registrados no
    // run `copy`, e o e-mail saiu com o botão final quebrado em duas
    // linhas sem um aviso em lugar nenhum.
    //
    // A fonte é o `fields` do PRÓPRIO bloco (migration 20261065, "o bloco
    // é o schema"), não o blueprint pareado por índice.
    const { data: checkBlocks } = await admin
      .from("email_blocks")
      .select("block_type, content, fields")
      .eq("email_id", emailId)
      .order("position", { ascending: true })
    const contratoBlocks = (checkBlocks ?? []).map(
      (b: Record<string, unknown>) => ({
        block_type: (b.block_type as string) ?? "unknown",
        content: (b.content as Record<string, unknown>) ?? {},
      }),
    )
    const schemaIssues = runSchemaChecks(
      contratoBlocks,
      (checkBlocks ?? []).map((b: Record<string, unknown>) => ({
        type: (b.block_type as string) ?? "unknown",
        fields: (b.fields ?? null) as SchemaCheckBlueprintBlock["fields"],
      })),
    )
    const renderIssues = [
      ...heroCopyIssues,
      ...computeRenderChecks(finalHtml),
      ...schemaIssues,
    ]
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
        qa_issues: [...heroCopyIssues, ...qaResult.issues],
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
      qa_issues: [...heroCopyIssues, ...qaResult.issues],
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


