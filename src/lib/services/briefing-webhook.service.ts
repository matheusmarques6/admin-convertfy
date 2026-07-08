/**
 * Briefing Webhook Service
 *
 * Quando o cliente confirma o briefing no popup do form público, dispara
 * um POST outbound pra URL configurada em N8N_BRIEFING_WEBHOOK_URL (n8n
 * downstream pra gerar copies, automatizar flows, etc).
 *
 * Fire-and-forget: chamado via after() do Next 15 — falha do n8n não
 * bloqueia a confirmação do cliente.
 *
 * Payload contém:
 *   - briefing atual (com edições do cliente)
 *   - briefing_ai_original (versão pura da IA)
 *   - form_responses (todas as respostas do wizard)
 *   - dados comerciais do onboarding
 *   - client (name, email, phone, etc)
 *   - store (incluindo Ads Analyzer: brand/icp/tone/ads_review)
 *   - top_products (até 5)
 */

import { createAdminClient } from "@/lib/supabase/server"
import { resolveStoreLanguage } from "@/lib/i18n/store-language"
import { logger } from "@/lib/logger"
import type { BriefingContent } from "@/types/onboarding-pipeline"

const log = logger.child("BriefingWebhook")
const TIMEOUT_MS = 15_000

interface ReviewItem {
  what: string
  body: string
}

interface AdsReview {
  score: number | null
  summary: string | null
  sub_scores: Record<string, number> | null
  strengths: ReviewItem[] | null
  opportunities: ReviewItem[] | null
  risks: ReviewItem[] | null
  reviewed_at: string | null
}

interface WebhookPayload {
  event: "onboarding.briefing_confirmed"
  timestamp: string
  // Quando true, sinaliza que o briefing foi REGERADO (não é a primeira
  // confirmação). O n8n deve ECOAR este campo ao chamar o callback
  // /api/webhooks/n8n/pesquisa-completa para que a geração de copy não
  // seja re-disparada.
  regeneration: boolean
  // Quando true, regeneração DO ZERO: `briefing`/`briefing_ai_original`
  // vão null de propósito — o n8n NÃO deve reaproveitar o briefing antigo
  // como base; deve gerar a partir do link (store.store_url) e dos dados
  // atuais da loja. É o modo do botão "Regerar briefing": quem regenera o
  // faz porque o briefing atual está ERRADO — realimentá-lo só reproduz o
  // erro (ex.: pesquisa contaminada com outra loja).
  fresh_start: boolean
  onboarding: Record<string, unknown>
  briefing: BriefingContent | null
  briefing_ai_original: BriefingContent | null
  form_responses: Record<string, unknown> | null
  client: Record<string, unknown> | null
  store: Record<string, unknown> | null
  top_products: Array<Record<string, unknown>>
}

export async function dispatchBriefingWebhook(
  onboardingId: string,
  opts?: { regeneration?: boolean; freshStart?: boolean },
): Promise<void> {
  const regeneration = opts?.regeneration ?? false
  const freshStart = opts?.freshStart ?? false
  const url = process.env.N8N_BRIEFING_WEBHOOK_URL
  if (!url) {
    log.warn("briefing.webhook.skip", {
      onboardingId,
      reason: "no_url_configured",
    })
    return
  }

  let payload: WebhookPayload | null = null
  try {
    payload = await buildPayload(onboardingId, regeneration, freshStart)
  } catch (e) {
    log.error("briefing.webhook.fatal", {
      onboardingId,
      error: (e as Error).message,
    })
    return
  }
  if (!payload) {
    log.warn("briefing.webhook.skip", {
      onboardingId,
      reason: "onboarding_not_found",
    })
    return
  }

  const secret = process.env.N8N_WEBHOOK_SECRET
  if (!secret) {
    log.warn("briefing.webhook.no_secret", { onboardingId })
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const t0 = Date.now()
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (secret) headers["x-webhook-secret"] = secret

    log.info("briefing.webhook.start", { onboardingId, url, regeneration })
    const resp = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers,
      body: JSON.stringify(payload),
    })
    const ms = Date.now() - t0
    if (!resp.ok) {
      const body = await resp.text().catch(() => "")
      log.warn("briefing.webhook.error", {
        onboardingId,
        ms,
        http_status: resp.status,
        body: body.slice(0, 200),
      })
      return
    }
    log.info("briefing.webhook.ok", {
      onboardingId,
      ms,
      http_status: resp.status,
      regeneration,
    })
  } catch (e) {
    const ms = Date.now() - t0
    if (ctrl.signal.aborted) {
      log.warn("briefing.webhook.timeout", { onboardingId, ms })
    } else {
      log.warn("briefing.webhook.error", {
        onboardingId,
        ms,
        error_message: (e as Error).message,
      })
    }
  } finally {
    clearTimeout(timer)
  }
}

async function buildPayload(
  onboardingId: string,
  regeneration: boolean,
  freshStart: boolean,
): Promise<WebhookPayload | null> {
  const admin = createAdminClient()

  const { data: onb } = await admin
    .from("onboardings")
    .select(
      `
      id, org_id, form_token, pipeline_id, current_column_id, status,
      plan, mrr_value, vertical, language, source, source_channel,
      client_whatsapp, subscription_id,
      form_responses, form_submitted_at,
      briefing, briefing_ai_original, briefing_status, briefing_generated_by,
      briefing_started_at, briefing_generated_at, briefing_confirmed_at,
      client_id, store_id,
      client:clients!onboardings_client_id_fkey(
        id, name, email, phone, company, website
      ),
      store:client_stores(
        id, store_name, store_url, platform,
        language, country, currency, niche,
        brand_thesis, brand_about, brand_pillars, brand_presence,
        store_story, store_milestones,
        icp_persona, icp_demographics, icp_day_in_life,
        icp_motivations, icp_frictions,
        tone_description, tone_do, tone_dont,
        tone_use_words, tone_avoid_words,
        ads_score, ads_summary, ads_sub_scores,
        ads_strengths, ads_opportunities, ads_risks, ads_reviewed_at
      )
    `,
    )
    .eq("id", onboardingId)
    .maybeSingle()

  if (!onb) return null

  const storeRow = Array.isArray(onb.store) ? onb.store[0] : onb.store
  const clientRow = Array.isArray(onb.client) ? onb.client[0] : onb.client
  const storeId = onb.store_id ?? storeRow?.id ?? null

  // Idioma efetivo da loja — mesma resolução do dispatch de copy: coluna
  // editada no admin vence, formulário cobre lojas sem coluna, default
  // pt-BR por último (com source explícito no payload).
  const resolvedStoreLang = resolveStoreLanguage(
    (onb.form_responses as Record<string, unknown> | null) ?? null,
    (storeRow?.language as string | null) ?? null,
  )

  const topProductsRes = storeId
    ? await admin
        .from("store_top_products")
        .select(
          "rank, title, price, currency, handle, image_url, external_id",
        )
        .eq("store_id", storeId)
        .order("rank", { ascending: true })
        .limit(5)
    : { data: [] as Array<Record<string, unknown>> }

  return {
    event: "onboarding.briefing_confirmed",
    timestamp: new Date().toISOString(),
    regeneration,
    fresh_start: freshStart,

    onboarding: {
      id: onb.id,
      org_id: onb.org_id,
      form_token: onb.form_token,
      pipeline_id: onb.pipeline_id,
      current_column_id: onb.current_column_id,
      status: onb.status,
      plan: onb.plan,
      mrr_value: onb.mrr_value,
      vertical: onb.vertical,
      language: onb.language,
      source: onb.source,
      source_channel: onb.source_channel,
      client_whatsapp: onb.client_whatsapp,
      subscription_id: onb.subscription_id,
      form_submitted_at: onb.form_submitted_at,
      briefing_status: onb.briefing_status,
      briefing_generated_by: onb.briefing_generated_by,
      briefing_started_at: onb.briefing_started_at,
      briefing_generated_at: onb.briefing_generated_at,
      briefing_confirmed_at: onb.briefing_confirmed_at,
    },

    // fresh_start: briefing antigo NÃO vai como base — regeneração parte do
    // link/loja. Ver comentário no tipo WebhookPayload.
    briefing: freshStart ? null : ((onb.briefing as BriefingContent | null) ?? null),
    briefing_ai_original: freshStart
      ? null
      : ((onb.briefing_ai_original as BriefingContent | null) ?? null),
    form_responses:
      (onb.form_responses as Record<string, unknown> | null) ?? null,

    client: clientRow
      ? {
          id: clientRow.id,
          name: clientRow.name,
          email: clientRow.email,
          phone: clientRow.phone,
          company: clientRow.company,
          website: clientRow.website,
        }
      : null,

    store: storeRow
      ? {
          id: storeRow.id,
          store_name: storeRow.store_name,
          store_url: storeRow.store_url,
          platform: storeRow.platform,
          // Idioma REAL da loja (coluna editada no admin vence o formulário) —
          // NÃO confundir com onboarding.language, que é herdado do deal do
          // CRM na criação e fica desatualizado. O n8n deve usar ESTE campo.
          language: resolvedStoreLang.code,
          language_label: resolvedStoreLang.label,
          language_source: resolvedStoreLang.source,
          country: storeRow.country ?? null,
          currency: storeRow.currency ?? null,
          niche: storeRow.niche ?? null,
          brand: {
            thesis: storeRow.brand_thesis,
            about: storeRow.brand_about,
            pillars: storeRow.brand_pillars,
            presence: storeRow.brand_presence,
          },
          history: {
            story: storeRow.store_story,
            milestones: storeRow.store_milestones,
          },
          icp: {
            persona: storeRow.icp_persona,
            demographics: storeRow.icp_demographics,
            day_in_life: storeRow.icp_day_in_life,
            motivations: storeRow.icp_motivations,
            frictions: storeRow.icp_frictions,
          },
          tone: {
            description: storeRow.tone_description,
            do: storeRow.tone_do,
            dont: storeRow.tone_dont,
            use_words: storeRow.tone_use_words,
            avoid_words: storeRow.tone_avoid_words,
          },
          ads_review: buildAdsReview(storeRow),
        }
      : null,

    top_products: topProductsRes.data ?? [],
  }
}

// Calcula score como média dos sub_scores (escala 0-10), espelhando o que
// a UI faz. Não usa store.ads_score cru — vem em escala incompatível do
// webhook n8n original e não bate com a média visual.
function buildAdsReview(store: {
  ads_score: number | null
  ads_summary: string | null
  ads_sub_scores: Record<string, unknown> | null
  ads_strengths: ReviewItem[] | null
  ads_opportunities: ReviewItem[] | null
  ads_risks: ReviewItem[] | null
  ads_reviewed_at: string | null
}): AdsReview | null {
  // Se a loja nunca rodou Ads Analyzer, retorna null pra n8n ignorar
  if (store.ads_score === null && store.ads_sub_scores === null) {
    return null
  }

  const sub = store.ads_sub_scores ?? {}
  const subScoresNum: Record<string, number> = {}
  for (const key of [
    "strategy",
    "creatives",
    "targeting",
    "diversification",
    "tracking",
  ]) {
    const v = Number((sub as Record<string, unknown>)[key])
    if (Number.isFinite(v)) subScoresNum[key] = v
  }
  const values = Object.values(subScoresNum).filter((v) => v > 0)
  const score =
    values.length > 0
      ? Math.round(
          Math.max(
            0,
            Math.min(10, values.reduce((s, v) => s + v, 0) / values.length),
          ) * 10,
        ) / 10
      : null

  return {
    score,
    summary: store.ads_summary,
    sub_scores: Object.keys(subScoresNum).length > 0 ? subScoresNum : null,
    strengths: store.ads_strengths,
    opportunities: store.ads_opportunities,
    risks: store.ads_risks,
    reviewed_at: store.ads_reviewed_at,
  }
}
