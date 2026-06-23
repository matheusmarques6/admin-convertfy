/**
 * Email Copy Webhook Service
 *
 * Substitui o agente Claude interno de copy. Quando o briefing é finalizado
 * ou o usuário clica "Gerar copies (n8n)" na tela da loja, envia um payload
 * completo para o n8n (sem dependência de Google Docs). O n8n processa cada
 * email e devolve via callback streaming em /api/webhooks/n8n/email-copy.
 *
 * Padrão fire-and-forget igual a dispatchBriefingWebhook.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { ensureBlocksSeeded } from "@/lib/agents/seed-blocks"
import { resolveStoreLanguage } from "@/lib/i18n/store-language"
import type {
  StoreBrandIdentity,
  StoreBriefing,
} from "@/types/email-workspace"

const log = logger.child("EmailCopyWebhook")
const TIMEOUT_MS = 15_000

export interface DispatchEmailCopyOptions {
  triggerSource: "briefing_confirmed" | "manual_store_button"
  flowIds?: string[]
  triggeredBy?: string
  onlyDrafts?: boolean
}

interface EmailFlowRow {
  id: string
  flow_type: string
  name: string
}

interface EmailRow {
  id: string
  flow_id: string
  number: number
  name: string | null
  status: string
}

interface BlockRow {
  id: string
  email_id: string
  position: number
  block_type: string
  label: string | null
}

interface BlueprintRow {
  flow_type: string
  email_number: number
  objective: string | null
  messaging: string | null
  subject_hint: string | null
}

interface ReferenceRow {
  id: string
  flow_type: string
  email_number: number | null
  name: string
  copy: string | null
  html: string | null
}

interface TopProductRow {
  rank: number
  title: string
  price: number | null
  currency: string | null
  handle: string | null
  external_id: string | null
  image_url: string | null
  captured_at: string | null
}

interface CompetitorRow {
  name: string
  url: string | null
  posicionamento: string | null
  notas: string | null
}

export async function dispatchEmailCopyWebhook(
  storeId: string,
  options: DispatchEmailCopyOptions,
): Promise<{ ok: boolean; flow_count: number; email_count: number; reason?: string }> {
  const url = process.env.N8N_EMAIL_COPY_WEBHOOK_URL
  if (!url) {
    log.warn("email_copy.webhook.skip", { storeId, reason: "no_url_configured" })
    return { ok: false, flow_count: 0, email_count: 0, reason: "no_url_configured" }
  }

  const admin = createAdminClient()

  // ── Buscar contexto da loja em paralelo
  const [storeRes, brandRes, briefingRes, topProductsRes, competitorsRes, onboardingRes] = await Promise.all([
    admin
      .from("client_stores")
      .select(
        `
          id, store_name, store_url, platform, language, niche,
          brand_thesis, brand_about, brand_pillars, brand_presence,
          icp_persona, icp_demographics, icp_day_in_life,
          icp_motivations, icp_frictions,
          tone_description, tone_do, tone_dont,
          tone_use_words, tone_avoid_words,
          slogan, diferencial, persona, tom_de_voz, posicionamento_preco, hashtags,
          cores, fontes, brand_manual_url, research_doc_url,
          store_story, store_milestones,
          ads_score, ads_summary, ads_sub_scores, ads_strengths,
          ads_opportunities, ads_risks, ads_reviewed_at,
          ticket_medio_cents, taxa_conversao, faturamento_medio_cents,
          margem_media, recorrencia, frete_medio_cents, frete_prazo, frete_cobertura,
          lista_total, lista_engajados_30, lista_engajados_90,
          lista_crescimento_mensal, sms_consent_pct
        `,
      )
      .eq("id", storeId)
      .maybeSingle(),
    admin
      .from("store_brand_identity")
      .select("*")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("store_briefings")
      .select("marca, briefing, version")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("store_top_products")
      .select("rank, title, price, currency, handle, external_id, image_url, captured_at")
      .eq("store_id", storeId)
      .order("rank", { ascending: true })
      .limit(5),
    admin
      .from("client_competitors")
      .select("name, url, posicionamento, notas")
      .eq("store_id", storeId),
    // Onboarding mais recente — fonte do idioma escolhido pelo cliente
    // (form_responses.store_language e store_language_other). Usado por
    // resolveStoreLanguage pra garantir que webhook envia o que a UI mostra.
    admin
      .from("onboardings")
      .select("form_responses")
      .eq("store_id", storeId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (storeRes.error || !storeRes.data) {
    log.warn("email_copy.webhook.skip", {
      storeId,
      reason: "store_not_found",
      error: storeRes.error?.message,
    })
    return { ok: false, flow_count: 0, email_count: 0, reason: "store_not_found" }
  }

  // ── Buscar flows da loja (filtra por flowIds se fornecido)
  let flowQuery = admin
    .from("email_flows")
    .select("id, flow_type, name")
    .eq("store_id", storeId)
    .order("position", { ascending: true })

  if (options.flowIds && options.flowIds.length > 0) {
    flowQuery = flowQuery.in("id", options.flowIds)
  }

  const flowsRes = await flowQuery
  if (flowsRes.error) {
    log.error("email_copy.webhook.flows.error", { storeId, error: flowsRes.error.message })
    return { ok: false, flow_count: 0, email_count: 0, reason: "flows_query_failed" }
  }

  const flows = (flowsRes.data ?? []) as EmailFlowRow[]
  if (flows.length === 0) {
    log.warn("email_copy.webhook.skip", { storeId, reason: "no_flows" })
    return { ok: false, flow_count: 0, email_count: 0, reason: "no_flows" }
  }

  const flowIds = flows.map((f) => f.id)
  const flowTypes = Array.from(new Set(flows.map((f) => f.flow_type)))

  // ── Buscar emails + blocks + blueprints + references em paralelo
  let emailsQuery = admin
    .from("email_flow_emails")
    .select("id, flow_id, number, name, status")
    .in("flow_id", flowIds)
    .order("number", { ascending: true })

  if (options.onlyDrafts) {
    emailsQuery = emailsQuery.eq("status", "draft")
  }

  const [emailsRes, blueprintsRes, referencesRes] = await Promise.all([
    emailsQuery,
    admin
      .from("email_blueprints")
      .select("flow_type, email_number, objective, messaging, subject_hint")
      .in("flow_type", flowTypes),
    admin
      .from("email_reference_templates")
      .select("id, flow_type, email_number, name, copy, html")
      .in("flow_type", flowTypes)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
  ])

  if (emailsRes.error) {
    log.error("email_copy.webhook.emails.error", { storeId, error: emailsRes.error.message })
    return { ok: false, flow_count: 0, email_count: 0, reason: "emails_query_failed" }
  }

  const emails = (emailsRes.data ?? []) as EmailRow[]
  if (emails.length === 0) {
    log.warn("email_copy.webhook.skip", { storeId, reason: "no_emails" })
    return { ok: false, flow_count: 0, email_count: 0, reason: "no_emails" }
  }

  // AUTO-SEED LAZY: garante que cada email do batch tenha blocks
  // materializados antes de montar o payload. Sem isso, lojas que nunca
  // passaram pelo pipeline interno mandariam blocks:[] vazio pro n8n
  // (mesmo com email_blueprints populado). `ensureBlocksSeeded` é
  // idempotente: vira no-op pra emails que já têm blocks. Falhas
  // individuais são logadas mas não bloqueiam o dispatch (degradação
  // graceful — o SELECT abaixo decide).
  const flowsById = new Map(flows.map((f) => [f.id, f]))
  await Promise.all(
    emails.map(async (e) => {
      const flow = flowsById.get(e.flow_id)
      if (!flow) return
      try {
        await ensureBlocksSeeded(e.id, flow.flow_type, e.number)
      } catch (err) {
        log.warn("email_copy.webhook.ensure_blocks_failed", {
          storeId,
          emailId: e.id,
          flowType: flow.flow_type,
          emailNumber: e.number,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }),
  )

  const emailIds = emails.map((e) => e.id)
  const blocksRes = await admin
    .from("email_blocks")
    .select("id, email_id, position, block_type, label")
    .in("email_id", emailIds)
    .order("position", { ascending: true })

  if (blocksRes.error) {
    log.error("email_copy.webhook.blocks.error", { storeId, error: blocksRes.error.message })
    return { ok: false, flow_count: 0, email_count: 0, reason: "blocks_query_failed" }
  }

  const blocks = (blocksRes.data ?? []) as BlockRow[]
  const blueprints = (blueprintsRes.data ?? []) as BlueprintRow[]
  const references = (referencesRes.data ?? []) as ReferenceRow[]

  // ── Indexar para o payload
  const blocksByEmail = new Map<string, BlockRow[]>()
  for (const b of blocks) {
    const arr = blocksByEmail.get(b.email_id) ?? []
    arr.push(b)
    blocksByEmail.set(b.email_id, arr)
  }

  const emailsByFlow = new Map<string, EmailRow[]>()
  for (const e of emails) {
    const arr = emailsByFlow.get(e.flow_id) ?? []
    arr.push(e)
    emailsByFlow.set(e.flow_id, arr)
  }

  const blueprintByKey = new Map<string, BlueprintRow>()
  for (const bp of blueprints) {
    blueprintByKey.set(`${bp.flow_type}:${bp.email_number}`, bp)
  }

  // Reference: para cada flow_type, escolhe a referência ativa que casa com email_number
  // (mais específica primeiro; depois fallback para flow_type sem email_number)
  const refByFlowEmail = new Map<string, ReferenceRow>()
  const refByFlow = new Map<string, ReferenceRow>()
  for (const r of references) {
    if (r.email_number != null) {
      const key = `${r.flow_type}:${r.email_number}`
      if (!refByFlowEmail.has(key)) refByFlowEmail.set(key, r)
    } else {
      if (!refByFlow.has(r.flow_type)) refByFlow.set(r.flow_type, r)
    }
  }

  const store = storeRes.data as Record<string, unknown>
  const brand = (brandRes.data as StoreBrandIdentity | null) ?? null
  const briefing = (briefingRes.data as StoreBriefing | null) ?? null
  const topProductsTable = (topProductsRes.data as TopProductRow[] | null) ?? []
  const competitors = (competitorsRes.data as CompetitorRow[] | null) ?? []
  const onboardingRow = onboardingRes.data as {
    form_responses?: Record<string, unknown> | null
  } | null

  // Resolve idioma combinando form_responses (escolha do cliente) com o
  // valor em client_stores.language como fallback. Quando o cliente
  // escolheu "Outro" + digitou um idioma livre, isso vai pegar do campo
  // store_language_other — caminho que o sync antigo do confirmBriefing
  // não cobria, fazendo o webhook enviar 'pt-BR' default. Agora o
  // dispatch garante consistência mesmo pra lojas sem backfill aplicado.
  const resolvedLang = resolveStoreLanguage(
    onboardingRow?.form_responses ?? null,
    typeof store.language === "string" ? store.language : null,
  )

  // Auto-correct lazy: se client_stores.language está no default mas a
  // resolução achou outro idioma a partir do form_responses, atualiza.
  // Próximas leituras direto da tabela (sem passar pelo dispatch) já
  // ficam corretas — UI, exports, queries de BI etc.
  const currentStoreLang =
    typeof store.language === "string" ? store.language.trim() : ""
  if (
    resolvedLang.source !== "default" &&
    resolvedLang.source !== "store_fallback" &&
    resolvedLang.code !== currentStoreLang &&
    (!currentStoreLang || currentStoreLang === "pt-BR")
  ) {
    try {
      await admin
        .from("client_stores")
        .update({ language: resolvedLang.code })
        .eq("id", storeId)
      log.info("email_copy.webhook.language_synced", {
        storeId,
        from: currentStoreLang || "(empty)",
        to: resolvedLang.code,
        source: resolvedLang.source,
      })
    } catch (err) {
      log.warn("email_copy.webhook.language_sync_failed", {
        storeId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const payload = {
    event: "email_copy.requested" as const,
    timestamp: new Date().toISOString(),
    trigger_source: options.triggerSource,
    callback: {
      url: `${getAppUrl()}/api/webhooks/n8n/email-copy`,
      secret: process.env.N8N_WEBHOOK_SECRET ?? "",
    },
    store: {
      id: storeId,
      store_name: store.store_name,
      store_url: store.store_url,
      platform: store.platform,
      language: resolvedLang.code,
      language_label: resolvedLang.label,
      language_form_raw:
        (onboardingRow?.form_responses?.store_language as string | undefined) ?? null,
      language_form_other_raw:
        (onboardingRow?.form_responses?.store_language_other as string | undefined) ?? null,
      niche: store.niche,
      brand: {
        thesis: store.brand_thesis,
        about: store.brand_about,
        pillars: store.brand_pillars,
        presence: store.brand_presence,
      },
      icp: {
        persona: store.icp_persona,
        demographics: store.icp_demographics,
        day_in_life: store.icp_day_in_life,
        motivations: store.icp_motivations,
        frictions: store.icp_frictions,
      },
      tone: {
        description: store.tone_description,
        do: store.tone_do,
        dont: store.tone_dont,
        use_words: store.tone_use_words,
        avoid_words: store.tone_avoid_words,
      },
      positioning: {
        slogan: store.slogan ?? null,
        diferencial: store.diferencial ?? null,
        persona: store.persona ?? null,
        tom_de_voz: store.tom_de_voz ?? null,
        posicionamento_preco: store.posicionamento_preco ?? null,
        hashtags: store.hashtags ?? [],
      },
      visual: {
        cores: store.cores ?? [],
        fontes: store.fontes ?? null,
        brand_manual_url: store.brand_manual_url ?? null,
        research_doc_url: store.research_doc_url ?? null,
      },
      story: {
        story: store.store_story ?? null,
        milestones: store.store_milestones ?? [],
      },
      ads_review: {
        score: store.ads_score ?? null,
        summary: store.ads_summary ?? null,
        sub_scores: store.ads_sub_scores ?? null,
        strengths: store.ads_strengths ?? [],
        opportunities: store.ads_opportunities ?? [],
        risks: store.ads_risks ?? [],
        reviewed_at: store.ads_reviewed_at ?? null,
      },
      operations: {
        ticket_medio_cents: store.ticket_medio_cents ?? null,
        taxa_conversao: store.taxa_conversao ?? null,
        faturamento_medio_cents: store.faturamento_medio_cents ?? null,
        margem_media: store.margem_media ?? null,
        recorrencia: store.recorrencia ?? null,
        frete_medio_cents: store.frete_medio_cents ?? null,
        frete_prazo: store.frete_prazo ?? null,
        frete_cobertura: store.frete_cobertura ?? null,
      },
      audience: {
        lista_total: store.lista_total ?? null,
        lista_engajados_30: store.lista_engajados_30 ?? null,
        lista_engajados_90: store.lista_engajados_90 ?? null,
        lista_crescimento_mensal: store.lista_crescimento_mensal ?? null,
        sms_consent_pct: store.sms_consent_pct ?? null,
      },
    },
    brand_identity: brand
      ? {
          logo_url: brand.logo_main_png ?? brand.logo_main_svg ?? null,
          primary_colors: brand.colors_primary ?? [],
          secondary_colors: brand.colors_secondary ?? [],
          font_heading: brand.font_heading ?? null,
          font_body: brand.font_body ?? null,
          voice: brand.voice ?? [],
        }
      : null,
    briefing: briefing
      ? {
          marca: briefing.marca ?? {},
          briefing: briefing.briefing ?? {},
        }
      : null,
    top_products: topProductsTable.map((p) => ({
      name: p.title,
      price: p.price,
      currency: p.currency,
      image_url: p.image_url,
      url: p.handle ? `${store.store_url ?? ""}/products/${p.handle}` : null,
      external_id: p.external_id,
      rank: p.rank,
    })),
    competitors: competitors.map((c) => ({
      name: c.name,
      url: c.url,
      posicionamento: c.posicionamento,
      notas: c.notas,
    })),
    flows: flows.map((f) => {
      const flowEmails = (emailsByFlow.get(f.id) ?? []).map((e) => {
        const bp = blueprintByKey.get(`${f.flow_type}:${e.number}`)
        return {
          email_id: e.id,
          email_number: e.number,
          name: e.name,
          blueprint: bp
            ? {
                objective: bp.objective,
                messaging: bp.messaging,
                subject_hint: bp.subject_hint,
              }
            : null,
          blocks: (blocksByEmail.get(e.id) ?? []).map((b) => ({
            block_id: b.id,
            position: b.position,
            type: b.block_type,
            label: b.label,
          })),
        }
      })

      const fallbackRef = refByFlow.get(f.flow_type) ?? null
      const firstEmailRef =
        refByFlowEmail.get(`${f.flow_type}:${flowEmails[0]?.email_number ?? 1}`) ?? null
      const ref = firstEmailRef ?? fallbackRef

      return {
        flow_id: f.id,
        flow_type: f.flow_type,
        flow_name: f.name,
        reference: ref
          ? { id: ref.id, name: ref.name }
          : null,
        emails: flowEmails,
      }
    }),
  }

  // ── Disparar webhook
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const t0 = Date.now()
  let dispatchStatus: "success" | "error" = "error"
  let dispatchError: string | null = null

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (process.env.N8N_WEBHOOK_SECRET) {
      headers["x-webhook-secret"] = process.env.N8N_WEBHOOK_SECRET
    }

    log.info("email_copy.webhook.start", {
      storeId,
      url,
      trigger_source: options.triggerSource,
      flow_count: flows.length,
      email_count: emails.length,
    })

    const resp = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers,
      body: JSON.stringify(payload),
    })

    const ms = Date.now() - t0
    if (!resp.ok) {
      const body = await resp.text().catch(() => "")
      dispatchError = `HTTP ${resp.status}: ${body.slice(0, 200)}`
      log.warn("email_copy.webhook.error", {
        storeId,
        ms,
        http_status: resp.status,
        body: body.slice(0, 200),
      })
    } else {
      dispatchStatus = "success"
      log.info("email_copy.webhook.ok", { storeId, ms, http_status: resp.status })
    }
  } catch (e) {
    const ms = Date.now() - t0
    if (ctrl.signal.aborted) {
      dispatchError = "timeout"
      log.warn("email_copy.webhook.timeout", { storeId, ms })
    } else {
      dispatchError = (e as Error).message
      log.warn("email_copy.webhook.error", { storeId, ms, error_message: dispatchError })
    }
  } finally {
    clearTimeout(timer)
  }

  // ── Persistir tentativa em email_generation_runs e marcar emails como in_progress
  await admin.from("email_generation_runs").insert({
    store_id: storeId,
    triggered_by: options.triggeredBy ?? null,
    agent: "copy_dispatch",
    status: dispatchStatus,
    model: "n8n",
    duration_ms: Date.now() - t0,
    parsed_output: {
      trigger_source: options.triggerSource,
      flow_count: flows.length,
      email_count: emails.length,
      only_drafts: options.onlyDrafts ?? false,
    },
    error_message: dispatchError,
  })

  if (dispatchStatus === "success") {
    // Reset cinto-suspensorio: ao re-disparar copy, limpamos artefatos
    // de qualquer fase 2 anterior (html, qa_issues, failure_reason,
    // timers). A limpeza definitiva acontece no callback do n8n
    // (`/api/webhooks/n8n/email-copy`); este UPDATE garante o invariante
    // mesmo se algo abortar antes do callback chegar.
    await admin
      .from("email_flow_emails")
      .update({
        status: "in_progress",
        html: null,
        qa_issues: [],
        failure_reason: null,
        rendering_started_at: null,
        qa_started_at: null,
      })
      .in("id", emailIds)
      .in("status", ["draft"])
  }

  return {
    ok: dispatchStatus === "success",
    flow_count: flows.length,
    email_count: emails.length,
    reason: dispatchError ?? undefined,
  }
}

function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "")
}
