/**
 * AE-16 — Helper compartilhado pelos dois endpoints novos:
 *   POST /api/admin/email-blocks/[blockId]/resolve-prompt
 *   POST /api/admin/email-blocks/[blockId]/regenerate-image
 *
 * Encapsula toda a lógica de hidratar contexto (bloco → email → flow →
 * store → brand → briefing → topProducts → storeOverrides → imageConfig
 * → blueprint) e produzir o prompt final renderizado mais a metadata
 * (mode, aspect, etc) necessaria pra um chamada ao `generateEmailImage`.
 *
 * Produz o MESMO prompt que o `phase2-runner.service.ts` produziria para o
 * bloco. Isso já foi um "SYNC CONTRACT" por comentário — "qualquer mudança
 * naquele runner deve ser refletida aqui" — e a vigilância manual falhou em
 * cinco pontos: a instrução de fidelidade ao produto nunca foi aplicada, a
 * direção fotográfica da variante nunca foi carregada, a guarda da URL do
 * produto não rodava, e `systemPrompt`/`model`/`customDims` eram carregados
 * e jogados fora. O que os dois caminhos compartilham hoje é CÓDIGO:
 * `buildImagePromptVars`, `resolveImageMode`, `isUsableProductImage`,
 * `loadPhotoDirections`, `resolveImageAppendices` e
 * `buildImagePromptWithSegments`. Ao acrescentar algo ao prompt de imagem,
 * acrescente numa dessas — não aqui e lá.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { NotFoundError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { buildImagePromptVars } from "@/lib/agents/email-generation.service"
import { buildImagePromptWithSegments } from "@/lib/agents/image/prompt-vars-builder"
import type { PromptSegment } from "@/lib/agents/shared/prompt-provenance"
import { loadTopProducts } from "@/lib/agents/top-products"
import { loadEffectiveBlueprint } from "@/lib/agents/architect/blueprint-loader"
import {
  DEFAULT_IMAGE_PROMPT_TEMPLATE,
  renderImagePrompt,
} from "@/lib/agents/chains/image.chain"
import { renderImageTemplate } from "@/lib/agents/image/template-renderer"
import {
  resolveAspectForField,
  blockAspectFromBlueprint,
  imageDimsFromBlueprint,
  aspectInstructionForPrompt,
  dimsInstructionForPrompt,
  isAspectKey,
  type AspectKey,
} from "@/lib/agents/image/aspect-ratio"
import { overlaySpec } from "@/lib/agents/image/overlay-luminance"
import {
  resolveImageMode,
  resolveImageAppendices,
  type ImageMode,
  type ImageModeSource,
} from "@/lib/agents/image/mode-resolution"
import { isUsableProductImage } from "@/lib/agents/image/product-image-guard"
import { loadPhotoDirections } from "@/lib/agents/image/photo-directions"
import type {
  StoreBrandIdentity,
  StoreBriefing,
  TopProduct,
} from "@/types/email-workspace"
import type {
  EmailBlueprint,
  StoreImageOverrides,
} from "@/types/email-generation"

const log = logger.child("ResolveBlockPrompt")

/**
 * Story AE-15: monta image_alt descritivo a partir das vars resolvidas
 * pelo `buildImagePromptVars` (PRODUTO_HEROI/CENARIO/MOOD UPPERCASE).
 *
 * Pure helper — input/output deterministico. Usado tanto por
 * `resolveBlockPrompt` (preview na UI) quanto pelo `phase2-runner`
 * (persiste em email_blocks.content.image_alt no UPDATE da imagem).
 *
 * Trunca em 200 chars pra nao poluir telemetria/UI. Fallback gracioso
 * quando alguma var estiver vazia.
 */
export function buildImageAlt(
  vars: Record<string, string>,
): string {
  const produtoHeroi = (vars.PRODUTO_HEROI ?? "").trim() || "produto"
  const cenario = (vars.CENARIO ?? "").trim() || "cena padrao"
  const mood = (vars.MOOD ?? "").trim() || "neutro"
  const alt = `${produtoHeroi} em ${cenario}, mood ${mood}`
  return alt.length > 200 ? `${alt.slice(0, 200)}…` : alt
}

export interface BlockPromptResolution {
  /** Prompt final renderizado (master + aspect appendix + fallback desc se aplicavel). */
  prompt: string
  /**
   * O mesmo prompt marcado por ORIGEM (migration 20261085) — quem grava a
   * run (regenerate manual, estúdio) passa adiante. null quando o corte não
   * reproduz o prompt.
   */
  promptSegments: PromptSegment[] | null
  /** Vars UPPERCASE que entraram no template, truncadas pra 200 chars cada (debug-only). */
  vars: Record<string, string>
  /** Aspect ratio resolvido (blueprint > matriz > default). */
  aspect: AspectKey
  /** Mode resolvido (product_ref/text2img, ja com fallbacks aplicados). */
  mode: ImageMode
  /**
   * POR QUE o modo é esse. Interessa quando é um `fallback_text2img_*`: o
   * preview e a Entrada da telemetria explicam ao operador que a foto do
   * produto não pôde ir, em vez de só mostrar "text2img".
   */
  modeSource: ImageModeSource
  /**
   * Dimensões declaradas no schema, quando existem. Vencem o `aspect` no
   * resize — o caller PRECISA repassá-las a `generateEmailImage`, senão o
   * prompt pede WxH e o arquivo sai no aspect tipado.
   */
  customDims: { width: number; height: number } | null
  /** Master Prompt v2 Part A (`email_agent_configs.system_prompt`). */
  systemPrompt: string | null
  /** Modelo configurado no banco — null cai no OPENROUTER_IMAGE_MODEL. */
  model: string | null
  /** Para o endpoint regenerate. */
  storeId: string
  /** Para o endpoint regenerate (eh o pai do bloco, via email_blocks.email_id -> emails.flow_id). */
  emailId: string
  flowId: string | null
  /** Para passar como `referenceImageUrl` quando mode='product_ref'. */
  topProductImageUrl: string | null
  /** Pro `aspectInstructionForPrompt` ja foi rodado, mas o caller precisa pra log. */
  overlayReserveBottom: boolean
  /** Tipo do bloco — pro caller validar que eh image-bearing antes de regerar. */
  blockType: string
  /** Label do bloco — pro caller usar como alt-text fallback. */
  blockLabel: string | null
  /** Conteudo atual do bloco — pro caller preservar campos ao merge. */
  blockContent: Record<string, unknown>
  /** UTC timestamp da ultima geracao (pro rate limit). */
  lastGeneratedAt: string | null
  /**
   * Story AE-15: alt-text descritivo composto a partir das vars
   * (PRODUTO_HEROI em CENARIO, mood MOOD). Usado pelo phase2-runner
   * pra persistir em email_blocks.content.image_alt no UPDATE da
   * imagem — substitui o fallback `blk.label` legacy.
   */
  imageAlt: string
}

const VAR_TRUNCATE_LIMIT = 200

function truncateVarsForDebug(
  vars: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(vars)) {
    // Mantemos apenas chaves UPPERCASE (12 vars niche-adaptive + INSTRUCAO_ADICIONAL)
    // — sao as que importam pro template AE-11+. Excluir snake_case reduz ruido.
    if (k !== k.toUpperCase()) continue
    const str = typeof v === "string" ? v : String(v)
    out[k] = str.length > VAR_TRUNCATE_LIMIT
      ? `${str.slice(0, VAR_TRUNCATE_LIMIT)}…`
      : str
  }
  return out
}

/**
 * Carrega tudo, monta o prompt final e retorna sem chamar OpenRouter.
 *
 * Throws:
 * - `NotFoundError` se bloco/email/store nao existem.
 * - Re-throws em erros de DB (caller envolve com errorResponse).
 *
 * ⚠️ SYNC CONTRACT WITH phase2-runner.service.ts: a logica de
 * resolucao (aspect + mode + fallback description + render final
 * do prompt) deve ficar identica a do bloco AE-12/AE-13 em
 * `phase2-runner.service.ts` (~L427-516). Esta funcao existe pra
 * suportar a UI (AE-16) sem chamar OpenRouter, mas precisa produzir
 * o MESMO prompt que o phase2-runner produz quando regenerar o
 * mesmo bloco. Refatorar um sem o outro = preview na UI divergir
 * do batch run (bug silencioso). Idealmente extrair pra helper
 * compartilhado.
 */
export async function resolveBlockPrompt(
  blockId: string,
  /**
   * Slot alvo. Desde que a geração virou por campo, regerar "a imagem do
   * bloco" é ambíguo num bloco de 8 slots: aspecto, dimensões e brief
   * mudam por slot. Ausente → primeiro campo com dims (comportamento
   * antigo), que é o certo para bloco de imagem única.
   */
  fieldKey?: string | null,
): Promise<BlockPromptResolution> {
  const admin = createAdminClient()

  // ── 1. Bloco + email_id ────────────────────────────────────────
  const { data: blk, error: blkErr } = await admin
    .from("email_blocks")
    .select("id, block_type, label, content, email_id, position, fields")
    .eq("id", blockId)
    .maybeSingle()

  if (blkErr) throw blkErr
  if (!blk) throw new NotFoundError("Bloco")

  const emailId = blk.email_id as string | null
  if (!emailId) throw new NotFoundError("Email do bloco")

  const blockContent = (blk.content as Record<string, unknown> | null) ?? {}
  const instrucaoAdicional =
    typeof blockContent.image_instruction === "string"
      ? (blockContent.image_instruction as string)
      : undefined
  const lastGeneratedAt =
    typeof blockContent.image_last_generated_at === "string"
      ? (blockContent.image_last_generated_at as string)
      : null

  // ── 2. Email + flow_id + number ──────────────────────────
  // Coluna em email_flow_emails se chama `number`, NAO `email_number`.
  const { data: emailRow, error: emailErr } = await admin
    .from("email_flow_emails")
    .select("number, flow_id")
    .eq("id", emailId)
    .maybeSingle()

  if (emailErr) throw emailErr
  if (!emailRow) throw new NotFoundError("Email")

  const flowId = (emailRow.flow_id as string | undefined) ?? null
  const emailNumber = (emailRow.number as number | undefined) ?? null

  // ── 3. Flow → flow_type → store_id ────────────────────────────
  let flowType: string | null = null
  let storeId: string | null = null
  if (flowId) {
    const { data: flowRow } = await admin
      .from("email_flows")
      .select("flow_type, store_id")
      .eq("id", flowId)
      .maybeSingle()
    flowType = (flowRow?.flow_type as string | undefined) ?? null
    storeId = (flowRow?.store_id as string | undefined) ?? null
  }
  if (!storeId) throw new NotFoundError("Store do flow")

  // ── 4. Blueprint, brand, briefing, image config, overrides ────
  let blueprint: EmailBlueprint | null = null
  if (flowType && emailNumber != null) {
    blueprint = await loadEffectiveBlueprint(
      admin,
      storeId,
      flowType,
      emailNumber,
    )
  }

  const [storeRes, brandRes, briefingRes, imageConfigRes, storeOverridesRes] =
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

  if (!storeRes.data) throw new NotFoundError("Store")

  const brand = (brandRes.data as StoreBrandIdentity | null) ?? null
  const briefing = (briefingRes.data as StoreBriefing | null) ?? null
  const storeRaw =
    (storeRes.data as Record<string, unknown>) ?? { store_name: "Loja" }
  const imageConfig =
    (imageConfigRes.data as {
      system_prompt: string | null
      user_template: string
      model: string
    } | null) ?? null
  const storeOverrides =
    (storeOverridesRes.data as StoreImageOverrides | null) ?? null
  // Fonte única: tabela viva store_top_products (fallback no snapshot).
  const topProducts: TopProduct[] = await loadTopProducts(
    admin,
    storeId,
    (storeRaw?.store_url as string | undefined) ?? null,
  )

  // ── 5. Aspect ratio + mode (resolvidos ANTES do buildImagePromptVars
  // pra ficarem disponíveis como vars do template no Master Prompt v2). ─
  const blueprintAspectRaw = blueprint?.image_aspect ?? null
  const blueprintAspectIsValid =
    !!blueprintAspectRaw && isAspectKey(blueprintAspectRaw)
  if (blueprintAspectRaw && !blueprintAspectIsValid) {
    log.warn("resolve.blueprint_aspect_invalid", {
      blockId,
      invalidValue: blueprintAspectRaw,
    })
  }
  // Reserva de overlay: sai do CADASTRO do campo, não de um booleano fixo.
  //
  // Estava travada em `false` desde "Hero v5 (jul/2026)", com a justificativa
  // de que "a imagem do hero é um <img> standalone e o texto é HTML separado".
  // Essa premissa morreu quando a biblioteca de componentes virou a fonte da
  // arquitetura: `welcome - hero section 4` põe a foto como background de
  // TUDO e sobrepõe logo, headline, cupom e CTA aos 43% de cima. O código
  // dizia ao modelo o contrário do que o schema pedia, na mesma chamada.
  //
  // Mesma fonte que o `especificidade` do IMAGE_SLOTS
  // (image/build-image-slots.ts) — as duas descrições não podem divergir.
  // SYNC CONTRACT com phase2-runner.service.ts.
  const overlayField = (
    (blk.fields as Array<{ key?: string; guidance?: string | null; image_spec?: string | null }> | null) ?? []
  ).find((f) => f?.key === fieldKey)
  const overlay = overlaySpec(
    `${overlayField?.guidance ?? ""} ${overlayField?.image_spec ?? ""}`,
  )
  const overlayReserveBottom = overlay != null
  // Aspect POR BLOCO (blocks[].image_aspect via tags do template) —
  // prioridade máxima. SYNC CONTRACT com phase2-runner.service.ts.
  const blockAspectRaw = blockAspectFromBlueprint(
    blueprint?.blocks as
      | Array<{ type?: string; image_aspect?: string | null }>
      | undefined,
    (blk.position as number | undefined) ?? null,
    (blk.block_type as string | undefined) ?? null,
  )
  const fieldAspect = ((blk.fields as Array<{ key?: string; image_aspect?: string | null }> | null) ?? []).find(
    (f) => f?.key === fieldKey,
  )?.image_aspect
  const aspect: AspectKey = resolveAspectForField({
    fieldAspect: fieldAspect ?? null,
    blockAspect: blockAspectRaw,
    blueprintAspect: blueprintAspectRaw as AspectKey | null | undefined,
    flowType,
    emailNumber,
  })
  // Dims declaradas no schema vencem o aspect tipado. SYNC CONTRACT com
  // phase2-runner.service.ts.
  const customDims = imageDimsFromBlueprint(
    blueprint?.blocks as
      | Array<{
          type?: string
          fields?: Array<{
            type?: string
            image_width?: number | null
            image_height?: number | null
          }>
        }>
      | undefined,
    (blk.position as number | undefined) ?? null,
    (blk.block_type as string | undefined) ?? null,
    fieldKey,
  )

  const multimodalEnabled = process.env.IMAGE_MULTIMODAL_ENABLED === "true"
  const topProductImageUrl = topProducts[0]?.image_url ?? null
  let { mode, source: modeSource } = resolveImageMode({
    blueprintMode: blueprint?.image_mode ?? null,
    flowType,
    emailNumber,
    topProductImageUrl,
    multimodalEnabled,
  })

  // ── Guarda de integração (product_ref) — mesma do phase2-runner ────────
  // A foto do produto tem de ser baixável E ser imagem. URL 403/404/HTML
  // (asset removido, CDN restrito) faria o modelo cair em imagem genérica
  // sem avisar. Reprovou → text2img + a descrição textual do produto.
  // Roda também aqui, e não só no pipeline, para o preview do prompt
  // mostrar o que será REALMENTE enviado — inclusive o rebaixamento.
  if (mode === "product_ref" && topProductImageUrl) {
    const check = await isUsableProductImage(topProductImageUrl)
    if (!check.usable) {
      log.warn("resolve.image.product_ref_url_unusable", {
        blockId,
        reason: check.reason,
        status: check.status,
        contentType: check.contentType,
      })
      mode = "text2img"
      modeSource = "fallback_text2img_unreachable"
    }
  }

  // Direção fotográfica das variantes do blueprint (migration 20261060).
  // Sem isto a var PHOTO_DIRECTION saía vazia neste caminho e a imagem
  // regerada à mão perdia a direção de arte da biblioteca.
  const photoDirectionByVariant = await loadPhotoDirections(
    admin,
    blueprint?.blocks as Array<{ variant_id?: string | null }> | undefined,
  )

  // ── 6. buildImagePromptVars (com INSTRUCAO_ADICIONAL do bloco + ctx v2) ─
  const promptVars = buildImagePromptVars({
    // Um slot por chamada — mesmo contrato do phase2-runner.
    fieldKey,
    photoDirectionByVariant,
    brand,
    briefing,
    topProducts,
    storeRaw,
    blockPurpose: (blk.label as string) ?? blk.block_type ?? "hero",
    emailNumber: emailNumber ?? undefined,
    flowType: flowType ?? undefined,
    blueprint,
    storeOverrides,
    instrucaoAdicional,
    blockType: (blk.block_type as string) ?? undefined,
    blockLabel: (blk.label as string) ?? undefined,
    blockPosition: (blk.position as number) ?? undefined,
    blockContent,
    imageOverlayReserveBottom: overlayReserveBottom,
    aspect,
    mode,
  })

  // ── 7. Render do template (DB-config se existe, fallback hardcoded) ─
  const geometryInstruction = customDims
    ? dimsInstructionForPrompt(customDims.width, customDims.height, overlay)
    : aspectInstructionForPrompt(aspect, overlay)

  // A montagem (template + geometria + apêndices) e a DECISÃO de quais
  // apêndices entram vivem em `buildImagePromptWithSegments` e
  // `resolveImageAppendices` — as MESMAS funções que o phase2-runner usa.
  // Era aqui que o "SYNC CONTRACT" do cabeçalho pedia atenção manual (e a
  // perdeu: a fidelidade nunca era aplicada); agora há um caminho só.
  const { fidelity, fallbackDescription } = resolveImageAppendices({
    mode,
    modeSource,
    productName: topProducts[0]?.name,
    productImageUrl: topProductImageUrl,
  })

  const montado = buildImagePromptWithSegments({
    template: imageConfig?.user_template ?? DEFAULT_IMAGE_PROMPT_TEMPLATE,
    vars: promptVars,
    fromConfig: Boolean(imageConfig),
    geometry: geometryInstruction,
    fallbackDescription,
    fidelity,
  })
  const prompt = montado.prompt

  return {
    prompt,
    promptSegments: montado.segments,
    vars: truncateVarsForDebug(promptVars),
    aspect,
    mode,
    modeSource,
    customDims,
    systemPrompt: imageConfig?.system_prompt ?? null,
    model: imageConfig?.model ?? null,
    storeId,
    emailId,
    flowId,
    topProductImageUrl,
    overlayReserveBottom,
    blockType: (blk.block_type as string) ?? "",
    blockLabel: (blk.label as string | null) ?? null,
    blockContent,
    lastGeneratedAt,
    imageAlt: buildImageAlt(promptVars),
  }
}
