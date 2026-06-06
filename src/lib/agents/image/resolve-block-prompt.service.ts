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
 * Espelha a logica do `phase2-runner.service.ts` (~L390..L516) — qualquer
 * mudança naquele runner deve ser refletida aqui (mesmo prompt produzido).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { NotFoundError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { buildImagePromptVars } from "@/lib/agents/email-generation.service"
import {
  DEFAULT_IMAGE_PROMPT_TEMPLATE,
  renderImagePrompt,
} from "@/lib/agents/chains/image.chain"
import { renderImageTemplate } from "@/lib/agents/image/template-renderer"
import {
  resolveAspectForBlock,
  aspectInstructionForPrompt,
  isAspectKey,
  type AspectKey,
} from "@/lib/agents/image/aspect-ratio"
import {
  resolveImageMode,
  productRefDescriptionFallback,
  type ImageMode,
} from "@/lib/agents/image/mode-resolution"
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
  /** Vars UPPERCASE que entraram no template, truncadas pra 200 chars cada (debug-only). */
  vars: Record<string, string>
  /** Aspect ratio resolvido (blueprint > matriz > default). */
  aspect: AspectKey
  /** Mode resolvido (product_ref/text2img, ja com fallbacks aplicados). */
  mode: ImageMode
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
): Promise<BlockPromptResolution> {
  const admin = createAdminClient()

  // ── 1. Bloco + email_id ────────────────────────────────────────
  const { data: blk, error: blkErr } = await admin
    .from("email_blocks")
    .select("id, block_type, label, content, email_id")
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

  // ── 2. Email + flow_id + email_number ──────────────────────────
  const { data: emailRow, error: emailErr } = await admin
    .from("email_flow_emails")
    .select("email_number, flow_id")
    .eq("id", emailId)
    .maybeSingle()

  if (emailErr) throw emailErr
  if (!emailRow) throw new NotFoundError("Email")

  const flowId = (emailRow.flow_id as string | undefined) ?? null
  const emailNumber = (emailRow.email_number as number | undefined) ?? null

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
    const { data: bpRow } = await admin
      .from("email_blueprints")
      .select("*")
      .eq("flow_type", flowType)
      .eq("email_number", emailNumber)
      .maybeSingle()
    blueprint = (bpRow as EmailBlueprint | null) ?? null
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
  const topProducts = ((brand?.top_products ?? []) as TopProduct[]) ?? []

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
  const overlayReserveBottom =
    blueprint?.image_overlay_reserve_bottom ?? true
  const aspect: AspectKey = resolveAspectForBlock({
    blueprintAspect: blueprintAspectRaw as AspectKey | null | undefined,
    flowType,
    emailNumber,
  })

  const multimodalEnabled = process.env.IMAGE_MULTIMODAL_ENABLED === "true"
  const topProductImageUrl = topProducts[0]?.image_url ?? null
  const { mode, source: modeSource } = resolveImageMode({
    blueprintMode: blueprint?.image_mode ?? null,
    flowType,
    emailNumber,
    topProductImageUrl,
    multimodalEnabled,
  })

  // ── 6. buildImagePromptVars (com INSTRUCAO_ADICIONAL do bloco + ctx v2) ─
  const promptVars = buildImagePromptVars({
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
    imageOverlayReserveBottom: overlayReserveBottom,
    aspect,
    mode,
  })

  // ── 7. Render do template (DB-config se existe, fallback hardcoded) ─
  const basePrompt = imageConfig
    ? renderImageTemplate(imageConfig.user_template, promptVars)
    : renderImagePrompt(DEFAULT_IMAGE_PROMPT_TEMPLATE, promptVars)

  let prompt = `${basePrompt}\n\n${aspectInstructionForPrompt(aspect, overlayReserveBottom)}`

  // Se caiu em fallback text2img + temos top product, adicionar
  // descricao rica (mesma logica do phase2-runner).
  if (
    (modeSource === "fallback_text2img_disabled" ||
      modeSource === "fallback_text2img_no_product") &&
    topProducts[0]?.name
  ) {
    prompt += `\n\n${productRefDescriptionFallback({
      productName: topProducts[0].name,
      productImageUrl: topProductImageUrl,
    })}`
  }

  return {
    prompt,
    vars: truncateVarsForDebug(promptVars),
    aspect,
    mode,
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
