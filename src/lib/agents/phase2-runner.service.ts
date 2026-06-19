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
import {
  resolveAspectForBlock,
  aspectInstructionForPrompt,
  isAspectKey,
  type AspectKey,
} from "./image/aspect-ratio"
import {
  resolveImageMode,
  productRefDescriptionFallback,
} from "./image/mode-resolution"
import { isUsableProductImage } from "./image/product-image-guard"
import { buildImageAlt } from "./image/resolve-block-prompt.service"
import {
  DEFAULT_HTML_SYSTEM_PROMPT,
  DEFAULT_HTML_USER_TEMPLATE,
  invokeHtmlChain,
} from "./chains/html.chain"
import { buildHtmlPromptVars } from "./html/build-vars"
import { runQaAgent } from "./chains/qa.chain"
import {
  logGenerationRun,
  computeCostCents,
} from "./callbacks/telemetry.callback"
import { buildImagePromptVars } from "./email-generation.service"
import { MAX_AI_IMAGES } from "./image/limits"
import { loadTopProducts } from "./top-products"
import { loadEffectiveBlueprint } from "./architect/blueprint-loader"
import { isBrandConfirmed } from "./html/brand-guards"

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
          .select("generate_images")
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
  ])

  const generateImages = (settingsRes.data?.generate_images as boolean | undefined) ?? true

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

  // ── Guard 0: GATE 2 — só renderiza com brand confirmada ──────────────
  // Cobre TODOS os caminhos de entrada (watchdog Frente 4, generate-email,
  // signal consumer, monolito legado). Sem brand confirmada o e-mail FICA
  // em copy_ready — nunca vira failed:brand_incomplete.
  if (!params.relaxedBrandCheck && !(await isBrandConfirmed(admin, storeId))) {
    log.info("phase2.image.skipped_brand_not_confirmed", { storeId, emailId })
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
    let imageFailures = 0
    const imageTotal = (imageBlocks ?? []).length

    for (const blk of imageBlocks ?? []) {
      const imgT0 = Date.now()
      // Declarados fora do try pra o catch tambem registrar o input no run.
      let promptVars: Record<string, string> | undefined
      let promptWithAspect = ""
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
        const reserveBottom =
          ctx.blueprint?.image_overlay_reserve_bottom ?? true
        const aspect: AspectKey = resolveAspectForBlock({
          blueprintAspect: blueprintAspectRaw as AspectKey | null | undefined,
          flowType: ctx.flowType,
          emailNumber: ctx.emailNumber,
        })
        // AE-12 review C1: source so eh "blueprint" se o valor era VALIDO.
        // Caso contrario, o resolveAspectForBlock caiu na matriz ou default.
        const aspectSource = blueprintAspectIsValid
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

        promptWithAspect = `${prompt}\n\n${aspectInstructionForPrompt(aspect, reserveBottom)}`

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

        const imageUrl = await generateEmailImage(
          promptWithAspect,
          storeId,
          {
            aspect,
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
          inputVars: promptVars,
          renderedPrompt: promptWithAspect || undefined,
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
          inputVars: promptVars,
          renderedPrompt: promptWithAspect || undefined,
          errorMessage: msg,
        })
        // NÃO aborta: contabiliza e segue pro próximo bloco. O bloco fica sem
        // `image_url` (placeholder no HTML). Quem decide o estado terminal do
        // email é a fase HTML+QA, não uma imagem isolada.
        imageFailures++
        continue
      }
    }

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
export async function runPhase2HtmlQa(
  params: RunPhase2Params,
): Promise<{ status: "ready" | "failed" | "skipped" }> {
  const { storeId, emailId, triggeredBy, relaxedBrandCheck } = params
  const admin = createAdminClient()
  log.info("phase2.html_qa.start", { storeId, emailId })

  // ── Claim atomico: image_done OR rendering -> rendering ──────────────
  // Aceita ambos porque:
  //   - image_done: caminho split (rota run-phase2-image -> run-phase2-html-qa)
  //   - rendering: caminho legacy (runPhase2InBackground em monolito) +
  //     watchdog disparando direto pra esta rota com email travado em rendering
  const nowIso = new Date().toISOString()
  const { data: claimed } = await admin
    .from("email_flow_emails")
    .update({
      status: "rendering",
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

    const { html: rawHtml, tokensInput, tokensOutput } = await invokeHtmlChain({
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
      .update({ html: rawHtml, updated_at: new Date().toISOString() })
      .eq("id", emailId)

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
      // HTML completo na telemetria — antes o caminho de producao nem gravava
      // raw_output, deixando o "OUTPUT BRUTO" vazio. Limitado pelo max_tokens.
      rawOutput: rawHtml,
      tokensInput,
      tokensOutput,
      costCents: computeCostCents(model, tokensInput, tokensOutput),
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
    log.error("phase2.html.error", { emailId, error: msg, failureReason })
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
    await markEmailFailed(emailId, failureReason)
    await safeNotifyEmailFailed(storeId, emailId, failureReason, batchId || null)
    if (batchId) {
      await rollupTotalCost(emailId, batchId).catch(() => {})
      await checkBatchTerminal(storeId, batchId).catch(() => {})
    }
    return { status: "failed" }
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
    if (batchId) await rollupTotalCost(emailId, batchId).catch(() => {})
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
  if (batchId) await rollupTotalCost(emailId, batchId).catch(() => {})
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
