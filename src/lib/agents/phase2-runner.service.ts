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
import {
  DEFAULT_HTML_SYSTEM_PROMPT,
  DEFAULT_HTML_USER_TEMPLATE,
  invokeHtmlChain,
} from "./chains/html.chain"
import { buildHtmlPromptVars } from "./html/build-vars"
import { computeRenderChecks } from "./html/render-checks"
import { runQaAgent } from "./chains/qa.chain"
import { invokeRefinerChain, refinedHtmlGuard } from "./chains/refiner.chain"
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

  const [
    brandRes,
    briefingRes,
    htmlConfigRes,
    settingsRes,
    imageConfigRes,
    storeOverridesRes,
    refinerConfigRes,
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
          .select(
            "generate_images, qa_vision_enabled, refiner_enabled, cost_alert_usd",
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
    // Refinador Tipográfico (voz da marca na fonte de display). Sem row
    // ativa → passo inteiro pulado no runner (rollout/kill switch por DB).
    admin
      .from("email_agent_configs")
      .select("*")
      .eq("agent_type", "refiner")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const settingsRow = settingsRes.data as {
    generate_images?: boolean | null
    qa_vision_enabled?: boolean | null
    refiner_enabled?: boolean | null
    cost_alert_usd?: number | null
  } | null
  const generateImages = settingsRow?.generate_images ?? true
  // NULL = respeita env (decisão fica no qa.chain); true/false = override da UI.
  const qaVisionEnabled = settingsRow?.qa_vision_enabled ?? null
  const refinerEnabled = settingsRow?.refiner_enabled ?? true
  const costAlertUsd = settingsRow?.cost_alert_usd ?? null

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
    htmlConfig: (htmlConfigRes.data as EmailAgentConfig | null) ?? null,
    topProducts,
    generateImages,
    qaVisionEnabled,
    refinerEnabled,
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
    refinerConfig: (refinerConfigRes.data as EmailAgentConfig | null) ?? null,
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
   * Quando true (TestTab), buildHtmlPromptVars usa precheck relaxado:
   * só falha se brand=null. Cores/logo faltando degradam pra defaults.
   */
  relaxedBrandCheck?: boolean
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
            model: "openai/gpt-5.4-image-2",
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
            model: "openai/gpt-5.4-image-2",
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
          model: "openai/gpt-5.4-image-2",
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
          model: "openai/gpt-5.4-image-2",
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
          model: "openai/gpt-5.4-image-2",
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
// Orçamento restante mínimo pra rodar o Refinador. Ele virou REPINTOR
// (gera o HTML completo, timeout próprio de 180s). O guard garante que o
// Refinador só COMEÇA se ainda couber no maxDuration da rota:
// 800s (Fluid Compute) - 180s(timeout do Refinador) - 60s(QA) - ~20s(buffer)
// = 540s. Com o HTML agent em reasoning model (z-ai/glm-5.2, timeout 540s),
// o guard antigo de 100s pulava o refino SEMPRE (skipped_budget) — ativar o
// Refinador era no-op. HTML mais lento que 540s → pula o refino (fail-open),
// mas a rota SEMPRE termina sem ser morta pela Vercel (o loop
// HTML↔Refinador de jul/2026 não volta).
const REFINER_BUDGET_GUARD_MS = 540_000

/**
 * Serializa a paleta da identidade visual (colors_primary + colors_secondary)
 * em linhas "Papel: #HEX (Nome)" para a var `brand_colors` do Refinador.
 * Sem identidade/paleta → "" (o prompt trata vazio como "não mexa em cores").
 */
function serializeBrandColors(
  brand: { colors_primary?: unknown; colors_secondary?: unknown } | null,
): string {
  if (!brand) return ""
  const rows: string[] = []
  for (const group of [brand.colors_primary, brand.colors_secondary]) {
    if (!Array.isArray(group)) continue
    for (const c of group as Array<{ hex?: string; name?: string; role?: string }>) {
      const hex = (c?.hex ?? "").trim()
      if (!hex) continue
      const role = (c?.role ?? "").trim() || "Cor"
      const name = (c?.name ?? "").trim()
      rows.push(`${role}: ${hex}${name ? ` (${name})` : ""}`)
    }
  }
  return rows.join("\n")
}

/**
 * Step 2.5 — Refinador Tipográfico (fail-open).
 *
 * Retorna o HTML refinado quando tudo passa; em QUALQUER falha (sem config,
 * sem orçamento, chain lançou, guard reprovou) retorna o HTML original.
 * Nunca lança, nunca marca o email como failed. Telemetria completa em
 * email_generation_runs (agent='refiner') com input_vars/rendered_prompt/
 * raw_output/parsed_output para o painel de logs de geração.
 */
async function runRefinerStep(input: {
  ctx: Awaited<ReturnType<typeof loadMinimalContext>>
  finalHtml: string
  storeId: string
  flowId: string
  emailId: string
  triggeredBy?: string
  batchId: string
  routeT0: number
}): Promise<string> {
  const { ctx, finalHtml, storeId, flowId, emailId, triggeredBy, batchId, routeT0 } = input

  // Kill-switch via settings (aba Configurações → Refino tipográfico).
  if (ctx.refinerEnabled === false) {
    log.info("phase2.refiner.disabled_by_settings", { emailId })
    return finalHtml
  }

  // Sem row ativa → no-op absoluto (nem run é criado). Kill switch por DB.
  const config = ctx.refinerConfig
  if (!config) return finalHtml

  if (Date.now() - routeT0 > REFINER_BUDGET_GUARD_MS) {
    log.warn("phase2.refiner.skipped_budget", {
      emailId,
      elapsedMs: Date.now() - routeT0,
    })
    return finalHtml
  }

  const admin = createAdminClient()
  const refT0 = Date.now()
  let refRunId = ""
  try {
    const storeRaw = ctx.storeRaw as Record<string, unknown>
    const vars: Record<string, string> = {
      brand_name: (storeRaw.store_name as string) || "Loja",
      niche: (storeRaw.niche as string) || "",
      locale: (storeRaw.language as string) || "pt-BR",
      // Tons canônicos derivados do tom de voz da loja (component-dimensions)
      // — sinal adicional pra estratégia tipográfica (Premium→serifada...).
      tones: deriveToneKeys(
        ((storeRaw.tone_description as string) ??
          (storeRaw.tom_de_voz as string)) ||
          null,
      ).join(", "),
      pesquisa_full_text: pesquisaToFullText(storeRaw as PesquisaFields),
      current_font_heading: ctx.brand?.font_heading || "",
      current_font_body: ctx.brand?.font_body || "",
      // Paleta da identidade visual (camada 4 do Refinador: conformidade de
      // fonte/cor). Formato legível "Papel: #HEX (Nome)". Vazio quando a
      // loja não tem identidade → o prompt manda não mexer em cores.
      brand_colors: serializeBrandColors(ctx.brand),
      email_name: "",
      subject: "",
      // O Refinador-repintor edita o HTML diretamente (só as 3 camadas visuais).
      html: finalHtml,
    }
    // Nome/subject do email dão contexto ao agente (best-effort).
    const { data: emailRow } = await admin
      .from("email_flow_emails")
      .select("name, subject")
      .eq("id", emailId)
      .maybeSingle<{ name: string | null; subject: string | null }>()
    vars.email_name = emailRow?.name ?? ""
    vars.subject = emailRow?.subject ?? ""

    const model = config.model || "anthropic/claude-sonnet-4.6"
    refRunId = await startGenerationRun({
      storeId,
      flowId,
      emailId,
      triggeredBy,
      batchId,
      agent: "refiner",
      agentConfigId: config.id,
      model,
      inputVars: { html_len: finalHtml.length },
    })

    const { html: refined, tokensInput, tokensOutput, costUsd, renderedPrompt, rawOutput } =
      await invokeRefinerChain({
        config: {
          model,
          temperature: config.temperature ?? 0.4,
          // HTML completo de saída → teto alto (evita truncar antes do </html>).
          max_tokens: config.max_tokens ?? 32000,
          system_prompt: config.system_prompt ?? "",
          user_template: config.user_template ?? "",
        },
        vars,
      })

    const finishBase = {
      storeId,
      flowId,
      emailId,
      triggeredBy,
      batchId,
      agent: "refiner" as const,
      agentConfigId: config.id,
      model,
      renderedPrompt,
      rawOutput,
      tokensInput,
      tokensOutput,
      costCents: resolveCostCents({ model, tokensInput, tokensOutput, costUsd }),
      durationMs: Date.now() - refT0,
    }

    // Guard estrutural: o HTML refinado precisa ser um documento válido E
    // preservar a estrutura (mesmo nº de <table>, sem encolher). Falhou →
    // fail-open: mantém o HTML original (o email nunca fica pior que a entrada).
    const guard = refinedHtmlGuard(finalHtml, refined)
    if (!guard.ok) {
      await finishGenerationRun(refRunId, {
        ...finishBase,
        status: "error",
        errorMessage: `guard: ${guard.reason}`,
        parsedOutput: {
          applied: false,
          guard_reason: guard.reason,
          refined_len: refined.length,
          original_len: finalHtml.length,
        },
      })
      log.warn("phase2.refiner.fail_open", { emailId, reason: guard.reason })
      return finalHtml
    }

    // Refinamento "no-op" (o LLM devolveu o HTML idêntico = decidiu não mexer):
    // sucesso sem re-gravar (nada mudou).
    if (refined.trim() === finalHtml.trim()) {
      await finishGenerationRun(refRunId, {
        ...finishBase,
        status: "success",
        parsedOutput: { applied: false, unchanged: true },
      })
      log.info("phase2.refiner.unchanged", { emailId })
      return finalHtml
    }

    await admin
      .from("email_flow_emails")
      .update({ html: refined, updated_at: new Date().toISOString() })
      .eq("id", emailId)

    await finishGenerationRun(refRunId, {
      ...finishBase,
      status: "success",
      parsedOutput: {
        applied: true,
        refined_len: refined.length,
        original_len: finalHtml.length,
      },
    })
    log.info("phase2.refiner.applied", {
      emailId,
      refinedLen: refined.length,
      originalLen: finalHtml.length,
      durationMs: Date.now() - refT0,
    })
    return refined
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro no Refinador"
    log.warn("phase2.refiner.fail_open", { emailId, reason: "exception", error: msg })
    await finishGenerationRun(refRunId, {
      storeId,
      flowId,
      emailId,
      triggeredBy,
      batchId,
      agent: "refiner",
      agentConfigId: config.id,
      status: "error",
      errorMessage: msg,
      durationMs: Date.now() - refT0,
    }).catch(() => {})
    return finalHtml
  }
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

  // ── Step 2: HTML generation (Master Prompt v2) ──────────────────────
  const htmlT0 = Date.now()
  let finalHtml = ""
  // Run 'running' aberto antes do invokeHtmlChain (live view).
  let htmlRunId = ""
  try {
    const htmlConfig = ctx.htmlConfig
    const model = htmlConfig?.model ?? "claude-opus-4-7"
    const temperature = htmlConfig?.temperature ?? 0.3
    const maxTokens = htmlConfig?.max_tokens ?? 16384
    const systemPrompt = htmlConfig?.system_prompt ?? DEFAULT_HTML_SYSTEM_PROMPT
    const userTemplate = htmlConfig?.user_template ?? DEFAULT_HTML_USER_TEMPLATE

    const inputVars = await buildHtmlPromptVars({
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

    htmlRunId = await startGenerationRun({
      storeId,
      flowId,
      emailId,
      triggeredBy,
      batchId,
      agent: "html",
      agentConfigId: htmlConfig?.id,
      model,
    })

    const {
      html: rawHtml,
      tokensInput,
      tokensOutput,
      costUsd,
      renderedPrompt,
    } = await invokeHtmlChain({
      config: {
        model,
        temperature,
        max_tokens: maxTokens,
        system_prompt: systemPrompt,
        user_template: userTemplate,
      },
      vars: inputVars,
    })

    await admin
      .from("email_flow_emails")
      // html_pre_refiner = snapshot do HTML agent ANTES do Refinador (que
      // sobrescreve .html adiante) — alimenta o compare de 3 vias.
      .update({
        html: rawHtml,
        html_pre_refiner: rawHtml,
        updated_at: new Date().toISOString(),
      })
      .eq("id", emailId)

    await finishGenerationRun(htmlRunId, {
      storeId,
      flowId,
      emailId,
      triggeredBy,
      batchId,
      agent: "html",
      agentConfigId: htmlConfig?.id,
      status: "success",
      model,
      // Telemetria: input completo do modelo. Sem renderedPrompt antes, nao
      // era possivel auditar o que o agente HTML recebeu (ex.: reference do
      // Montador chegou inteiro? blocks com content real?). agente de imagem
      // ja grava (phase2-runner:712); HTML faltava paridade.
      renderedPrompt,
      // HTML completo na telemetria — antes o caminho de producao nem gravava
      // raw_output, deixando o "OUTPUT BRUTO" vazio. Limitado pelo max_tokens.
      rawOutput: rawHtml,
      tokensInput,
      tokensOutput,
      costCents: resolveCostCents({ model, tokensInput, tokensOutput, costUsd }),
      durationMs: Date.now() - htmlT0,
    })
    finalHtml = rawHtml
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro no HTML"
    // BrandIncompleteError vira `failure_reason='brand_incomplete'` — UI
    // mostra CTA "Completar brand identity" em vez de "Tentar de novo".
    const isBrandIncomplete =
      err instanceof Error && err.name === "BrandIncompleteError"
    const failureReason = isBrandIncomplete ? "brand_incomplete" : "html_failed"
    // Truncamento carrega o output CRU no erro (HtmlTruncatedError.raw) —
    // persistido no run pra o "OUTPUT BRUTO" do painel mostrar ONDE o
    // modelo parou (antes ficava vazio e o truncamento era indepurável).
    const truncatedRaw =
      err instanceof Error && err.name === "HtmlTruncatedError"
        ? ((err as { raw?: string }).raw ?? "")
        : ""
    log.error("phase2.html.error", { emailId, error: msg, failureReason })
    await finishGenerationRun(htmlRunId, {
      storeId,
      flowId,
      emailId,
      triggeredBy,
      batchId,
      agent: "html",
      status: "error",
      durationMs: Date.now() - htmlT0,
      errorMessage: msg,
      ...(truncatedRaw ? { rawOutput: truncatedRaw } : {}),
    })
    await markEmailFailed(emailId, failureReason)
    await safeNotifyEmailFailed(storeId, emailId, failureReason, batchId || null)
    if (batchId) {
      await rollupCostAndMaybeAlert({ storeId, emailId, batchId, costAlertUsd: ctx.costAlertUsd }).catch(() => {})
      await checkBatchTerminal(storeId, batchId).catch(() => {})
    }
    return { status: "failed" }
  }

  // ── Step 2.5: Refinador VISUAL / repintor (fail-open) ────────────────
  // Voz da marca em 3 camadas visuais (fonte de DISPLAY, border-radius,
  // ritmo vertical): o LLM RECEBE o HTML e DEVOLVE o HTML modificado — só o
  // visual, preservando copy/imagens/estrutura/blocos. Sem config ativa →
  // no-op total. Guard estrutural reprovado (não-HTML, nº de <table> mudou,
  // encolheu) ou exceção → mantém o HTML original e segue pro QA (fail-open;
  // NUNCA markEmailFailed aqui). Status permanece `rendering` — o claim
  // `rendering -> ready` abaixo fica intocado. Requer a migration 20261031
  // (prompt em formato HTML): sem ela o prompt antigo (delta) faz o LLM
  // cuspir JSON → guard reprova → no-op silencioso.
  finalHtml = await runRefinerStep({
    ctx,
    finalHtml,
    storeId,
    flowId,
    emailId,
    triggeredBy,
    batchId,
    routeT0,
  })

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
      qaVisionEnabled: ctx.qaVisionEnabled,
      // fields v2 do blueprint híbrido → validação max_len/required no QA.
      blueprintBlocks: ctx.blueprint?.blocks ?? [],
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
