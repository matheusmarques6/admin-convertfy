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
import { sanitizeBriefingContent } from "@/lib/briefing/sanitize-briefing"
import {
  pesquisaToFullText,
  type PesquisaFields,
} from "@/lib/briefing/briefing-text"

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

Cada campo deve ter 2-5 frases em português, direto e prático.

FONTE DOS DADOS (ordem de prioridade):
1. O bloco "PESQUISA & DIAGNÓSTICO DA LOJA" é a FONTE PRIMÁRIA — dados reais e verificados sobre marca, história, cliente ideal (ICP) e tom de voz. Baseie about_brand, audience e language_tone PRINCIPALMENTE nele quando estiver presente.
2. As "RESPOSTAS DO FORMULÁRIO" servem apenas para preencher lacunas que a pesquisa não cobre.

REGRAS DE FIDELIDADE (não invente):
- Respeite a MOEDA e o PAÍS informados em "DADOS DA LOJA". NUNCA assuma Real (R$) ou Brasil por padrão; se a loja for de outro país/moeda, não troque o símbolo nem converta valores. Se um ticket vier numa faixa, mantenha a faixa como veio.
- Em "visual_identity", NÃO invente cores, paletas ou fontes específicas. Se não houver material visual real descrito nos dados, escreva algo como "A definir com base no manual da marca enviado pelo cliente" (palette/fonts) e, em "references", apenas constate se o cliente enviou referências — sem descrever uma estética imaginada.
- Quando um dado não existir em nenhuma fonte, escreva "a definir" / "a confirmar com o cliente" em vez de inventar.

NÃO inclua nenhum texto fora do JSON. NUNCA inclua URLs, links ou caminhos de arquivo nos textos do briefing (o cliente lê esse conteúdo).`

type FormResponses = Record<string, unknown>

interface StoreLocale {
  niche?: string | null
  language?: string | null
  country?: string | null
  currency?: string | null
  free_shipping_type?: string | null
}

export interface Ctx {
  onboardingId: string
  orgId: string
  formResponses: FormResponses
  store: { store_name?: string; store_url?: string; platform?: string } | null
  /**
   * Documento "Pesquisa & Diagnóstico" (client_stores) — fonte PRIMÁRIA do
   * briefing. Quando preenchido, tem prioridade sobre form_responses.
   */
  research: PesquisaFields
  /** Localização da loja (nicho/idioma/país/moeda) para coerência de contexto. */
  locale: StoreLocale
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
    const briefing = buildRawTemplate(ctx)
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
      `id, org_id, form_responses, client_id, store_id,
       client:clients!onboardings_client_id_fkey(name),
       store:client_stores(
         store_name, store_url, platform,
         niche, language, country, currency, free_shipping_type,
         brand_thesis, brand_about, brand_pillars, brand_presence,
         store_story, store_milestones,
         icp_persona, icp_demographics, icp_day_in_life,
         icp_motivations, icp_frictions,
         tone_description, tone_do, tone_dont,
         tone_use_words, tone_avoid_words,
         ads_score, ads_summary, ads_sub_scores,
         ads_strengths, ads_opportunities, ads_risks, ads_reviewed_at
       )`,
    )
    .eq("id", onboardingId)
    .maybeSingle()
  if (!onb) return null

  const storeRow = (
    Array.isArray(onb.store) ? onb.store[0] : onb.store
  ) as Record<string, unknown> | null

  return {
    onboardingId,
    orgId: onb.org_id,
    formResponses: (onb.form_responses ?? {}) as FormResponses,
    store: storeRow
      ? {
          store_name: storeRow.store_name as string | undefined,
          store_url: storeRow.store_url as string | undefined,
          platform: storeRow.platform as string | undefined,
        }
      : null,
    research: (storeRow ?? {}) as PesquisaFields,
    locale: {
      niche: (storeRow?.niche as string | null) ?? null,
      language: (storeRow?.language as string | null) ?? null,
      country: (storeRow?.country as string | null) ?? null,
      currency: (storeRow?.currency as string | null) ?? null,
      free_shipping_type: (storeRow?.free_shipping_type as string | null) ?? null,
    },
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

// Campos do formulario que sao URLs de storage interno (Supabase) — nunca
// devem entrar no contexto do LLM, pra evitar que ele copie o link nos textos.
const STORAGE_URL_KEYS = ["logo_url", "brand_manual_url", "design_refs_url"]

/** Remove chaves de storage e quaisquer valores que sejam URL de storage. */
function stripStorageFromResponses(fr: FormResponses): FormResponses {
  const out: FormResponses = {}
  for (const [k, v] of Object.entries(fr)) {
    if (STORAGE_URL_KEYS.includes(k)) continue
    if (
      typeof v === "string" &&
      /https?:\/\//i.test(v) &&
      /supabase|\/storage\/v1\/object\/|form-submissions\//i.test(v)
    ) {
      continue
    }
    out[k] = v
  }
  return out
}

export function buildPrompt(ctx: Ctx): { system: string; user: string } {
  const safeResponses = stripStorageFromResponses(ctx.formResponses)
  // Documento de pesquisa renderizado (5 seções). Vazio => loja sem pesquisa,
  // cai no formulário como fonte primária (comportamento de fallback).
  const research = pesquisaToFullText(ctx.research)

  const storeData = {
    ...ctx.store,
    nicho: ctx.locale.niche ?? undefined,
    pais: ctx.locale.country ?? undefined,
    moeda: ctx.locale.currency ?? undefined,
    idioma: ctx.locale.language ?? undefined,
    frete_gratis: ctx.locale.free_shipping_type ?? undefined,
  }

  const parts: string[] = []
  if (research) {
    parts.push(
      `PESQUISA & DIAGNÓSTICO DA LOJA (FONTE PRIMÁRIA — dados reais e verificados; use preferencialmente):\n${research}`,
    )
  }
  parts.push(`DADOS DA LOJA:\n${JSON.stringify(storeData, null, 2)}`)
  parts.push(`CLIENTE:\n${JSON.stringify(ctx.client, null, 2)}`)
  parts.push(
    `RESPOSTAS DO FORMULÁRIO (use apenas para preencher lacunas que a pesquisa não cobre):\n${JSON.stringify(safeResponses, null, 2)}`,
  )
  parts.push("Gere o briefing em JSON.")

  return { system: SYSTEM_PROMPT, user: parts.join("\n\n") }
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

export function buildRawTemplate(ctx: Ctx): BriefingContent {
  const fr = ctx.formResponses
  const r = ctx.research

  const storeName = s(ctx.store?.store_name) || pick(fr, "store_name", "A loja")
  const vertical = s(ctx.locale.niche) || pick(fr, "vertical", "e-commerce")
  const positioning = pick(fr, "positioning", "a definir")
  const mainProducts = pick(fr, "main_products", "a confirmar com o cliente")
  const platform =
    s(ctx.store?.platform) || pick(fr, "platform_ecommerce", "plataforma própria")

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

  const shippingType =
    s(ctx.locale.free_shipping_type) || pick(fr, "shipping_type", "a confirmar")
  const ticketAvg = pick(fr, "ticket_avg", "a confirmar")
  const mainObjection = pick(fr, "main_objection", "a investigar")
  const mainGoal = pick(
    fr,
    "main_goal",
    "construir base e relacionamento",
  )

  const hasDesignRefs = !!pick(fr, "design_refs_url", "")

  // Pesquisa & Diagnóstico tem prioridade sobre o formulário quando preenchida.
  const brandText = s(r.brand_about) || s(r.brand_thesis)
  const personaName = s(r.icp_persona?.name)
  const motivations = (r.icp_motivations ?? []).map(s).filter(Boolean)
  const toneDesc = s(r.tone_description)
  const researchLanguage = s(ctx.locale.language) || storeLanguage

  return {
    about_brand:
      brandText ||
      `${storeName} atua no segmento de ${vertical} com posicionamento ${positioning}. Principais produtos: ${mainProducts}. Operação rodando em ${platform}.`,
    audience:
      personaName || motivations.length
        ? `Público principal: ${personaName || "a aprofundar com o cliente"}.${motivations.length ? ` Principais motivadores: ${motivations.join("; ")}.` : ""}`
        : `Público principal: ${primaryPersona}. Principal motivador de compra: ${mainMotivator}. Sensibilidade: ${priceVsQuality}.`,
    language_tone: toneDesc
      ? `${researchLanguage ? `Idioma dos emails: ${researchLanguage}. ` : ""}${toneDesc}`
      : `${storeLanguage ? `Idioma dos emails: ${storeLanguage}. ` : ""}Tom de voz declarado: ${toneOfVoice}. Aderente ao posicionamento ${positioning}. Comunicação deve respeitar essa diretriz em todos os disparos.`,
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

/** Coage um valor desconhecido a uma string trimada não-vazia, ou "". */
function s(v: unknown): string {
  return typeof v === "string" && v.trim() ? v.trim() : ""
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
  // Cinto-e-suspensório: ainda que o prompt já evite URLs, sanitiza antes de
  // persistir pra garantir que nenhum link de storage chegue ao cliente.
  const clean = sanitizeBriefingContent(briefing)
  // briefing_ai_original preserva a versão pura da IA (sem edições do
  // cliente). briefing recebe o mesmo conteúdo aqui — depois confirmBriefing
  // pode sobrescrever só briefing com as edições.
  const aiVersion = { ...clean, generated_at: now }
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
