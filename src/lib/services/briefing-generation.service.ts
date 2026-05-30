/**
 * Briefing Generation Service — cascata de fallback 3 tentativas.
 *
 * T1 (40s): Anthropic SDK direto, Claude Sonnet 4.6
 * T2 (20s): OpenRouter (OpenAI-compatible), Claude Sonnet 4.6
 * T3 (~0s): template determinístico baseado em form_responses
 *
 * Budget total worst-case: ≤60s até saveBriefing. Cliente faz polling
 * com timeout 75s — nunca deve ver "demorou demais".
 *
 * Recovery: briefing_started_at permite detectar geracoes stuck.
 * briefing_generated_by registra qual etapa produziu o briefing.
 */

import Anthropic from "@anthropic-ai/sdk"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type {
  BriefingContent,
  BriefingSource,
} from "@/types/onboarding-pipeline"

const log = logger.child("BriefingGeneration")

const T1_TIMEOUT_MS = 40_000
const T2_TIMEOUT_MS = 20_000
const ANTHROPIC_MODEL = "claude-sonnet-4-6"
// T2 usa modelo OpenAI via OpenRouter (diversidade de provedor — se Anthropic
// estiver instável, OpenAI assume). Slug exato do OpenRouter:
// https://openrouter.ai/openai/gpt-5.3-chat
const OPENROUTER_MODEL = "openai/gpt-5.3-chat"
// 4096 dá folga pros 5 campos com 2-5 frases cada (briefing típico ~600
// tokens, mas casos premium/longos podiam estourar 2048 antes). Custo
// marginal mínimo — o que importa é não truncar JSON no meio.
const MAX_TOKENS = 4096
const TEMPERATURE = 0.3

const SYSTEM_PROMPT = `Você é assistente da Convertfy (agência de email marketing). Sua tarefa: a partir das respostas do formulário de onboarding de uma loja, gerar um BRIEFING estruturado em JSON com a forma:

{
  "about_brand": "...",
  "audience": "...",
  "language_tone": "...",
  "visual_identity": {
    "palette": "...",
    "fonts": "...",
    "references": "..."
  },
  "offers_and_differentials": "..."
}

Cada campo deve ter 2-5 frases em português, direto e prático. Use os dados das respostas. Se algum dado faltar, use bom senso. NÃO inclua nenhum texto fora do JSON.`

type FormResponses = Record<string, unknown>

interface Ctx {
  onboardingId: string
  orgId: string
  formResponses: FormResponses
  store: { store_name?: string; store_url?: string; platform?: string } | null
  client: { name?: string } | null
}

export async function generateBriefing(onboardingId: string): Promise<void> {
  const t0 = Date.now()
  log.info("briefing.cascade.start", { onboardingId })

  const ctx = await loadContext(onboardingId)
  if (!ctx) {
    log.warn("Onboarding nao encontrado pra gerar briefing", { onboardingId })
    return
  }

  await markGenerating(onboardingId)

  const prompt = buildPrompt(ctx)

  // ── T1: Anthropic SDK direto ──────────────────────────────────────────
  try {
    log.info("anthropic.try.start", {
      onboardingId,
      model: ANTHROPIC_MODEL,
      timeout_ms: T1_TIMEOUT_MS,
    })
    const t1Start = Date.now()
    const { briefing, meta } = await tryAnthropic(prompt, T1_TIMEOUT_MS)
    const t1Ms = Date.now() - t1Start
    log.info("anthropic.try.ok", { onboardingId, ms: t1Ms, ...meta })
    await saveBriefing(ctx, briefing, "anthropic_sonnet")
    log.info("briefing.cascade.done", {
      onboardingId,
      source: "anthropic_sonnet",
      total_ms: Date.now() - t0,
    })
    return
  } catch (e) {
    const err = e as Error
    if (err.message === "timeout") {
      log.warn("anthropic.try.timeout", { onboardingId, ms: T1_TIMEOUT_MS })
    } else {
      log.warn("anthropic.try.error", {
        onboardingId,
        error_message: err.message,
      })
    }
    // Continua pro T2
  }

  // ── T2: OpenRouter ────────────────────────────────────────────────────
  if (!process.env.OPENROUTER_API_KEY) {
    log.warn("openrouter.skip.no_api_key", { onboardingId })
  } else {
    try {
      log.info("openrouter.try.start", {
        onboardingId,
        model: OPENROUTER_MODEL,
        timeout_ms: T2_TIMEOUT_MS,
      })
      const t2Start = Date.now()
      const { briefing, meta } = await tryOpenRouter(prompt, T2_TIMEOUT_MS)
      const t2Ms = Date.now() - t2Start
      log.info("openrouter.try.ok", { onboardingId, ms: t2Ms, ...meta })
      await saveBriefing(ctx, briefing, "openrouter_sonnet")
      log.info("briefing.cascade.done", {
        onboardingId,
        source: "openrouter_sonnet",
        total_ms: Date.now() - t0,
      })
      return
    } catch (e) {
      const err = e as Error
      if (err.message === "timeout") {
        log.warn("openrouter.try.timeout", { onboardingId, ms: T2_TIMEOUT_MS })
      } else {
        log.warn("openrouter.try.error", {
          onboardingId,
          error_message: err.message,
        })
      }
      // Continua pro T3
    }
  }

  // ── T3: template determinístico (sempre roda) ─────────────────────────
  log.warn("raw_template.fallback", { onboardingId })
  try {
    const briefing = buildRawTemplate(ctx.formResponses)
    await saveBriefing(ctx, briefing, "raw_template")
    log.info("briefing.cascade.done", {
      onboardingId,
      source: "raw_template",
      total_ms: Date.now() - t0,
    })
  } catch (e) {
    log.error("briefing.cascade.fatal", e)
    await markBriefingFailed(onboardingId, (e as Error).message)
  }
}

// ── Step 0: contexto ────────────────────────────────────────────────────

async function loadContext(onboardingId: string): Promise<Ctx | null> {
  const admin = createAdminClient()
  const { data: onb } = await admin
    .from("onboardings")
    .select(
      "id, org_id, form_responses, client_id, store_id, client:clients!onboardings_client_id_fkey(name), store:client_stores(store_name, store_url, platform)",
    )
    .eq("id", onboardingId)
    .maybeSingle()
  if (!onb) return null

  return {
    onboardingId,
    orgId: onb.org_id,
    formResponses: (onb.form_responses ?? {}) as FormResponses,
    store: Array.isArray(onb.store) ? onb.store[0] : onb.store,
    client: Array.isArray(onb.client) ? onb.client[0] : onb.client,
  }
}

async function markGenerating(onboardingId: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from("onboardings")
    .update({
      briefing_status: "generating",
      briefing_started_at: new Date().toISOString(),
    })
    .eq("id", onboardingId)
}

function buildPrompt(ctx: Ctx): { system: string; user: string } {
  const user = `Respostas do formulario:\n${JSON.stringify(ctx.formResponses, null, 2)}\n\nLoja:\n${JSON.stringify(ctx.store, null, 2)}\n\nCliente:\n${JSON.stringify(ctx.client, null, 2)}\n\nGere o briefing em JSON.`
  return { system: SYSTEM_PROMPT, user }
}

// ── Step 1: Anthropic SDK ───────────────────────────────────────────────

interface TryResult {
  briefing: BriefingContent
  meta: {
    stop_reason?: string | null
    input_tokens?: number
    output_tokens?: number
  }
}

async function tryAnthropic(
  prompt: { system: string; user: string },
  timeoutMs: number,
): Promise<TryResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ausente")

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const client = new Anthropic({ apiKey })
    const resp = await client.messages.create(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      },
      { signal: ctrl.signal },
    )
    const text =
      resp.content[0]?.type === "text" ? resp.content[0].text : ""
    const parsed = parseBriefingJson(text)
    if (!parsed) {
      // stop_reason='max_tokens' indica truncamento — campo crítico no log
      throw new Error(
        `Resposta Anthropic invalida (stop_reason=${resp.stop_reason ?? "unknown"})`,
      )
    }
    return {
      briefing: parsed,
      meta: {
        stop_reason: resp.stop_reason,
        input_tokens: resp.usage?.input_tokens,
        output_tokens: resp.usage?.output_tokens,
      },
    }
  } catch (e) {
    // AbortError → padroniza pra "timeout"
    if (
      ctrl.signal.aborted ||
      (e as Error)?.name === "AbortError" ||
      (e as { type?: string })?.type === "aborted"
    ) {
      throw new Error("timeout")
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// ── Step 2: OpenRouter (fetch nativo) ───────────────────────────────────

async function tryOpenRouter(
  prompt: { system: string; user: string },
  timeoutMs: number,
): Promise<TryResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY ausente")

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://admin.convertfy.com.br",
          "X-Title": "Convertfy Admin — Briefing Onboarding",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
        }),
      },
    )
    if (!resp.ok) {
      const body = await resp.text().catch(() => "")
      throw new Error(`OpenRouter HTTP ${resp.status}: ${body.slice(0, 200)}`)
    }
    const data = (await resp.json()) as {
      choices?: Array<{
        message?: { content?: string }
        finish_reason?: string
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const choice = data.choices?.[0]
    const text = choice?.message?.content ?? ""
    const parsed = parseBriefingJson(text)
    if (!parsed) {
      throw new Error(
        `Resposta OpenRouter invalida (finish_reason=${choice?.finish_reason ?? "unknown"})`,
      )
    }
    return {
      briefing: parsed,
      meta: {
        stop_reason: choice?.finish_reason,
        input_tokens: data.usage?.prompt_tokens,
        output_tokens: data.usage?.completion_tokens,
      },
    }
  } catch (e) {
    if (
      ctrl.signal.aborted ||
      (e as Error)?.name === "AbortError"
    ) {
      throw new Error("timeout")
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// ── Step 3: template determinístico ─────────────────────────────────────

function buildRawTemplate(fr: FormResponses): BriefingContent {
  const storeName = pick(fr, "store_name", "A loja")
  const vertical = pick(fr, "vertical", "e-commerce")
  const positioning = pick(fr, "positioning", "a definir")
  const mainProducts = pick(fr, "main_products", "a confirmar com o cliente")
  const platform = pick(fr, "platform_ecommerce", "plataforma própria")

  const primaryPersona = pick(
    fr,
    "primary_persona",
    "a aprofundar com o cliente",
  )
  const mainMotivator = pick(fr, "main_motivator", "a investigar")
  const priceVsQuality = pick(
    fr,
    "price_vs_quality",
    "equilibrada entre preço e qualidade",
  )

  const toneOfVoice = pick(fr, "tone_of_voice", "casual e amigável")
  const storeLanguageRaw = pick(fr, "store_language", "")
  const storeLanguage =
    storeLanguageRaw === "Outro"
      ? pick(fr, "store_language_other", "")
      : storeLanguageRaw

  const shippingType = pick(fr, "shipping_type", "a confirmar")
  const ticketAvg = pick(fr, "ticket_avg", "a confirmar")
  const mainObjection = pick(fr, "main_objection", "a investigar")
  const mainGoal = pick(
    fr,
    "main_goal",
    "construir base e relacionamento",
  )

  const hasDesignRefs = !!pick(fr, "design_refs_url", "")

  return {
    about_brand: `${storeName} atua no segmento de ${vertical} com posicionamento ${positioning}. Principais produtos: ${mainProducts}. Operação rodando em ${platform}.`,
    audience: `Público principal: ${primaryPersona}. Principal motivador de compra: ${mainMotivator}. Sensibilidade: ${priceVsQuality}.`,
    language_tone: `${storeLanguage ? `Idioma dos emails: ${storeLanguage}. ` : ""}Tom de voz declarado: ${toneOfVoice}. Aderente ao posicionamento ${positioning}. Comunicação deve respeitar essa diretriz em todos os disparos.`,
    visual_identity: {
      palette: "A definir com base no manual da marca enviado pelo cliente.",
      fonts:
        "A definir — usar fontes do manual da marca quando disponível. Fallback: Inter / Helvetica / sans-serif.",
      references: hasDesignRefs
        ? "Cliente enviou referências visuais — ver materiais anexados ao onboarding."
        : "Pendente envio do cliente. Solicitar referências e/ou manual da marca.",
    },
    offers_and_differentials: `Frete: ${shippingType}. Ticket médio: ${ticketAvg}. Principal objeção a contornar nos disparos: ${mainObjection}. Objetivo prioritário nos próximos 90 dias: ${mainGoal}.`,
  }
}

function pick(fr: FormResponses, key: string, fallback: string): string {
  const v = fr?.[key]
  return typeof v === "string" && v.trim() ? v.trim() : fallback
}

// ── Helpers ─────────────────────────────────────────────────────────────

function parseBriefingJson(text: string): BriefingContent | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  let raw: unknown
  try {
    raw = JSON.parse(match[0])
  } catch {
    return null
  }
  // Validação rigorosa: rejeita briefings parciais (campos faltando ou
  // vazios) pra forçar fallback na próxima tentativa da cascata, em vez
  // de salvar um JSON incompleto silenciosamente.
  if (!raw || typeof raw !== "object") return null
  const b = raw as Record<string, unknown>
  const stringFields = [
    "about_brand",
    "audience",
    "language_tone",
    "offers_and_differentials",
  ] as const
  for (const f of stringFields) {
    if (typeof b[f] !== "string" || !(b[f] as string).trim()) return null
  }
  const vi = b.visual_identity as Record<string, unknown> | undefined
  if (!vi || typeof vi !== "object") return null
  for (const sub of ["palette", "fonts", "references"] as const) {
    if (typeof vi[sub] !== "string" || !(vi[sub] as string).trim()) return null
  }
  return raw as BriefingContent
}

async function saveBriefing(
  ctx: Ctx,
  briefing: BriefingContent,
  source: BriefingSource,
): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  // briefing_ai_original preserva a versão pura da IA (sem edições do
  // cliente). briefing recebe o mesmo conteúdo aqui — depois confirmBriefing
  // pode sobrescrever só briefing com as edições.
  const aiVersion = { ...briefing, generated_at: now }
  await admin
    .from("onboardings")
    .update({
      briefing: aiVersion,
      briefing_ai_original: aiVersion,
      briefing_status: "generated_pending_review",
      briefing_generated_at: now,
      briefing_generated_by: source,
    })
    .eq("id", ctx.onboardingId)

  await admin.from("events").insert({
    event_type: "onboarding.briefing_generated",
    entity_type: "onboarding",
    entity_id: ctx.onboardingId,
    actor_id: null,
    actor_type: "system",
    payload: { onboarding_id: ctx.onboardingId, source },
    metadata: { org_id: ctx.orgId },
  })
}

async function markBriefingFailed(
  onboardingId: string,
  reason: string,
): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from("onboardings")
    .update({
      briefing_status: "not_started",
      briefing_started_at: null,
      briefing: { error: reason } as unknown as BriefingContent,
    })
    .eq("id", onboardingId)
}
