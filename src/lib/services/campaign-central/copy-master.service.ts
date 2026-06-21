/**
 * Geração da copy MASTER de uma campanha — a versão canônica que será
 * adaptada por loja depois. Duas vias:
 *
 * 1. generateMasterFromAngle: chama IA com angle/trigger/audience e
 *    monta o email completo (subject + preheader + strategy + blocks).
 *    Prompt versionado em email_agent_configs (agent_type =
 *    'campaign_copy_master').
 *
 * 2. parseMasterFromText: usa IA pra converter texto bruto colado pelo
 *    COO (do Claude, ChatGPT, qualquer lugar) em estrutura de blocks
 *    compatível com o builder.
 *
 * Persiste em campaign_suggestions.email_draft. Telemetria em
 * campaign_ai_runs (kind='copy_master' | 'copy_parse').
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { callAnthropicJson } from "./anthropic-client"
import { buildBriefSection } from "./campaign-copy.service"
import { emailDraftSchema } from "@/lib/validations/campaign-central"
import { newBlockId } from "@/components/campaign-central/email-builder/default-draft"
import type { CampaignSuggestion, EmailDraft, EmailDraftBlock } from "@/types/campaign-central"

const log = logger.child("CampaignCopyMaster")

const FALLBACK_MODEL = "claude-sonnet-4-6"

interface AgentConfig {
  id: string
  model: string
  system_prompt: string
  user_template: string
  temperature: number | null
  max_tokens: number | null
  output_schema: Record<string, unknown> | null
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, expr) => vars[expr.trim()] ?? "")
}

async function loadAgentConfig(
  admin: ReturnType<typeof createAdminClient>,
): Promise<AgentConfig | null> {
  const { data } = await admin
    .from("email_agent_configs")
    .select("id, model, system_prompt, user_template, temperature, max_tokens, output_schema")
    .eq("agent_type", "campaign_copy_master")
    .eq("is_active", true)
    .maybeSingle()
  return (data as AgentConfig | null) ?? null
}

/**
 * Garante que cada bloco do output da IA tem id válido (a IA não precisa
 * gerar id — geramos no servidor).
 */
function withIds(blocks: Array<Omit<EmailDraftBlock, "id"> & { id?: string }>): EmailDraftBlock[] {
  return blocks.map((b) => ({ ...b, id: b.id ?? newBlockId() }) as EmailDraftBlock)
}

function buildMasterVars(s: CampaignSuggestion, audienceOverride?: string): Record<string, string> {
  const countries = Array.from(new Set(s.targets.map((t) => t.country).filter(Boolean))).join(", ")
  return {
    title: s.title,
    type: s.type,
    confidence: String(s.confidence ?? "—"),
    audience_label: audienceOverride || s.audience_label || s.target_summary || "—",
    trigger_label: s.trigger?.label ?? "—",
    trigger_detail: s.trigger?.detail ?? "—",
    trigger_source: s.trigger?.source ?? "—",
    angle: s.angle ?? "—",
    subject: s.subject ?? "—",
    send_date: s.send_date ?? "—",
    targets_summary: s.target_summary || `${s.targets.length} loja(s)`,
    countries: countries || "—",
  }
}

interface RunResult {
  ok: boolean
  draft?: EmailDraft
  error?: string
}

export async function generateMasterFromAngle(params: {
  suggestionId: string
  orgId: string
  audienceLabel?: string
}): Promise<RunResult> {
  const admin = createAdminClient()
  const { suggestionId, orgId, audienceLabel } = params

  const { data: row } = await admin
    .from("campaign_suggestions")
    .select("*")
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!row) return { ok: false, error: "Sugestão não encontrada" }
  const suggestion = row as CampaignSuggestion

  const config = await loadAgentConfig(admin)
  if (!config) {
    return {
      ok: false,
      error: "Config 'campaign_copy_master' ausente ou inativa em email_agent_configs",
    }
  }

  const vars = buildMasterVars(suggestion, audienceLabel)
  // Brief do COO guia a ESTRUTURA dos blocks da master (antes da adaptação
  // por loja). Seção ADITIVA: anexada ao fim do user prompt, vazia se não há
  // brief. Não altera o user_template versionado nem o schema de output.
  const briefSection = buildBriefSection(suggestion.brief)
  const userPrompt =
    briefSection.length > 0
      ? `${renderTemplate(config.user_template, vars)}\n${briefSection.join("\n")}`
      : renderTemplate(config.user_template, vars)

  const t0 = Date.now()
  let runStatus: "completed" | "failed" | "invalid_output" = "completed"
  let errorMessage: string | null = null
  let rawOutput: string | null = null
  let parsedOutput: unknown = null
  let draft: EmailDraft | null = null

  try {
    const result = await callAnthropicJson({
      model: config.model || FALLBACK_MODEL,
      system: config.system_prompt,
      user: userPrompt,
      maxTokens: config.max_tokens ?? 4000,
      temperature: config.temperature ?? 0.8,
      outputSchema: config.output_schema ?? {
        type: "object",
        required: ["subject", "preheader", "strategy", "blocks"],
      },
    })
    rawOutput = result.rawText

    if (!result.parsed) {
      runStatus = "invalid_output"
      errorMessage = result.parseError ?? "Output sem JSON"
    } else {
      const candidate = result.parsed as {
        subject?: string
        preheader?: string
        strategy?: string
        blocks?: Array<Omit<EmailDraftBlock, "id"> & { id?: string }>
      }
      const enriched = {
        subject: candidate.subject ?? "",
        preheader: candidate.preheader ?? "",
        strategy: candidate.strategy ?? "",
        blocks: withIds(candidate.blocks ?? []),
      }
      const validation = emailDraftSchema.safeParse(enriched)
      if (!validation.success) {
        runStatus = "invalid_output"
        errorMessage = validation.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")
      } else {
        draft = validation.data
        parsedOutput = validation.data
      }
    }

    if (draft) {
      const patch: Record<string, unknown> = { email_draft: draft }
      if (audienceLabel && audienceLabel !== suggestion.audience_label) {
        patch.audience_label = audienceLabel
      }
      const { error: updateErr } = await admin
        .from("campaign_suggestions")
        .update(patch)
        .eq("id", suggestionId)
      if (updateErr) {
        runStatus = "failed"
        errorMessage = updateErr.message
        draft = null
      }
    }
  } catch (err) {
    runStatus = "failed"
    errorMessage = err instanceof Error ? err.message : String(err)
    log.error("master.generate_failed", { suggestionId, error: errorMessage })
  }

  await admin.from("campaign_ai_runs").insert({
    org_id: orgId,
    cycle_id: suggestion.cycle_id,
    suggestion_id: suggestionId,
    kind: "copy_master",
    agent_config_id: config.id,
    model: config.model || FALLBACK_MODEL,
    status: runStatus,
    input_vars: { audience_label: vars.audience_label },
    raw_output: rawOutput,
    parsed_output: parsedOutput,
    error_message: errorMessage,
    duration_ms: Date.now() - t0,
  })

  if (draft) return { ok: true, draft }
  return { ok: false, error: errorMessage ?? "Falha desconhecida" }
}

const PARSE_SYSTEM_PROMPT = `Você é um parser de copy de email. Recebe texto bruto colado por um copywriter (do Claude, ChatGPT, Google Docs etc) e converte em estrutura de blocos compatível com nosso builder.

REGRAS:
1. Identifique no texto: subject (assunto), preheader (preview text), strategy (uma explicação curta da estratégia se houver), e os blocos do corpo.
2. Tipos de bloco disponíveis: 'image' (placeholders visuais — caption descritiva), 'heading' (título com subtítulo), 'text' (parágrafo de corpo), 'offer' (oferta destacada com cupom/desconto), 'button' (CTA), 'divider' (linha divisória), 'footer' (rodapé), 'products' (grid de produtos — 2 ou 3 colunas, items com name+price).
3. Se o texto NÃO indicar uma imagem hero explicitamente, ASSUMA que existe e inclua um bloco 'image' com caption descritiva no topo.
4. Se mencionar produtos numerados ou em lista, gere um bloco 'products' com items extraídos (name+price). Se não houver produtos explícitos, inclua um bloco products placeholder com 3 items genéricos.
5. CTAs como "Compre agora", "Ver coleção", "Garantir" viram blocos 'button'.
6. Frases tipo "Frete grátis até R$ 199", "15% OFF com cupom X" viram blocos 'offer'.
7. Marcadores tipo "🎯 HERO", "📝 BODY", "🛍️ PRODUTOS", "ℹ️ INFO", "🎯 CTA" são pistas de seção — use-os como guia, mas não inclua os emojis nos textos.
8. Mantenha o texto original sempre que possível, sem reescrever. Só corte emojis das marcações de seção (não dos textos em si).
9. Subject e preheader: se não encontrar explicitamente, deixe vazio.

OUTPUT: JSON {subject, preheader, strategy, blocks: [...]}. APENAS o JSON, sem markdown.`

const PARSE_OUTPUT_SCHEMA = {
  type: "object",
  required: ["subject", "preheader", "strategy", "blocks"],
  properties: {
    subject: { type: "string" },
    preheader: { type: "string" },
    strategy: { type: "string" },
    blocks: {
      type: "array",
      items: {
        type: "object",
        required: ["type"],
        properties: {
          type: {
            type: "string",
            enum: ["image", "heading", "text", "offer", "button", "divider", "footer", "products"],
          },
          headline: { type: "string" },
          sub: { type: "string" },
          value: { type: "string" },
          caption: { type: "string" },
          columns: { type: "number" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                price: { type: "string" },
                image_caption: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const

export async function parseMasterFromText(params: {
  suggestionId: string
  orgId: string
  rawText: string
}): Promise<RunResult> {
  const admin = createAdminClient()
  const { suggestionId, orgId, rawText } = params

  const { data: row } = await admin
    .from("campaign_suggestions")
    .select("id, cycle_id")
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!row) return { ok: false, error: "Sugestão não encontrada" }

  const t0 = Date.now()
  let runStatus: "completed" | "failed" | "invalid_output" = "completed"
  let errorMessage: string | null = null
  let rawOutput: string | null = null
  let parsedOutput: unknown = null
  let draft: EmailDraft | null = null

  try {
    const result = await callAnthropicJson({
      model: FALLBACK_MODEL,
      system: PARSE_SYSTEM_PROMPT,
      user: `Texto a parsear:\n\n---\n${rawText}\n---`,
      maxTokens: 4000,
      temperature: 0.2,
      outputSchema: PARSE_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
    })
    rawOutput = result.rawText

    if (!result.parsed) {
      runStatus = "invalid_output"
      errorMessage = result.parseError ?? "Output sem JSON"
    } else {
      const candidate = result.parsed as {
        subject?: string
        preheader?: string
        strategy?: string
        blocks?: Array<Omit<EmailDraftBlock, "id"> & { id?: string }>
      }
      const enriched = {
        subject: candidate.subject ?? "",
        preheader: candidate.preheader ?? "",
        strategy: candidate.strategy ?? "",
        blocks: withIds(candidate.blocks ?? []),
      }
      const validation = emailDraftSchema.safeParse(enriched)
      if (!validation.success) {
        runStatus = "invalid_output"
        errorMessage = validation.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")
      } else {
        draft = validation.data
        parsedOutput = validation.data
      }
    }

    if (draft) {
      const { error: updateErr } = await admin
        .from("campaign_suggestions")
        .update({ email_draft: draft })
        .eq("id", suggestionId)
      if (updateErr) {
        runStatus = "failed"
        errorMessage = updateErr.message
        draft = null
      }
    }
  } catch (err) {
    runStatus = "failed"
    errorMessage = err instanceof Error ? err.message : String(err)
    log.error("master.parse_failed", { suggestionId, error: errorMessage })
  }

  await admin.from("campaign_ai_runs").insert({
    org_id: orgId,
    cycle_id: row.cycle_id,
    suggestion_id: suggestionId,
    kind: "copy_parse",
    model: FALLBACK_MODEL,
    status: runStatus,
    input_vars: { raw_text_length: rawText.length },
    raw_output: rawOutput,
    parsed_output: parsedOutput,
    error_message: errorMessage,
    duration_ms: Date.now() - t0,
  })

  if (draft) return { ok: true, draft }
  return { ok: false, error: errorMessage ?? "Falha desconhecida" }
}
