/**
 * Email Generation Service — orquestrador principal.
 *
 * Fluxo:
 * 1. loadGenerationContext() — brand, briefing, blueprint, top_products, agent configs
 * 2. seedBlocksFromBlueprint() — cria blocos (determinístico)
 * 3. createCopyChain() → invoke → parse → PATCH blocos + PATCH email subject/preheader
 * 4. Se generate_images: generateEmailImage() → PATCH bloco
 * 5. createHtmlChain() → invoke → PATCH email.html
 * 6. Atualiza email status pra "in_progress"
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
import type { EmailAgentConfig, EmailBlueprint } from "@/types/email-generation"
import { DEFAULT_BLUEPRINTS } from "./email-blueprint"
import { seedBlocksFromBlueprint, type SeededBlock } from "./seed-blocks"
import {
  createCopyChain,
  DEFAULT_COPY_SYSTEM_PROMPT,
  DEFAULT_COPY_USER_TEMPLATE,
} from "./chains/copy.chain"
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
import { CopyOutputSchema } from "./schemas/copy-output.schema"
import {
  logGenerationRun,
  computeCostCents,
} from "./callbacks/telemetry.callback"

const log = logger.child("EmailGeneration")

// ── Types ───────────────────────────────────────────────────

interface GenerateEmailParams {
  storeId: string
  flowId: string
  emailId: string
  flowType: string
  emailNumber: number
  triggeredBy: string
  batchId: string
}

interface GenerationContext {
  brand: StoreBrandIdentity | null
  briefing: StoreBriefing | null
  blueprint: EmailBlueprint | null
  topProducts: TopProduct[]
  settings: {
    generate_images: boolean
    max_parallel: number
  }
  agentConfigs: {
    copy: EmailAgentConfig | null
    image: EmailAgentConfig | null
    html: EmailAgentConfig | null
  }
  store: {
    store_name: string
    store_url: string | null
    niche: string | null
  }
}

// ── Main function ───────────────────────────────────────────

export async function generateEmail(
  params: GenerateEmailParams,
): Promise<{ status: "done" | "error"; error?: string }> {
  const { storeId, flowId, emailId, flowType, emailNumber, triggeredBy, batchId } = params
  const admin = createAdminClient()
  log.info("generation.start", { storeId, flowId, emailId, flowType, emailNumber, batchId })

  try {
    // ── Step 0: Load context ──────────────────────────────────
    const ctx = await loadGenerationContext(storeId, flowType, emailNumber)

    // ── Step 1: Seed blocks ───────────────────────────────────
    const seedT0 = Date.now()
    let seededBlocks: SeededBlock[]
    try {
      const seedResult = await seedBlocksFromBlueprint(emailId, flowType, emailNumber)
      seededBlocks = seedResult.blocks
      await logGenerationRun({
        storeId,
        flowId,
        emailId,
        triggeredBy,
        batchId,
        agent: "seed",
        status: "success",
        durationMs: Date.now() - seedT0,
        parsedOutput: { blockCount: seededBlocks.length },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro no seed"
      await logGenerationRun({
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
      return { status: "error", error: `Seed failed: ${msg}` }
    }

    // ── Step 2: Copy generation ───────────────────────────────
    const copyT0 = Date.now()
    try {
      const copyConfig = ctx.agentConfigs.copy
      const model = copyConfig?.model ?? "claude-sonnet-4-5-20250514"
      const temperature = copyConfig?.temperature ?? 0.7
      const maxTokens = copyConfig?.max_tokens ?? 4096
      const systemPrompt = copyConfig?.system_prompt ?? DEFAULT_COPY_SYSTEM_PROMPT
      const userTemplate = copyConfig?.user_template ?? DEFAULT_COPY_USER_TEMPLATE

      // Resolve blueprint data
      const blueprintData = ctx.blueprint
        ? { objective: ctx.blueprint.objective, messaging: ctx.blueprint.messaging }
        : DEFAULT_BLUEPRINTS[flowType]?.[emailNumber]
          ? {
              objective: DEFAULT_BLUEPRINTS[flowType][emailNumber].objective,
              messaging: DEFAULT_BLUEPRINTS[flowType][emailNumber].messaging,
            }
          : { objective: "Gerar email de qualidade", messaging: "Conteúdo relevante para o público" }

      // Build input vars
      const marca = ctx.briefing?.marca ?? {}
      const briefingDetail = ctx.briefing?.briefing ?? {}
      const inputVars: Record<string, string> = {
        brand_name: ctx.store.store_name,
        slogan: marca.slogan ?? "",
        tom_voz: marca.tom_voz ?? "casual",
        persona: marca.persona ?? "",
        diferencial: marca.diferencial ?? "",
        restricoes: (briefingDetail.restricoes ?? []).join(", "),
        posicionamento: marca.posicionamento ?? "medio",
        top_products: ctx.topProducts.length > 0
          ? JSON.stringify(
              ctx.topProducts.map((p) => ({
                name: p.name,
                price: p.price,
                image_url: p.image_url,
                url: p.url ?? "",
              })),
              null,
              2,
            )
          : "Nenhum produto disponível",
        flow_type: flowType,
        email_number: String(emailNumber),
        objective: blueprintData.objective,
        messaging: blueprintData.messaging,
        blocks_json: JSON.stringify(
          seededBlocks.map((b) => ({
            position: b.position,
            type: b.block_type,
            label: b.label,
            purpose: b.purpose,
          })),
          null,
          2,
        ),
      }

      const chain = createCopyChain({
        model,
        temperature,
        max_tokens: maxTokens,
        system_prompt: systemPrompt,
        user_template: userTemplate,
      })

      const rawOutput = await chain.invoke(inputVars)

      // Parse JSON from output
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("Copy agent não retornou JSON válido")

      const cleaned = jsonMatch[0]
      const parsed = JSON.parse(cleaned)
      const copyOutput = CopyOutputSchema.parse(parsed)

      // Estimate tokens (rough: 1 token ≈ 4 chars)
      const promptText = systemPrompt + JSON.stringify(inputVars)
      const tokensInput = Math.ceil(promptText.length / 4)
      const tokensOutput = Math.ceil(rawOutput.length / 4)

      await logGenerationRun({
        storeId,
        flowId,
        emailId,
        triggeredBy,
        batchId,
        agent: "copy",
        agentConfigId: copyConfig?.id,
        status: "success",
        model,
        inputVars,
        rawOutput,
        parsedOutput: parsed as Record<string, unknown>,
        tokensInput,
        tokensOutput,
        costCents: computeCostCents(model, tokensInput, tokensOutput),
        durationMs: Date.now() - copyT0,
      })

      // PATCH email subject/preheader
      await admin
        .from("email_flow_emails")
        .update({
          subject: copyOutput.subject,
          preheader: copyOutput.preheader,
        })
        .eq("id", emailId)

      // PATCH each block content
      for (const blockData of copyOutput.blocks) {
        const matchingBlock = seededBlocks.find((b) => b.position === blockData.position)
        if (matchingBlock) {
          await admin
            .from("email_blocks")
            .update({ content: blockData.content })
            .eq("id", matchingBlock.id)
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro na copy"
      log.error("generation.copy.error", { emailId, error: msg })
      await logGenerationRun({
        storeId,
        flowId,
        emailId,
        triggeredBy,
        batchId,
        agent: "copy",
        agentConfigId: ctx.agentConfigs.copy?.id,
        status: "error",
        durationMs: Date.now() - copyT0,
        errorMessage: msg,
        errorStack: err instanceof Error ? err.stack : undefined,
      })
      return { status: "error", error: `Copy failed: ${msg}` }
    }

    // ── Step 3: Image generation (optional) ───────────────────
    if (ctx.settings.generate_images) {
      const imageBlocks = seededBlocks.filter((b) => b.needs_image)
      for (const imgBlock of imageBlocks) {
        const imgT0 = Date.now()
        try {
          const marca = ctx.briefing?.marca ?? {}
          const primaryColors = (ctx.brand?.colors_primary ?? [])
            .map((c) => c.hex)
            .join(", ") || "#000000"

          const promptVars: Record<string, string> = {
            brand_name: ctx.store.store_name,
            nicho: marca.nicho ?? "",
            posicionamento: marca.posicionamento ?? "medio",
            tom_voz: marca.tom_voz ?? "casual",
            primary_colors: primaryColors,
            block_purpose: imgBlock.purpose,
          }

          const prompt = renderImagePrompt(DEFAULT_IMAGE_PROMPT_TEMPLATE, promptVars)
          const imageUrl = await generateEmailImage(prompt, storeId)

          // PATCH bloco com image_url
          await admin
            .from("email_blocks")
            .update({
              content: { image_url: imageUrl, image_alt: imgBlock.label },
            })
            .eq("id", imgBlock.id)

          await logGenerationRun({
            storeId,
            flowId,
            emailId,
            triggeredBy,
            batchId,
            agent: "image",
            status: "success",
            model: "gpt-image-1",
            durationMs: Date.now() - imgT0,
            parsedOutput: { blockId: imgBlock.id, imageUrl },
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Erro na imagem"
          log.warn("generation.image.error", { emailId, blockId: imgBlock.id, error: msg })
          await logGenerationRun({
            storeId,
            flowId,
            emailId,
            triggeredBy,
            batchId,
            agent: "image",
            status: "error",
            model: "gpt-image-1",
            durationMs: Date.now() - imgT0,
            errorMessage: msg,
            errorStack: err instanceof Error ? err.stack : undefined,
          })
          // Não aborta — imagem é opcional
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

    // ── Step 4: HTML generation ───────────────────────────────
    const htmlT0 = Date.now()
    try {
      const htmlConfig = ctx.agentConfigs.html
      const model = htmlConfig?.model ?? "claude-sonnet-4-5-20250514"
      const temperature = htmlConfig?.temperature ?? 0.3
      const maxTokens = htmlConfig?.max_tokens ?? 8192
      const systemPrompt = htmlConfig?.system_prompt ?? DEFAULT_HTML_SYSTEM_PROMPT
      const userTemplate = htmlConfig?.user_template ?? DEFAULT_HTML_USER_TEMPLATE

      // Reload blocks with updated content
      const { data: updatedBlocks } = await admin
        .from("email_blocks")
        .select("*")
        .eq("email_id", emailId)
        .order("position", { ascending: true })

      // Reload email for subject/preheader
      const { data: updatedEmail } = await admin
        .from("email_flow_emails")
        .select("subject, preheader, name")
        .eq("id", emailId)
        .single()

      const primaryColor =
        ctx.brand?.colors_primary?.[0]?.hex ?? "#1F1F1F"
      const secondaryColor =
        ctx.brand?.colors_secondary?.[0]?.hex ?? "#F0F0F0"

      const inputVars: Record<string, string> = {
        brand_name: ctx.store.store_name,
        logo_url: ctx.brand?.logo_main_png ?? ctx.brand?.logo_main_svg ?? "",
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        font_heading: ctx.brand?.font_heading ?? "Arial",
        font_body: ctx.brand?.font_body ?? "Arial",
        email_name: updatedEmail?.name ?? "",
        subject: (updatedEmail?.subject as string) ?? "",
        preheader: (updatedEmail?.preheader as string) ?? "",
        blocks_with_content: JSON.stringify(
          (updatedBlocks ?? []).map((b) => ({
            position: b.position,
            type: b.block_type,
            label: b.label,
            content: b.content,
          })),
          null,
          2,
        ),
        top_products:
          ctx.topProducts.length > 0
            ? JSON.stringify(
                ctx.topProducts.map((p) => ({
                  name: p.name,
                  price: p.price,
                  image_url: p.image_url,
                  url: p.url ?? "",
                })),
                null,
                2,
              )
            : "Sem produtos",
      }

      const chain = createHtmlChain({
        model,
        temperature,
        max_tokens: maxTokens,
        system_prompt: systemPrompt,
        user_template: userTemplate,
      })

      let rawHtml = await chain.invoke(inputVars)

      // Strip markdown fences se vieram
      rawHtml = rawHtml
        .replace(/^```html\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim()

      // Estimate tokens
      const promptText = systemPrompt + JSON.stringify(inputVars)
      const tokensInput = Math.ceil(promptText.length / 4)
      const tokensOutput = Math.ceil(rawHtml.length / 4)

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
        rawOutput: rawHtml.slice(0, 2000),
        tokensInput,
        tokensOutput,
        costCents: computeCostCents(model, tokensInput, tokensOutput),
        durationMs: Date.now() - htmlT0,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro no HTML"
      log.error("generation.html.error", { emailId, error: msg })
      await logGenerationRun({
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
      return { status: "error", error: `HTML failed: ${msg}` }
    }

    // ── Step 5: Update email status ───────────────────────────
    await admin
      .from("email_flow_emails")
      .update({ status: "in_progress" })
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

  // Parallelizar todas as queries
  const [
    storeRes,
    brandRes,
    briefingRes,
    blueprintRes,
    topProductsRes,
    settingsRes,
    copyConfigRes,
    htmlConfigRes,
  ] = await Promise.all([
    // Store info
    admin
      .from("client_stores")
      .select("store_name, store_url, niche")
      .eq("id", storeId)
      .single(),

    // Brand identity
    admin
      .from("store_brand_identities")
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

    // Blueprint
    admin
      .from("email_blueprints")
      .select("*")
      .eq("flow_type", flowType)
      .eq("email_number", emailNumber)
      .maybeSingle(),

    // Top products
    admin
      .from("store_brand_identities")
      .select("top_products")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Generation settings
    admin
      .from("email_generation_settings")
      .select("generate_images, max_parallel")
      .limit(1)
      .maybeSingle(),

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
  ])

  const store = storeRes.data
    ? {
        store_name: storeRes.data.store_name as string,
        store_url: storeRes.data.store_url as string | null,
        niche: storeRes.data.niche as string | null,
      }
    : { store_name: "Loja", store_url: null, niche: null }

  return {
    brand: (brandRes.data as StoreBrandIdentity | null) ?? null,
    briefing: (briefingRes.data as StoreBriefing | null) ?? null,
    blueprint: (blueprintRes.data as EmailBlueprint | null) ?? null,
    topProducts: ((topProductsRes.data?.top_products as TopProduct[]) ?? []),
    settings: {
      generate_images: (settingsRes.data?.generate_images as boolean) ?? false,
      max_parallel: (settingsRes.data?.max_parallel as number) ?? 2,
    },
    agentConfigs: {
      copy: (copyConfigRes.data as EmailAgentConfig | null) ?? null,
      image: null, // Image uses OpenAI, not configurable agent
      html: (htmlConfigRes.data as EmailAgentConfig | null) ?? null,
    },
    store,
  }
}
