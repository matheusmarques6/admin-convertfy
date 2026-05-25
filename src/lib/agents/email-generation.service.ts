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

function buildAllVars(ctx: GenerationContext): Record<string, string> {
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
    vars.logo_url = b.logo_main_png ?? b.logo_main_svg ?? ""
    vars.logo_alt_url = b.logo_alt_png ?? b.logo_alt_svg ?? ""
    vars.primary_color = (b.colors_primary ?? [])[0]?.hex ?? "#1F1F1F"
    vars.secondary_color = (b.colors_secondary ?? [])[0]?.hex ?? "#F0F0F0"
    vars.primary_colors = (b.colors_primary ?? []).map((c) => c.hex).join(", ") || "#1F1F1F"
    vars.primary_color_names = (b.colors_primary ?? []).map((c) => c.name).join(", ")
    vars.secondary_colors = (b.colors_secondary ?? []).map((c) => c.hex).join(", ") || "#F0F0F0"
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

  // 6) Reference HTML
  vars.reference_html = ctx.referenceHtml ?? ""

  return vars
}

function extractCopyJson(raw: string) {
  // 1) Strip ALL markdown fences anywhere in the string
  let text = raw.replace(/```(?:json)?\s*/gi, "").trim()

  // 2) Try direct parse first (cleanest case)
  try {
    return CopyOutputSchema.parse(JSON.parse(text))
  } catch { /* continue */ }

  // 3) Find JSON by matching balanced braces
  const start = text.indexOf("{")
  if (start === -1) {
    log.error("copy.no_json", { rawOutput: raw.slice(0, 1000) })
    throw new Error(`Copy não retornou JSON. Resposta: ${raw.slice(0, 300)}`)
  }

  let depth = 0
  let end = -1
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++
    else if (text[i] === "}") {
      depth--
      if (depth === 0) { end = i + 1; break }
    }
  }

  if (end === -1) end = text.length
  const jsonStr = text.slice(start, end)

  try {
    return CopyOutputSchema.parse(JSON.parse(jsonStr))
  } catch (parseErr) {
    log.error("copy.json_parse_error", { rawOutput: raw.slice(0, 1000), jsonStr: jsonStr.slice(0, 500) })
    throw new Error(`Copy JSON inválido: ${(parseErr as Error).message}. Resposta: ${raw.slice(0, 300)}`)
  }
}

function fillMissingVars(
  inputVars: Record<string, string>,
  systemPrompt: string,
  userTemplate: string,
): Record<string, string> {
  const varPattern = /\{(\w+)\}/g
  const combined = systemPrompt + userTemplate
  let match: RegExpExecArray | null
  while ((match = varPattern.exec(combined)) !== null) {
    const key = match[1]
    if (!(key in inputVars)) {
      inputVars[key] = ""
    }
  }
  return inputVars
}

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
  referenceHtml: string | null
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

      // Build input vars from ALL data sources
      const inputVars = buildAllVars(ctx)
      // Email-specific context
      inputVars.flow_type = flowType
      inputVars.email_number = String(emailNumber)
      inputVars.objective = blueprintData.objective
      inputVars.messaging = blueprintData.messaging
      inputVars.blocks_json = JSON.stringify(
        seededBlocks.map((b) => ({
          position: b.position,
          type: b.block_type,
          label: b.label,
          purpose: b.purpose,
        })),
        null,
        2,
      )

      fillMissingVars(inputVars, systemPrompt, userTemplate)

      const chain = createCopyChain({
        model,
        temperature,
        max_tokens: maxTokens,
        system_prompt: systemPrompt,
        user_template: userTemplate,
      })

      const rawOutput = await chain.invoke(inputVars)

      // Estimate tokens (rough: 1 token ≈ 4 chars)
      const promptText = systemPrompt + JSON.stringify(inputVars)
      const tokensInput = Math.ceil(promptText.length / 4)
      const tokensOutput = Math.ceil(rawOutput.length / 4)

      // Try JSON parse — se falhar, tratar como texto livre
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/)
      let copySubject: string | null = null
      let copyPreheader: string | null = null

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          const copyOutput = CopyOutputSchema.parse(parsed)
          copySubject = copyOutput.subject
          copyPreheader = copyOutput.preheader

          for (const blockData of copyOutput.blocks) {
            const matchingBlock = seededBlocks.find((b) => b.position === blockData.position)
            if (matchingBlock) {
              await admin
                .from("email_blocks")
                .update({ content: blockData.content })
                .eq("id", matchingBlock.id)
            }
          }
        } catch {
          // JSON parse failed — output é texto livre, continua abaixo
        }
      }

      // Se não veio JSON estruturado, extrair subject/preheader do texto
      if (!copySubject) {
        const subjectMatch = rawOutput.match(/Subject:\s*(.+)/i)
        const preheaderMatch = rawOutput.match(/(?:Preview|Preheader):\s*(.+)/i)
        copySubject = subjectMatch?.[1]?.trim() ?? null
        copyPreheader = preheaderMatch?.[1]?.trim() ?? null

        // Salvar output inteiro como conteúdo do primeiro bloco
        const firstBlock = seededBlocks[0]
        if (firstBlock) {
          await admin
            .from("email_blocks")
            .update({ content: { body: rawOutput } })
            .eq("id", firstBlock.id)
        }
      }

      // PATCH email subject/preheader
      if (copySubject || copyPreheader) {
        const updateFields: Record<string, string> = {}
        if (copySubject) updateFields.subject = copySubject
        if (copyPreheader) updateFields.preheader = copyPreheader
        await admin
          .from("email_flow_emails")
          .update(updateFields)
          .eq("id", emailId)
      }

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
        parsedOutput: { subject: copySubject, preheader: copyPreheader },
        tokensInput,
        tokensOutput,
        costCents: computeCostCents(model, tokensInput, tokensOutput),
        durationMs: Date.now() - copyT0,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro na copy"
      log.error("generation.copy.error", { emailId, error: msg })
      const copyRunId = await logGenerationRun({
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
      notifyGenerationError({
        runId: copyRunId,
        storeId,
        storeName: (ctx.storeRaw.store_name as string) ?? "Loja",
        emailName: `Flow ${flowType} #${emailNumber}`,
        agent: "copy",
        model: ctx.agentConfigs.copy?.model ?? "claude-sonnet-4-5-20250514",
        error: msg,
        durationMs: Date.now() - copyT0,
        costCents: 0,
      }).catch(() => {})
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
            brand_name: (ctx.storeRaw.store_name as string) ?? "Loja",
            nicho: marca.nicho ?? "",
            posicionamento: marca.posicionamento ?? "medio",
            tom_voz: marca.tom_voz ?? "casual",
            primary_colors: primaryColors,
            block_purpose: imgBlock.purpose,
          }

          const prompt = renderImagePrompt(DEFAULT_IMAGE_PROMPT_TEMPLATE, promptVars)
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
            storeId,
            flowId,
            emailId,
            triggeredBy,
            batchId,
            agent: "image",
            status: "success",
            model: "gpt-image-2",
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
            model: "gpt-image-2",
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

      // Build input vars from ALL data sources
      const inputVars = buildAllVars(ctx)
      // HTML-specific context
      inputVars.email_name = updatedEmail?.name ?? ""
      inputVars.subject = (updatedEmail?.subject as string) ?? ""
      inputVars.preheader = (updatedEmail?.preheader as string) ?? ""
      inputVars.blocks_with_content = JSON.stringify(
        (updatedBlocks ?? []).map((b) => ({
          position: b.position,
          type: b.block_type,
          label: b.label,
          content: b.content,
        })),
        null,
        2,
      )

      fillMissingVars(inputVars, systemPrompt, userTemplate)

      const chain = createHtmlChain({
        model,
        temperature,
        max_tokens: maxTokens,
        system_prompt: systemPrompt,
        user_template: userTemplate,
      })

      let rawHtml = await chain.invoke(inputVars)

      // Strip markdown fences (qualquer posição)
      rawHtml = rawHtml
        .replace(/```(?:html)?\s*/gi, "")
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
    refTemplateRes,
  ] = await Promise.all([
    // Store info — SELECT * para que qualquer campo fique disponível como variável
    admin
      .from("client_stores")
      .select("*")
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

    // Reference template for flow_type
    admin
      .from("email_reference_templates")
      .select("html")
      .eq("flow_type", flowType)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return {
    brand: (brandRes.data as StoreBrandIdentity | null) ?? null,
    briefing: (briefingRes.data as StoreBriefing | null) ?? null,
    blueprint: (blueprintRes.data as EmailBlueprint | null) ?? null,
    topProducts: ((topProductsRes.data?.top_products as TopProduct[]) ?? []),
    referenceHtml: (refTemplateRes.data?.html as string | null) ?? null,
    settings: {
      generate_images: (settingsRes.data?.generate_images as boolean) ?? false,
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
