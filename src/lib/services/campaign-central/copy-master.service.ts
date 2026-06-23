/**
 * Geração da copy MASTER de uma campanha — a versão canônica que será
 * adaptada por loja depois. Duas vias:
 *
 * 1. generateMasterFromAngle: chama IA com angle/trigger/audience e
 *    monta o email completo (subject + preheader + strategy + blocks).
 *    Prompt versionado em email_agent_configs (agent_type =
 *    'campaign_copy_master').
 *
 * 2. setMasterFromStructure: usa o texto da "Estrutura & tom da copy"
 *    (brief) como master preservando-o LITERALMENTE — sem a IA reescrever
 *    (o COO já escreveu a copy; só a embrulhamos num bloco de texto).
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

/**
 * Monta a copy master a partir do texto LITERAL da "Estrutura & tom da copy"
 * (brief), SEM passar pela IA. O COO já escreveu a copy — preservamos o texto
 * exatamente como está, num único bloco de `text`. subject/preheader/strategy
 * ficam vazios de propósito: têm campo dedicado próprio na fase de produção e
 * não devem se misturar ao corpo. Função pura (sem I/O) — testável isolada.
 */
export function buildLiteralMaster(rawText: string): EmailDraft {
  return {
    subject: "",
    preheader: "",
    strategy: "",
    blocks: [{ id: newBlockId(), type: "text", value: rawText.trim() }],
  }
}

/**
 * Usa o texto da "Estrutura & tom da copy" como copy master preservando-o
 * LITERALMENTE — sem a IA reescrever. Persiste em
 * campaign_suggestions.email_draft. Registra em campaign_ai_runs (kind=
 * 'copy_parse') só como auditoria de que o COO usou a estrutura; não há chamada
 * de IA aqui, então model/raw_output ficam nulos.
 */
export async function setMasterFromStructure(params: {
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
  let runStatus: "completed" | "failed" = "completed"
  let errorMessage: string | null = null
  let draft: EmailDraft | null = null

  try {
    const candidate = buildLiteralMaster(rawText)
    const validation = emailDraftSchema.safeParse(candidate)
    if (!validation.success) {
      runStatus = "failed"
      errorMessage = validation.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")
    } else {
      const { error: updateErr } = await admin
        .from("campaign_suggestions")
        .update({ email_draft: validation.data })
        .eq("id", suggestionId)
      if (updateErr) {
        runStatus = "failed"
        errorMessage = updateErr.message
      } else {
        draft = validation.data
      }
    }
  } catch (err) {
    runStatus = "failed"
    errorMessage = err instanceof Error ? err.message : String(err)
    log.error("master.structure_failed", { suggestionId, error: errorMessage })
  }

  await admin.from("campaign_ai_runs").insert({
    org_id: orgId,
    cycle_id: row.cycle_id,
    suggestion_id: suggestionId,
    kind: "copy_parse",
    model: null,
    status: runStatus,
    input_vars: { raw_text_length: rawText.length },
    raw_output: null,
    parsed_output: draft,
    error_message: errorMessage,
    duration_ms: Date.now() - t0,
  })

  if (draft) return { ok: true, draft }
  return { ok: false, error: errorMessage ?? "Falha desconhecida" }
}
