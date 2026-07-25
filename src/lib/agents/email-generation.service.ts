/**
 * Email Generation Service — gera os "visuais" do email (imagem + HTML).
 *
 * A copy (subject/preheader/blocos) é gerada externamente pelo n8n via
 * `email-copy-webhook.service.ts` — quando o callback `/api/webhooks/n8n/email-copy`
 * é recebido, status muda para `copy_ready`. Esta função processa email com copy
 * pronta gerando imagem + HTML.
 *
 * Fluxo:
 * 1. loadGenerationContext() — brand, briefing, blueprint, top_products, agent configs
 * 2. seedBlocksFromBlueprint() — re-cria blocos vazios se necessário (determinístico)
 * 3. generateEmailImage() — se generate_images, gera imagens dos blocos hero/custom
 * 4. createHtmlChain() → PATCH email.html
 * 5. Atualiza email status para "ready"
 *
 * Cada passo persiste log em email_generation_runs via telemetry callback.
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
} from "@/types/email-generation"
// buildImagePromptVars foi extraído para image/prompt-vars-builder.ts (reuso
// pelo pipeline de imagens de campanha). Re-exportado abaixo para não quebrar
// os callers que importam de "./email-generation.service".
import {
  buildImagePromptVars,
  type ImagePromptVarsInput,
} from "./image/prompt-vars-builder"
import { seedBlocksFromBlueprint, type SeededBlock } from "./seed-blocks"
import { loadTopProducts } from "./top-products"
import { loadEffectiveBlueprint } from "./architect/blueprint-loader"
import { selectImageBlocks } from "./image/limits"
import {
  generateEmailImage,
  DEFAULT_IMAGE_PROMPT_TEMPLATE,
  renderImagePrompt,
} from "./chains/image.chain"
import {
  invokeHtmlChain,
  DEFAULT_HTML_SYSTEM_PROMPT,
  DEFAULT_HTML_USER_TEMPLATE,
} from "./chains/html.chain"
import { buildHtmlPromptVars } from "./html/build-vars"
import { pickBrandLogo } from "@/lib/brand/pick-logo"
import {
  logGenerationRun,
  resolveCostCents,
} from "./callbacks/telemetry.callback"
import { notifyGenerationError } from "./generation-notify.service"

const log = logger.child("EmailGeneration")

function stringify(val: unknown): string {
  if (val == null) return ""
  if (typeof val === "string") return val
  if (typeof val === "number" || typeof val === "boolean") return String(val)
  if (Array.isArray(val)) {
    if (val.length === 0) return ""
    if (typeof val[0] === "string") return val.join(", ")
    return JSON.stringify(val, null, 2)
  }
  if (typeof val === "object") return JSON.stringify(val, null, 2)
  return String(val)
}

function _buildAllVars(ctx: GenerationContext): Record<string, string> {
  const vars: Record<string, string> = {}
  const s = ctx.storeRaw

  // 1) Flat map de TODOS os campos de client_stores
  for (const [key, val] of Object.entries(s)) {
    if (key.includes("api_key") || key.includes("api_secret") || key.includes("access_token")
      || key.includes("credentials") || key.includes("private_key")) continue
    vars[key] = stringify(val)
  }

  // Aliases convenientes
  vars.brand_name = (s.store_name as string) ?? "Loja"
  vars.niche = (s.niche as string) ?? ""
  vars.posicionamento = (s.posicionamento_preco as string) ?? ""

  // 2) Brand identity
  const b = ctx.brand
  if (b) {
    vars.voice = stringify(b.voice)
    vars.logo_url = pickBrandLogo(b, "png")?.url ?? ""
    vars.logo_alt_url = b.logo_alt_png ?? b.logo_alt_svg ?? ""
    vars.primary_color = (b.colors_primary ?? [])[0]?.hex ?? "#1F1F1F"
    vars.primary_color_hex = vars.primary_color.replace("#", "")
    vars.secondary_color = (b.colors_secondary ?? [])[0]?.hex ?? "#F0F0F0"
    vars.primary_colors = ((b.colors_primary ?? []).map((c) => c.hex).join(", ")) || "#1F1F1F"
    vars.primary_color_names = (b.colors_primary ?? []).map((c) => c.name).join(", ")
    vars.secondary_colors = ((b.colors_secondary ?? []).map((c) => c.hex).join(", ")) || "#F0F0F0"
    vars.font_heading = b.font_heading ?? "Arial"
    vars.font_heading_weight = b.font_heading_weight ?? ""
    vars.font_body = b.font_body ?? "Arial"
    vars.font_body_weight = b.font_body_weight ?? ""
  }

  // 3) Briefing — marca
  const marca = (ctx.briefing?.marca ?? {}) as Record<string, unknown>
  for (const [key, val] of Object.entries(marca)) {
    if (!(key in vars) || !vars[key]) {
      vars[key] = stringify(val)
    }
  }
  vars.tom_voz = stringify(marca.tom_voz) || "casual"
  if (!vars.posicionamento) vars.posicionamento = stringify(marca.posicionamento) || "medio"

  // 4) Briefing — detail
  const detail = (ctx.briefing?.briefing ?? {}) as Record<string, unknown>
  for (const [key, val] of Object.entries(detail)) {
    if (key === "politicas" && Array.isArray(val)) {
      vars.politicas = (val as Array<{ tipo: string; valor: string }>)
        .map((p) => `${p.tipo}: ${p.valor}`).join("; ")
    } else {
      vars[key] = stringify(val)
    }
  }

  // 5) Top products
  vars.top_products = ctx.topProducts.length > 0
    ? JSON.stringify(ctx.topProducts.map((p) => ({
        name: p.name, price: p.price, image_url: p.image_url, url: p.url ?? "",
      })), null, 2)
    : "Nenhum produto disponível"

  // 6) Reference HTML + Copy
  vars.reference_html = ctx.referenceHtml ?? ""
  vars.reference_copy = ctx.referenceCopy ?? ""

  // 7) Image map → image_instructions
  if (ctx.imageMap && ctx.imageMap.length > 0) {
    const lines = ctx.imageMap.map((img) => {
      switch (img.type) {
        case "logo":
          return `${img.src} → SUBSTITUIR por logo da marca: ${vars.logo_url || "sem logo"}`
        case "product": {
          const idx = img.product_index ?? 0
          const products = ctx.topProducts
          const url = products[idx]?.image_url ?? "sem imagem"
          const name = products[idx]?.name ?? `Produto ${idx + 1}`
          return `${img.src} → SUBSTITUIR por imagem do produto "${name}": ${url}`
        }
        case "hero":
          return `${img.src} → SUBSTITUIR por hero banner. ${img.instruction ? `Instrução: ${img.instruction}` : `Usar placeholder: https://placehold.co/${img.width ?? 600}x${img.height ?? 400}/${vars.primary_color_hex || "1F1F1F"}/ffffff?text=${encodeURIComponent(vars.brand_name)}`}`
        case "icon":
          return `${img.src} → SUBSTITUIR por emoji/Unicode. ${img.instruction ? `Usar: ${img.instruction}` : "Escolher emoji apropriado (🚚 📦 ⭐ 💬 ✨ etc.)"}`
        case "decorative":
          return `${img.src} → SUBSTITUIR por caractere Unicode (★ ☆ etc.) ou remover`
        case "custom":
          return `${img.src} → ${img.instruction ?? "Substituir por imagem apropriada"}`
        default:
          return `${img.src} → Substituir conforme contexto`
      }
    })
    vars.image_instructions = lines.join("\n")
  } else {
    vars.image_instructions = ""
  }

  return vars
}

// ── Helper: variáveis para o agente de imagem ─────────────────────────
//
// `buildImagePromptVars`/`ImagePromptVarsInput` foram movidos para
// image/prompt-vars-builder.ts (reuso pelo pipeline de imagens de
// campanha). Re-exportados aqui para preservar os callers que importam de
// "@/lib/agents/email-generation.service".
export { buildImagePromptVars }
export type { ImagePromptVarsInput }

// ── Types ───────────────────────────────────────────────────

interface GenerateEmailParams {
  storeId: string
  flowId: string
  emailId: string
  flowType: string
  emailNumber: number
  triggeredBy: string
  batchId: string
  /** Quando true, NÃO re-seedeia: preserva os blocos/copy existentes. */
  skipSeed?: boolean
  /**
   * Quando true (TestTab), precheckBrandReady só falha se brand=null.
   * Cores/logo faltando degradam pra defaults sem bloquear geração.
   */
  relaxedBrandCheck?: boolean
}

interface GenerationContext {
  brand: StoreBrandIdentity | null
  briefing: StoreBriefing | null
  blueprint: EmailBlueprint | null
  topProducts: TopProduct[]
  referenceHtml: string | null
  referenceCopy: string | null
  imageMap: Array<{ src: string; alt: string; type: string; width?: number | null; height?: number | null; product_index?: number; instruction?: string | null; image_prompt?: string | null }> | null
  settings: {
    generate_images: boolean
    max_parallel: number
  }
  agentConfigs: {
    copy: EmailAgentConfig | null
    image: EmailAgentConfig | null
    html: EmailAgentConfig | null
  }
  storeRaw: Record<string, unknown>
}

// ── Main function ───────────────────────────────────────────

/** Carrega os blocos já materializados de um email (forma SeededBlock), sem
 * deletar — usado quando o seed é pulado para preservar a copy existente. */
async function loadExistingBlocks(
  admin: ReturnType<typeof createAdminClient>,
  emailId: string,
): Promise<SeededBlock[]> {
  const { data } = await admin
    .from("email_blocks")
    .select("id, block_type, position, label, needs_image")
    .eq("email_id", emailId)
    .order("position")
  return (
    (data as Array<{
      id: string
      block_type: string
      position: number
      label: string | null
      needs_image: boolean | null
    }> | null) ?? []
  ).map((row) => ({
    id: row.id,
    block_type: row.block_type,
    position: row.position,
    label: row.label ?? "",
    purpose: "",
    needs_image: row.needs_image ?? row.block_type === "hero",
  }))
}

export async function generateEmail(
  params: GenerateEmailParams,
): Promise<{ status: "done" | "error"; error?: string }> {
  const { storeId, flowId, emailId, flowType, emailNumber, triggeredBy, batchId, skipSeed, relaxedBrandCheck } = params
  const admin = createAdminClient()
  log.info("generation.start", { storeId, flowId, emailId, flowType, emailNumber, batchId })

  try {
    // ── Step 0: Load context ──────────────────────────────────
    const ctx = await loadGenerationContext(storeId, flowType, emailNumber)

    // ── Step 1: Seed blocks ───────────────────────────────────
    const seedT0 = Date.now()
    let seededBlocks: SeededBlock[]
    try {
      if (skipSeed) {
        // Preserva a copy existente: carrega os blocos sem deletar.
        seededBlocks = await loadExistingBlocks(admin, emailId)
      } else {
        const seedResult = await seedBlocksFromBlueprint(emailId, flowType, emailNumber)
        seededBlocks = seedResult.blocks
      }
      await logGenerationRun({
        storeId,
        flowId,
        emailId,
        triggeredBy,
        batchId,
        agent: "seed",
        status: skipSeed ? "skipped" : "success",
        durationMs: Date.now() - seedT0,
        parsedOutput: { blockCount: seededBlocks.length },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro no seed"
      const seedRunId = await logGenerationRun({
        storeId,
        flowId,
        emailId,
        triggeredBy,
        batchId,
        agent: "seed",
        status: "error",
        durationMs: Date.now() - seedT0,
        errorMessage: msg,
        errorStack: err instanceof Error ? err.stack : undefined,
      })
      notifyGenerationError({
        runId: seedRunId,
        storeId,
        storeName: (ctx.storeRaw.store_name as string) ?? "Loja",
        emailName: `Flow ${flowType} #${emailNumber}`,
        agent: "seed",
        model: "deterministic",
        error: msg,
        durationMs: Date.now() - seedT0,
        costCents: 0,
      }).catch(() => {})
      return { status: "error", error: `Seed failed: ${msg}` }
    }

    // ── Step 2 (copy): delegado ao n8n via webhook (email-copy-webhook.service.ts).
    // Quando o callback chega em /api/webhooks/n8n/email-copy, email_blocks.content +
    // email_flow_emails.subject/preheader são preenchidos e status vira "copy_ready".
    // Este pipeline (generateEmail) agora cuida apenas dos Steps 3+4 (imagem + html).

    // ── Step 3: Image (executa em paralelo apenas consigo mesma; sem copy) ─
    const imagePromise = (async () => {
      if (!ctx.settings.generate_images) {
        await logGenerationRun({
          storeId, flowId, emailId, triggeredBy, batchId,
          agent: "image",
          status: "skipped",
        })
        return
      }
      // Mesmo teto do caminho de produção (phase2-runner): prioriza por
      // position e corta em MAX_AI_IMAGES.
      const imageBlocks = selectImageBlocks(
        seededBlocks.filter((b) => b.needs_image),
      )
      log.info("generation.image.check", {
        emailId,
        generate_images: true,
        totalBlocks: seededBlocks.length,
        imageBlocks: imageBlocks.length,
        blockTypes: seededBlocks.map((b) => `${b.block_type}:needs_image=${b.needs_image}`),
      })
      if (imageBlocks.length === 0) {
        await logGenerationRun({
          storeId, flowId, emailId, triggeredBy, batchId,
          agent: "image",
          status: "skipped",
          parsedOutput: { reason: "no blocks with needs_image=true" },
        })
        return
      }
      for (const imgBlock of imageBlocks) {
        const imgT0 = Date.now()
        try {
          const promptVars = buildImagePromptVars({
            brand: ctx.brand,
            briefing: ctx.briefing,
            topProducts: ctx.topProducts,
            storeRaw: ctx.storeRaw,
            blockPurpose: imgBlock.purpose,
          })

          // Procura entrada no imageMap correspondente ao tipo do bloco
          const mapEntry = ctx.imageMap?.find(
            (m) => m.type === "hero" || m.type === "custom"
          )
          const customPrompt = mapEntry?.image_prompt?.trim() || null
          const promptTemplate = customPrompt || DEFAULT_IMAGE_PROMPT_TEMPLATE

          const prompt = renderImagePrompt(promptTemplate, promptVars)
          const imageUrl = await generateEmailImage(prompt, storeId)

          const { data: curBlock } = await admin
            .from("email_blocks")
            .select("content")
            .eq("id", imgBlock.id)
            .single()
          const merged = {
            ...((curBlock?.content as Record<string, unknown>) ?? {}),
            image_url: imageUrl,
            image_alt: imgBlock.label,
          }
          await admin
            .from("email_blocks")
            .update({ content: merged })
            .eq("id", imgBlock.id)

          await logGenerationRun({
            storeId, flowId, emailId, triggeredBy, batchId,
            agent: "image",
            status: "success",
            model: "openai/gpt-5.4-image-2",
            durationMs: Date.now() - imgT0,
            parsedOutput: {
              blockId: imgBlock.id,
              imageUrl,
              used_custom_prompt: !!customPrompt,
              prompt_length: prompt.length,
            },
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Erro na imagem"
          log.warn("generation.image.error", { emailId, blockId: imgBlock.id, error: msg })
          await logGenerationRun({
            storeId, flowId, emailId, triggeredBy, batchId,
            agent: "image",
            status: "error",
            model: "openai/gpt-5.4-image-2",
            durationMs: Date.now() - imgT0,
            errorMessage: msg,
            errorStack: err instanceof Error ? err.stack : undefined,
          })
        }
      }
    })()

    await imagePromise

    // ── Step 4: HTML generation ───────────────────────────────
    const htmlT0 = Date.now()
    try {
      const htmlConfig = ctx.agentConfigs.html
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
        flowType,
        emailNumber,
        admin,
        relaxedBrandCheck,
      })

      const { html: rawHtml, tokensInput, tokensOutput, costUsd } = await invokeHtmlChain({
        config: {
          model,
          temperature,
          max_tokens: maxTokens,
          system_prompt: systemPrompt,
          user_template: userTemplate,
        },
        vars: inputVars,
      })

      // PATCH email.html
      await admin
        .from("email_flow_emails")
        .update({ html: rawHtml })
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
        inputVars,
        // HTML completo na telemetria (antes era slice(0,2000), o que fazia o
        // "OUTPUT BRUTO" aparecer cortado mesmo com o email integro). O tamanho
        // e' limitado pelo max_tokens do agente, entao guardar full e' seguro.
        rawOutput: rawHtml,
        tokensInput,
        tokensOutput,
        costCents: resolveCostCents({ model, tokensInput, tokensOutput, costUsd }),
        durationMs: Date.now() - htmlT0,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro no HTML"
      log.error("generation.html.error", { emailId, error: msg })
      const htmlRunId = await logGenerationRun({
        storeId,
        flowId,
        emailId,
        triggeredBy,
        batchId,
        agent: "html",
        agentConfigId: ctx.agentConfigs.html?.id,
        status: "error",
        durationMs: Date.now() - htmlT0,
        errorMessage: msg,
        errorStack: err instanceof Error ? err.stack : undefined,
      })
      notifyGenerationError({
        runId: htmlRunId,
        storeId,
        storeName: (ctx.storeRaw.store_name as string) ?? "Loja",
        emailName: `Flow ${flowType} #${emailNumber}`,
        agent: "html",
        model: ctx.agentConfigs.html?.model ?? "claude-sonnet-4-5-20250514",
        error: msg,
        durationMs: Date.now() - htmlT0,
        costCents: 0,
      }).catch(() => {})
      return { status: "error", error: `HTML failed: ${msg}` }
    }

    // ── Step 5: Update email status para "ready" (copy + imagem + html concluídos) ──
    await admin
      .from("email_flow_emails")
      .update({ status: "ready" })
      .eq("id", emailId)

    log.info("generation.done", { storeId, emailId, batchId })
    return { status: "done" }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido"
    log.error("generation.fatal", { emailId, error: msg })
    return { status: "error", error: msg }
  }
}

// ── Context loader ──────────────────────────────────────────

async function loadGenerationContext(
  storeId: string,
  flowType: string,
  emailNumber: number,
): Promise<GenerationContext> {
  const admin = createAdminClient()

  // Buscar store primeiro para obter org_id
  const storeRes = await admin
    .from("client_stores")
    .select("*")
    .eq("id", storeId)
    .single()

  const orgId = (storeRes.data as Record<string, unknown>)?.org_id as string | undefined
  const storeUrl =
    ((storeRes.data as Record<string, unknown>)?.store_url as
      | string
      | undefined) ?? null

  // Parallelizar demais queries (settings agora filtra por org_id)
  const [
    brandRes,
    briefingRes,
    blueprintFull,
    topProducts,
    settingsRes,
    copyConfigRes,
    htmlConfigRes,
    refTemplateRes,
  ] = await Promise.all([
    // Brand identity
    admin
      .from("store_brand_identity")
      .select("*")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Briefing
    admin
      .from("store_briefings")
      .select("*")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Blueprint — cascata store_email_blueprints -> email_blueprints
    loadEffectiveBlueprint(admin, storeId, flowType, emailNumber),

    // Top products — fonte única (tabela viva + fallback snapshot)
    loadTopProducts(admin, storeId, storeUrl),

    // Generation settings — filtra por org_id da store
    orgId
      ? admin
          .from("email_generation_settings")
          .select("generate_images, max_parallel")
          .eq("org_id", orgId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // Agent configs — copy
    admin
      .from("email_agent_configs")
      .select("*")
      .eq("agent_type", "copy")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Agent configs — html
    admin
      .from("email_agent_configs")
      .select("*")
      .eq("agent_type", "html")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Reference template for flow_type + email_number
    admin
      .from("email_reference_templates")
      .select("html, copy, image_map")
      .eq("flow_type", flowType)
      .eq("email_number", emailNumber)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const hasSettings = settingsRes.data != null

  return {
    brand: (brandRes.data as StoreBrandIdentity | null) ?? null,
    briefing: (briefingRes.data as StoreBriefing | null) ?? null,
    blueprint: blueprintFull,
    topProducts,
    referenceHtml: (refTemplateRes.data?.html as string | null) ?? null,
    referenceCopy: (refTemplateRes.data?.copy as string | null) ?? null,
    imageMap: (refTemplateRes.data?.image_map as GenerationContext["imageMap"]) ?? null,
    settings: {
      generate_images: hasSettings ? settingsRes.data?.generate_images === true : true,
      max_parallel: (settingsRes.data?.max_parallel as number) ?? 2,
    },
    agentConfigs: {
      copy: (copyConfigRes.data as EmailAgentConfig | null) ?? null,
      image: null,
      html: (htmlConfigRes.data as EmailAgentConfig | null) ?? null,
    },
    storeRaw: (storeRes.data as Record<string, unknown>) ?? { store_name: "Loja" },
  }
}
