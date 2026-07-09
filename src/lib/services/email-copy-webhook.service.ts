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

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/server"
import { DEFAULT_EMAILS, type FlowTypeKey } from "@/lib/services/flow-seed.service"
import { logger } from "@/lib/logger"
import {
  ensureBlocksSeeded,
  reconcileBlocksAdditive,
} from "@/lib/agents/seed-blocks"
import {
  loadEffectiveBlueprintsBatch,
  loadTextOnlyBlueprints,
} from "@/lib/agents/architect/blueprint-loader"
import { resolveStoreLanguage } from "@/lib/i18n/store-language"
import { pesquisaToFullText, type PesquisaFields } from "@/lib/briefing/briefing-text"
import { pickBrandLogo } from "@/lib/brand/pick-logo"
import type {
  StoreBrandIdentity,
  StoreBriefing,
} from "@/types/email-workspace"
import type { BlueprintBlock } from "@/types/email-generation"
import { normalizeCopySpec } from "@/lib/email-workspace/copy-spec"

const log = logger.child("EmailCopyWebhook")
const TIMEOUT_MS = 15_000

export interface DispatchEmailCopyOptions {
  triggerSource: "briefing_confirmed" | "manual_store_button" | "pesquisa_completa"
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
  content: Record<string, unknown> | null
}

// Status finalizados — não reconciliar estrutura (preserva trabalho pronto).
const FINALIZED_STATUSES = new Set(["ready", "approved", "live"])

/** true se o bloco tem qualquer copy preenchida (carry-over já gerado). */
function blockHasContent(content: Record<string, unknown> | null): boolean {
  if (!content || typeof content !== "object") return false
  for (const v of Object.values(content)) {
    if (typeof v === "string" && v.trim()) return true
    if (typeof v === "number") return true
    if (Array.isArray(v) && v.length > 0) return true
    if (v && typeof v === "object" && Object.keys(v).length > 0) return true
  }
  return false
}

/**
 * Decide quais blocos do email vão pro n8n gerar copy:
 * - email MISTO (alguns com copy, outros vazios → caso de reconciliação
 *   aditiva): envia só os VAZIOS, preservando a copy já existente.
 * - email todo vazio (geração nova) ou todo preenchido (regerar tudo):
 *   envia TODOS — comportamento original inalterado.
 */
function selectBlocksForCopy(blocks: BlockRow[]): BlockRow[] {
  const empty = blocks.filter((b) => !blockHasContent(b.content))
  const mixed = empty.length > 0 && empty.length < blocks.length
  return mixed ? empty : blocks
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

// "Estrutura geral" (email_outline_templates) enviada no payload dos emails
// somente-texto — o fluxo diferente do n8n gera a copy a partir dela.
interface OutlineRow {
  flow_type: string
  email_number: number
  objective: string | null
  guidance: string | null
  suggested_blocks: string[] | null
  tone_hint: string | null
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

/**
 * Auto-seed: flows selecionados SEM NENHUM email ganham os emails default
 * (mesma fonte do init-flows / trigger SQL de auto-seed). Torna o dispatch
 * auto-curativo para lojas onde o seed nunca rodou ou os emails foram
 * apagados — antes isso travava o disparo com "no_emails" sem saída na UI.
 * Flows que já têm qualquer email não são tocados (não ressuscita deleção
 * parcial intencional). Retorna o total de emails criados.
 */
async function seedMissingEmails(
  admin: SupabaseClient,
  flows: EmailFlowRow[],
): Promise<number> {
  const flowIds = flows.map((f) => f.id)
  const { data: existing, error } = await admin
    .from("email_flow_emails")
    .select("flow_id")
    .in("flow_id", flowIds)
  if (error) throw error
  const withEmails = new Set((existing ?? []).map((e) => e.flow_id as string))

  const rows: Array<{
    flow_id: string
    number: number
    name: string
    status: "draft"
    delay_hours: number
  }> = []
  for (const flow of flows) {
    if (withEmails.has(flow.id)) continue
    const defaults = DEFAULT_EMAILS[flow.flow_type as FlowTypeKey]
    if (!defaults) continue
    for (const e of defaults) {
      rows.push({
        flow_id: flow.id,
        number: e.number,
        name: e.name,
        status: "draft",
        delay_hours: e.delay_hours,
      })
    }
  }
  if (rows.length === 0) return 0
  const { error: insErr } = await admin.from("email_flow_emails").insert(rows)
  if (insErr) throw insErr
  return rows.length
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

  // Blueprints: cascata store-specific -> global via helper batch.
  // Mantemos paralelismo com emails/references; helper resolve as duas
  // queries internas (globals + store overrides) e devolve um map ja
  // mergeado.
  // Emails "somente texto": textOnlyByKey traz os rows GLOBAIS flagados
  // (o payload deles ignora a camada da loja) e outlinesRes traz a
  // "Estrutura geral" (email_outline_templates) que vai no payload.
  const [emailsRes, effectiveBlueprints, referencesRes, textOnlyByKey, outlinesRes] =
    await Promise.all([
      emailsQuery,
      loadEffectiveBlueprintsBatch(admin, storeId, flowTypes),
      admin
        .from("email_reference_templates")
        .select("id, flow_type, email_number, name, copy, html")
        .in("flow_type", flowTypes)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      loadTextOnlyBlueprints(admin, flowTypes),
      admin
        .from("email_outline_templates")
        .select("flow_type, email_number, objective, guidance, suggested_blocks, tone_hint")
        .in("flow_type", flowTypes)
        .eq("is_active", true),
    ])

  if (emailsRes.error) {
    log.error("email_copy.webhook.emails.error", { storeId, error: emailsRes.error.message })
    return { ok: false, flow_count: 0, email_count: 0, reason: "emails_query_failed" }
  }

  let emails = (emailsRes.data ?? []) as EmailRow[]
  if (emails.length === 0) {
    // Auto-cura: flows sem NENHUM email (seed nunca rodou / emails apagados)
    // ganham os defaults e o dispatch segue. Os novos nascem `draft`, então
    // passam no filtro onlyDrafts naturalmente.
    let seeded = 0
    try {
      seeded = await seedMissingEmails(admin, flows)
    } catch (err) {
      log.error("email_copy.webhook.autoseed.error", {
        storeId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    if (seeded > 0) {
      log.info("email_copy.webhook.autoseed", { storeId, seeded })
      let retryQuery = admin
        .from("email_flow_emails")
        .select("id, flow_id, number, name, status")
        .in("flow_id", flowIds)
        .order("number", { ascending: true })
      if (options.onlyDrafts) {
        retryQuery = retryQuery.eq("status", "draft")
      }
      const retryRes = await retryQuery
      if (retryRes.error) {
        log.error("email_copy.webhook.emails.error", { storeId, error: retryRes.error.message })
        return { ok: false, flow_count: 0, email_count: 0, reason: "emails_query_failed" }
      }
      emails = (retryRes.data ?? []) as EmailRow[]
    }
  }

  if (emails.length === 0) {
    // Distingue "não há drafts" (existe email, mas nenhum em draft) de
    // "não há emails" — antes os dois caíam em no_emails e a instrução de
    // desmarcar o checkbox não resolvia o segundo caso.
    if (options.onlyDrafts) {
      const { data: anyEmails } = await admin
        .from("email_flow_emails")
        .select("id")
        .in("flow_id", flowIds)
        .limit(1)
      if (anyEmails && anyEmails.length > 0) {
        log.warn("email_copy.webhook.skip", { storeId, reason: "no_draft_emails" })
        return { ok: false, flow_count: 0, email_count: 0, reason: "no_draft_emails" }
      }
    }
    log.warn("email_copy.webhook.skip", { storeId, reason: "no_emails" })
    return { ok: false, flow_count: 0, email_count: 0, reason: "no_emails" }
  }

  // Idempotência do gatilho automático (Pesquisa & Diagnóstico): não re-dispara
  // se já houver um batch em andamento/concluído — evita batch duplicado num
  // re-callback do n8n. Só dispara se os emails estão em draft/failed.
  if (options.triggerSource === "pesquisa_completa") {
    const ACTIVE_STATUSES = [
      "pending",
      "in_progress",
      "copy_generating",
      "copy_generating_recovery",
      "copy_ready",
      "rendering",
      "qa_running",
      "ready",
      "approved",
      "live",
    ]
    const inProgress = emails.some((e) => ACTIVE_STATUSES.includes(e.status))
    if (inProgress) {
      log.info("email_copy.webhook.skip", { storeId, reason: "batch_in_progress" })
      return {
        ok: false,
        flow_count: 0,
        email_count: 0,
        reason: "batch_in_progress",
      }
    }
  }

  // AUTO-SEED + RECONCILIAÇÃO ADITIVA: garante que cada email do batch tenha
  // os blocks da blueprint VIGENTE antes de montar o payload.
  // - Emails finalizados (ready/approved/live): só `ensureBlocksSeeded`
  //   (idempotente) — não mexe na estrutura pronta.
  // - Demais: `reconcileBlocksAdditive` adiciona os blocos faltantes da
  //   blueprint PRESERVANDO a copy existente (carry-over). No-op se a
  //   estrutura já bate. Resolve lojas legadas presas com poucos blocos.
  // Falhas individuais são logadas mas não bloqueiam o dispatch.
  const flowsById = new Map(flows.map((f) => [f.id, f]))

  // Component Assembler (Epic AE): NÃO roda mais inline no dispatch. Com o
  // Montador em Opus gerando HTML completo (60-180s/email), rodar aqui
  // estourava o maxDuration da função e o dispatch inteiro morria com 504
  // antes de chegar no n8n. O dispatch usa o que existir em
  // store_email_references/store_email_blueprints e cai no fallback global
  // (email_reference_templates / email_blueprints / DEFAULT_BLUEPRINTS) para
  // o que faltar. Gerar/regenerar referência por loja é ação explícita via
  // POST /api/admin/stores/[id]/generate-blueprints ("Regenerar").

  await Promise.all(
    emails.map(async (e) => {
      const flow = flowsById.get(e.flow_id)
      if (!flow) return
      try {
        // Somente-texto: seed/reconcile SEM storeId — a cascata de defs pula
        // store_email_blueprints (legado do Architect) e usa a global.
        const seedStoreId = textOnlyByKey.has(`${flow.flow_type}:${e.number}`)
          ? undefined
          : storeId
        if (FINALIZED_STATUSES.has(e.status)) {
          await ensureBlocksSeeded(e.id, flow.flow_type, e.number, seedStoreId)
        } else {
          await reconcileBlocksAdditive(e.id, flow.flow_type, e.number, seedStoreId)
        }
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
    .select("id, email_id, position, block_type, label, content")
    .in("email_id", emailIds)
    .order("position", { ascending: true })

  if (blocksRes.error) {
    log.error("email_copy.webhook.blocks.error", { storeId, error: blocksRes.error.message })
    return { ok: false, flow_count: 0, email_count: 0, reason: "blocks_query_failed" }
  }

  const blocks = (blocksRes.data ?? []) as BlockRow[]
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

  // Reindexa o map do helper batch (chave `flow_type__email_number`)
  // pro formato consumido aqui (`flow_type:email_number`) e projeta pro
  // shape minimo BlueprintRow — campos extras de store_email_blueprints
  // (image_brief, version etc) sao descartados pois nao sao usados no
  // payload do n8n.
  const blueprintByKey = new Map<string, BlueprintRow>()
  for (const bp of effectiveBlueprints.values()) {
    blueprintByKey.set(`${bp.flow_type}:${bp.email_number}`, {
      flow_type: bp.flow_type,
      email_number: bp.email_number,
      objective: bp.objective ?? null,
      messaging: bp.messaging ?? null,
      subject_hint: bp.subject_hint ?? null,
    })
  }
  // Somente-texto: o blueprint do payload é SEMPRE o global — desfaz o
  // override de store_email_blueprints legado aplicado pela cascata acima.
  for (const [key, bp] of textOnlyByKey) {
    blueprintByKey.set(key, {
      flow_type: bp.flow_type,
      email_number: bp.email_number,
      objective: bp.objective ?? null,
      messaging: bp.messaging ?? null,
      subject_hint: bp.subject_hint ?? null,
    })
  }

  // Blocos do blueprint efetivo por chave — fonte do purpose/copy_spec
  // enviados por bloco ao n8n. Os email_blocks são SEMEADOS do blueprint
  // na mesma ordem, então blocks[position] do blueprint corresponde ao
  // email_block de mesma position (validado por type antes de usar).
  const blueprintBlocksByKey = new Map<string, BlueprintBlock[]>()
  for (const bp of effectiveBlueprints.values()) {
    blueprintBlocksByKey.set(
      `${bp.flow_type}:${bp.email_number}`,
      Array.isArray(bp.blocks) ? bp.blocks : [],
    )
  }

  // "Estrutura geral" por chave — vai no payload dos emails somente-texto.
  const outlineByKey = new Map<string, OutlineRow>()
  for (const o of (outlinesRes.data ?? []) as OutlineRow[]) {
    outlineByKey.set(`${o.flow_type}:${o.email_number}`, o)
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

  // Idioma: a coluna client_stores.language (o que o admin edita na tela)
  // vence. Como a coluna nasce com DEFAULT 'pt-BR', fazemos um upgrade
  // form→coluna ENQUANTO a coluna ainda está no default — assim lojas novas
  // que escolheram outro idioma no formulário não ficam presas em pt-BR.
  // Uma vez que o admin editou pra qualquer coisa != pt-BR, o upgrade não
  // mexe mais e a edição manual sempre vence.
  const currentStoreLang =
    typeof store.language === "string" ? store.language.trim() : ""
  const formLang = resolveStoreLanguage(onboardingRow?.form_responses ?? null)
  let effectiveStoreLang = currentStoreLang
  if (
    formLang.source !== "default" &&
    formLang.code !== currentStoreLang &&
    (!currentStoreLang || currentStoreLang === "pt-BR")
  ) {
    try {
      await admin
        .from("client_stores")
        .update({ language: formLang.code })
        .eq("id", storeId)
      effectiveStoreLang = formLang.code
      log.info("email_copy.webhook.language_synced", {
        storeId,
        from: currentStoreLang || "(empty)",
        to: formLang.code,
        source: formLang.source,
      })
    } catch (err) {
      log.warn("email_copy.webhook.language_sync_failed", {
        storeId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Coluna vence: passa o valor efetivo (já com o upgrade aplicado) como
  // fallback — resolveStoreLanguage retorna esse valor com source 'store'.
  const resolvedLang = resolveStoreLanguage(
    onboardingRow?.form_responses ?? null,
    effectiveStoreLang || null,
  )

  // source 'default' = NINGUÉM escolheu idioma (nem coluna, nem formulário) e
  // o pipeline vai assumir pt-BR. Isso já gerou copy no idioma errado em loja
  // gringa cujo idioma só foi configurado DEPOIS do dispatch — warn explícito
  // pra parar de ser silencioso (o payload também carrega language_source).
  if (resolvedLang.source === "default") {
    log.warn("email_copy.webhook.language_defaulted", {
      storeId,
      language: resolvedLang.code,
      hint: "idioma não configurado na loja nem no formulário — assumindo pt-BR",
    })
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
      // De onde o idioma veio: 'store' (coluna editada no admin), 'form_main'/
      // 'form_other' (formulário de onboarding) ou 'default' (ninguém escolheu
      // — pt-BR assumido). Permite o n8n/debug detectar fallback silencioso.
      language_source: resolvedLang.source,
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
          logo_url: pickBrandLogo(brand, "png")?.url ?? null,
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
    // Pesquisa & Diagnóstico (5 pilares) serializada — contexto rico p/ a copy.
    pesquisa_diagnostico: pesquisaToFullText(store as PesquisaFields),
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
        const key = `${f.flow_type}:${e.number}`
        const bp = blueprintByKey.get(key)
        const textOnly = textOnlyByKey.has(key)
        // Somente-texto: o fluxo diferente do n8n usa a "Estrutura geral"
        // (email_outline_templates) daquele email específico pra gerar o
        // texto; sem outline curado, vai null e o n8n decide o fallback.
        const outline = textOnly ? (outlineByKey.get(key) ?? null) : null
        return {
          email_id: e.id,
          email_number: e.number,
          name: e.name,
          text_only: textOnly,
          estrutura_geral: outline
            ? {
                objective: outline.objective,
                guidance: outline.guidance,
                suggested_blocks: outline.suggested_blocks ?? [],
                tone_hint: outline.tone_hint,
              }
            : null,
          blueprint: bp
            ? {
                objective: bp.objective,
                messaging: bp.messaging,
                subject_hint: bp.subject_hint,
              }
            : null,
          blocks: selectBlocksForCopy(blocksByEmail.get(e.id) ?? []).map(
            (b) => {
              // Bloco correspondente no blueprint (mesma position, semeado
              // na mesma ordem). Se a estrutura divergiu (reseed antigo,
              // edicao manual), o type não casa → default canônico do tipo.
              const bpBlock = blueprintBlocksByKey.get(key)?.[b.position]
              const matched =
                bpBlock && bpBlock.type === b.block_type ? bpBlock : null
              return {
                block_id: b.id,
                position: b.position,
                type: b.block_type,
                label: b.label,
                // Diretiva de conteúdo da seção (do Blueprint agent) — o que
                // a copy precisa entregar neste bloco específico.
                purpose: matched?.purpose?.trim() || null,
                // Orçamento min/max de caracteres por campo — o gerador DEVE
                // respeitar para a copy caber no layout (ver copy-spec.ts).
                copy_spec: normalizeCopySpec(matched?.copy_spec, b.block_type),
              }
            },
          ),
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
  // Telemetria é fire-and-forget, mas a falha PRECISA aparecer no log:
  // este insert ficou meses falhando silenciosamente porque 'copy_dispatch'
  // não estava no CHECK do agent (fix: migration 20260728).
  const { error: telemetryErr } = await admin.from("email_generation_runs").insert({
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
  if (telemetryErr) {
    log.warn("email_copy.telemetry_failed", {
      storeId,
      error_message: telemetryErr.message,
    })
  }

  if (dispatchStatus === "success") {
    // Reseta os emails despachados para um status que o callback do n8n ACEITA
    // (fora de IDEMPOTENT_STATUSES no callback). Antes só resetava `draft`, então
    // regenerar copy de um email já gerado (copy_ready/ready) deixava o status
    // intacto — e o callback do n8n descartava a copy nova como "duplicada"
    // (no-op idempotente). Excluímos approved/live (finalizados publicados) pra
    // não rebaixar email no ar. A dedup de callbacks repetidos DENTRO de uma
    // geração continua: o 1º callback salva e marca copy_ready; os seguintes
    // (já em copy_ready) viram no-op.
    await admin
      .from("email_flow_emails")
      .update({
        status: "in_progress",
        updated_at: new Date().toISOString(),
        // Cinto-suspensorio do cleanup do callback: ja zera os artefatos
        // de fase 2 anterior aqui, antes da copy nova chegar. Garante que,
        // mesmo se o callback falhar/atrasar, o estado intermediario nao
        // mostre html/imagem velha no preview.
        html: null,
        qa_issues: [],
        failure_reason: null,
        rendering_started_at: null,
        qa_started_at: null,
      })
      .in("id", emailIds)
      .in("status", [
        "draft",
        "pending",
        "in_progress",
        "copy_generating",
        "copy_generating_recovery",
        "copy_ready",
        "rendering",
        "qa_running",
        "ready",
        "failed",
      ])
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
