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
import { DEFAULT_BLUEPRINTS } from "@/lib/agents/email-blueprint"
import { resolveStoreLanguage } from "@/lib/i18n/store-language"
import { pesquisaToFullText, type PesquisaFields } from "@/lib/briefing/briefing-text"
import { pickBrandLogo } from "@/lib/brand/pick-logo"
import type {
  StoreBrandIdentity,
  StoreBriefing,
} from "@/types/email-workspace"
import type {
  BlueprintBlock,
  ReferenceSlotMapEntry,
} from "@/types/email-generation"
import type { BlueprintFieldV2 } from "@/lib/agents/architect/deterministic-blueprint.builder"
import { buildBlockCopySchema } from "@/lib/email-workspace/block-copy-schema"
import { logGenerationRun } from "@/lib/agents/callbacks/telemetry.callback"
import type { InputSummaryItem } from "@/lib/agents/shared/prompt-provenance"
import {
  deriveFieldNature,
  deriveToneKeys,
} from "@/lib/agents/shared/component-dimensions"

const log = logger.child("EmailCopyWebhook")
const TIMEOUT_MS = 15_000

/** Acima disto o run guarda só o esqueleto do payload, não o payload. */
const PAYLOAD_SNAPSHOT_MAX_CHARS = 1_000_000

/**
 * Esqueleto do payload: por bloco, as KEYS pedidas ao n8n. É o suficiente
 * para responder "este campo foi pedido?" sem carregar a copy_guidance e a
 * pesquisa inteiras. Usado só quando o payload passa do teto.
 */
export function digestPayload(payload: unknown): unknown {
  const p = payload as {
    flows?: Array<{
      flow_type?: string
      emails?: Array<{
        email_number?: number
        blocks?: Array<{
          position?: number
          type?: string
          schema?: {
            variante?: string | null
            campos?: Record<string, { exemplo?: string | null }>
          }
        }>
      }>
    }>
  }
  return {
    flows: (p?.flows ?? []).map((f) => ({
      flow_type: f.flow_type,
      emails: (f.emails ?? []).map((e) => ({
        email_number: e.email_number,
        blocks: (e.blocks ?? []).map((b) => {
          const campos = Object.entries(b.schema?.campos ?? {})
          return {
            position: b.position,
            type: b.type,
            variant_name: b.schema?.variante ?? null,
            field_keys: campos.map(([k]) => k),
            fields_sem_example: campos
              .filter(([, v]) => !(v?.exemplo ?? "").trim())
              .map(([k]) => k),
          }
        }),
      })),
    })),
  }
}

/** Contrato de copy resolvido de um bloco (o que vai no payload). */
interface BlockSchema {
  fields: BlueprintFieldV2[]
  variantId: string | null
  variantName: string | null
  purpose: string | null
}

/**
 * Resolve o contrato de copy de cada bloco — o BLOCO É O SCHEMA (20261065).
 *
 * Caminho normal: lê `fields`/`variant_id` da própria linha, gravados no
 * seed a partir do blueprint. Zero adivinhação.
 *
 * Auto-cura: bloco criado antes da migration tem `fields` vazio. Aí sim
 * resolve do blueprint pelo índice (a regra antiga), GRAVA na linha e
 * registra o uso. Não é fallback permanente — o caminho morre quando o
 * último bloco legado for tocado, e enquanto viver aparece em log.
 *
 * `variant_name` e `purpose` continuam vindo do blueprint (são rótulo e
 * diretriz, não contrato) — mas indexados pelo `variant_id` da LINHA, não
 * por posição.
 */
async function resolveBlockSchemas(
  admin: SupabaseClient,
  blocks: BlockRow[],
  emails: EmailRow[],
  flows: EmailFlowRow[],
  blueprintBlocksByKey: Map<string, BlueprintBlock[]>,
): Promise<Map<string, BlockSchema>> {
  const flowTypeById = new Map(flows.map((f) => [f.id, f.flow_type]))
  const emailById = new Map(emails.map((e) => [e.id, e]))
  const out = new Map<string, BlockSchema>()
  const backfill: Array<{ id: string; variant_id: string | null; fields: BlueprintFieldV2[] }> = []

  for (const b of blocks) {
    const email = emailById.get(b.email_id)
    const flowType = email ? flowTypeById.get(email.flow_id) : undefined
    const bpBlocks =
      email && flowType
        ? (blueprintBlocksByKey.get(`${flowType}:${email.number}`) ?? [])
        : []
    // Bloco do blueprint com o MESMO variant_id da linha — sem isso o
    // rótulo/purpose voltariam a depender de posição.
    const rowVariantId = b.variant_id ?? null
    const byVariant = rowVariantId
      ? bpBlocks.find((x) => (x as { variant_id?: string | null }).variant_id === rowVariantId)
      : undefined

    const rowFields = Array.isArray(b.fields) ? b.fields : []
    if (rowFields.length > 0) {
      out.set(b.id, {
        fields: rowFields,
        variantId: rowVariantId,
        variantName:
          (byVariant as { variant_name?: string | null } | undefined)?.variant_name ?? null,
        purpose: (byVariant as { purpose?: string | null } | undefined)?.purpose ?? null,
      })
      continue
    }

    // ── Bloco legado: resolve UMA vez pelo índice e grava.
    const byIndex = (i: number) => {
      const cand = bpBlocks[i]
      return cand && cand.type === b.block_type ? cand : null
    }
    const matched = byIndex(b.position - 1) ?? byIndex(b.position)
    const fields = (Array.isArray(matched?.fields) ? matched.fields : []) as BlueprintFieldV2[]
    const variantId =
      (matched as { variant_id?: string | null } | null)?.variant_id ?? null
    out.set(b.id, {
      fields,
      variantId,
      variantName: (matched as { variant_name?: string | null } | null)?.variant_name ?? null,
      purpose: (matched as { purpose?: string | null } | null)?.purpose ?? null,
    })
    if (fields.length > 0 || variantId) {
      backfill.push({ id: b.id, variant_id: variantId, fields })
    }
    log.warn("email_copy.block_schema_backfill", {
      blockId: b.id,
      position: b.position,
      type: b.block_type,
      resolved_fields: fields.length,
      hint: "bloco anterior à 20261065 — schema resolvido do blueprint e gravado",
    })
  }

  for (const row of backfill) {
    const { error } = await admin
      .from("email_blocks")
      .update({ variant_id: row.variant_id, fields: row.fields })
      .eq("id", row.id)
    if (error) {
      log.warn("email_copy.block_schema_backfill_failed", {
        blockId: row.id,
        error: error.message,
      })
    }
  }

  return out
}

export interface DispatchEmailCopyOptions {
  triggerSource:
    | "briefing_confirmed"
    | "manual_store_button"
    | "pesquisa_completa"
    | "test_full_pipeline"
  flowIds?: string[]
  /**
   * Restringe o dispatch a e-mails específicos (por id). Usado pelo teste
   * "Geração completa", que dispara copy para UM e-mail só — não o flow
   * inteiro. Quando presente, filtra os e-mails enviados ao n8n a esse
   * conjunto (interseção com flowIds/onlyDrafts se também fornecidos).
   */
  emailIds?: string[]
  triggeredBy?: string
  onlyDrafts?: boolean
  /**
   * Envia TODOS os blocos ao n8n para copy nova, ignorando o filtro
   * "mixed mode" (que em email parcialmente preenchido envia só os VAZIOS
   * e preserva a copy antiga dos demais). Sem isso, o teste "Geração
   * completa" regenerava só os blocos que o reconcile criou vazios — na
   * Luxe Lift welcome#3 foi 1 bloco de 12.
   */
  regenerateAll?: boolean
  /**
   * Contexto livre do operador (aba Testar → "Objetivo / contexto").
   * Entra no payload como chave top-level ADITIVA `test_context` — o n8n
   * ignora chaves desconhecidas até o flow ser atualizado pra consumi-la.
   */
  testContext?: string
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
  generation_batch_id: string | null
}

interface BlockRow {
  id: string
  email_id: string
  position: number
  block_type: string
  label: string | null
  content: Record<string, unknown> | null
  // O BLOCO É O SCHEMA (20261065). A linha carrega qual variante instancia e
  // qual contrato de copy tem — dispatch e callback leem daqui, e ninguém
  // mais casa bloco↔variante por índice.
  variant_id: string | null
  fields: BlueprintFieldV2[] | null
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
  // Fio narrativo do Estruturador (fase 3) — aditivo no payload; null em
  // gerações sem Estruturador, rows globais e defaults in-code.
  fio_narrativo?: string | null
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
  coupon_code: string | null
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
    .select("id, flow_id, number, name, status, generation_batch_id")
    .in("flow_id", flowIds)
    .order("number", { ascending: true })

  if (options.onlyDrafts) {
    emailsQuery = emailsQuery.eq("status", "draft")
  }
  // Teste "Geração completa": restringe a copy a e-mails específicos.
  if (options.emailIds && options.emailIds.length > 0) {
    emailsQuery = emailsQuery.in("id", options.emailIds)
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
        .select("flow_type, email_number, objective, guidance, suggested_blocks, tone_hint, coupon_code")
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
        .select("id, flow_id, number, name, status, generation_batch_id")
        .in("flow_id", flowIds)
        .order("number", { ascending: true })
      if (options.onlyDrafts) {
        retryQuery = retryQuery.eq("status", "draft")
      }
      if (options.emailIds && options.emailIds.length > 0) {
        retryQuery = retryQuery.in("id", options.emailIds)
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
  //
  // O teste completo (test_full_pipeline) ganha um guard mais estreito: só
  // bloqueia se já existe COPY em voo pros mesmos emails (dispatch duplicado
  // — incidente Luxe Lift 27/07, dois pipelines paralelos). Emails
  // ready/approved continuam re-testáveis (regenerateAll é o propósito).
  // `in_progress` fica FORA da lista estreita: é status de usuário no
  // workspace E o estacionamento pós-dispatch sem resgate pelo watchdog —
  // incluí-lo tornaria o email permanentemente intestável quando o n8n
  // não devolve a copy. A janela recente já é coberta pelo dedup do
  // runTestGeneration (que roda ANTES da fase 1).
  if (
    options.triggerSource === "pesquisa_completa" ||
    options.triggerSource === "test_full_pipeline"
  ) {
    const ACTIVE_STATUSES =
      options.triggerSource === "pesquisa_completa"
        ? [
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
        : ["pending", "copy_generating", "copy_generating_recovery"]
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
        // log.error, não warn: seed/reconcile falho aqui significa email
        // sem contrato de blocos — o payload sai capenga pro n8n e a fase
        // 2 degrada em cascata (incidente Luxe Lift ago/2026: CHECK de
        // block_type zerava os blocos e o dispatch seguia em silêncio).
        log.error("email_copy.webhook.ensure_blocks_failed", {
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
    .select("id, email_id, position, block_type, label, content, variant_id, fields")
    .in("email_id", emailIds)
    .order("position", { ascending: true })

  if (blocksRes.error) {
    log.error("email_copy.webhook.blocks.error", { storeId, error: blocksRes.error.message })
    return { ok: false, flow_count: 0, email_count: 0, reason: "blocks_query_failed" }
  }

  const blocks = (blocksRes.data ?? []) as BlockRow[]
  const references = (referencesRes.data ?? []) as ReferenceRow[]

  // ── O que ENTROU no documento montado (MC-1) ─────────────────────────
  // O dispatch filtrava bloco por "não tem campo de copy"; a montagem
  // (assembleDocument) descarta por "o Montador não escolheu variante" —
  // e também por HTML vazio ou fragmento irrecuperável. Critérios
  // diferentes: bloco cujo blueprint casou variante (logo tem `fields`)
  // mas que a montagem descartou recebia copy paga e não aparecia no
  // email. Foi o caso do `coupon` da Luxe Lift: variante null no payload
  // e `code`/`value` pedidos assim mesmo.
  //
  // O `slot_map` da reference é a fonte: cada slot diz qual variante e se
  // ela foi montada. Sem `assembled` (slot_map anterior a ago/2026) o
  // email fica FORA do filtro — descartar tudo por falta de dado seria
  // trocar copy desperdiçada por email sem copy nenhuma.
  const montadasPorEmail = new Map<string, Set<string>>()
  {
    const { data: storeRefs, error: refErr } = await admin
      .from("store_email_references")
      .select("flow_type, email_number, slot_map")
      .eq("store_id", storeId)
      .in("flow_type", flowTypes)
    if (refErr) {
      log.warn("email_copy.webhook.slot_map.error", {
        storeId,
        error: refErr.message,
      })
    }
    for (const r of (storeRefs ?? []) as Array<{
      flow_type: string
      email_number: number
      slot_map: ReferenceSlotMapEntry[] | null
    }>) {
      const slots = Array.isArray(r.slot_map) ? r.slot_map : []
      if (!slots.some((s) => typeof s?.assembled === "boolean")) continue
      montadasPorEmail.set(
        `${r.flow_type}:${r.email_number}`,
        new Set(
          slots
            .filter((s) => s.assembled && s.variant_id)
            .map((s) => s.variant_id as string),
        ),
      )
    }
  }

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
      fio_narrativo: bp.fio_narrativo ?? null,
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

  // Blocos do blueprint efetivo por chave — fonte do purpose/fields/variant
  // enviados por bloco ao n8n. Os email_blocks são SEMEADOS do blueprint
  // na mesma ordem, MAS position é 1-based (seed-blocks: idx+1) e o array
  // do blueprint é 0-based — o bloco da position P é blocks[P-1]. Indexar
  // por blocks[P] deslocava tudo em 1: o type nunca casava e TODOS os
  // blocos iam pro n8n sem purpose e com copy_spec default (bug provado na
  // geração Luxe Lift welcome#3 de 18/jul). Validado por type antes de usar.
  const blueprintBlocksByKey = new Map<string, BlueprintBlock[]>()
  for (const bp of effectiveBlueprints.values()) {
    blueprintBlocksByKey.set(
      `${bp.flow_type}:${bp.email_number}`,
      Array.isArray(bp.blocks) ? bp.blocks : [],
    )
  }

  // Fallback in-code (última camada da cascata): combinações SEM row em
  // store_email_blueprints NEM email_blueprints (ex.: post_purchase, que só
  // existe no código; ou banco sem as migrations 20260627*) saíam no payload
  // com blueprint:null e TODOS os blocos sem purpose — o n8n gerava copy às
  // cegas. Completa as chaves faltantes com DEFAULT_BLUEPRINTS, a mesma fonte
  // que o seed da estrutura já usa (resolveStoreOrGlobalBlockDefs), fechando
  // a promessa da cascata banco → in-code também no payload.
  // Mapa SEPARADO de blueprintByKey: no `objective` por email a "Estrutura
  // geral" (outline, curada no banco) vence o default in-code — a cascata lá
  // é bp(banco) > outline > default. Row do banco sempre vence tudo.
  const defaultBlueprintByKey = new Map<string, BlueprintRow>()
  for (const e of emails) {
    const flow = flowsById.get(e.flow_id)
    if (!flow) continue
    const key = `${flow.flow_type}:${e.number}`
    const def = DEFAULT_BLUEPRINTS[flow.flow_type]?.[e.number]
    if (!def) continue
    if (!blueprintByKey.has(key) && !defaultBlueprintByKey.has(key)) {
      defaultBlueprintByKey.set(key, {
        flow_type: flow.flow_type,
        email_number: e.number,
        objective: def.objective,
        messaging: def.messaging,
        subject_hint: def.subject_hint,
      })
    }
    const existing = blueprintBlocksByKey.get(key)
    if (!existing || existing.length === 0) {
      blueprintBlocksByKey.set(key, def.blocks)
    }
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

  // O lookup de `component_variants` (store_email_references.variant_ids +
  // email_component_variants.output_schema) foi REMOVIDO junto com a chave
  // que ele alimentava (20261065): eram duas queries por dispatch para
  // montar uma lista no nível do email que o n8n nunca cruzava com o bloco.
  // O schema agora vem em blocks[].fields, lido da própria linha.

  const onboardingRow = onboardingRes.data as {
    form_responses?: Record<string, unknown> | null
  } | null

  // Tons canônicos da loja (Urgente/Aspiracional/Educacional/Descontraído/
  // Premium/Amigável) — derivados do tom de voz; vão por email no payload v2.
  const storeTones = deriveToneKeys(
    (store.tone_description as string | null) ??
      (store.tom_de_voz as string | null),
  )

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

  // ── Cupom padrão do email (Estrutura geral) ──────────────────────────
  // Grava o código de cupom (único, global) do outline no bloco `coupon`
  // quando ainda está VAZIO (respeita código já preenchido — manual ou por
  // loja). A variação por idioma/loja é feita depois, na etapa por-loja.
  // Determinístico e best-effort: falhas são logadas, não bloqueiam o dispatch.
  const couponCodeByEmailId = new Map<string, string>()
  const couponUpdates: Array<{ id: string; content: Record<string, unknown> }> = []
  for (const e of emails) {
    const flow = flowsById.get(e.flow_id)
    if (!flow) continue
    const outline = outlineByKey.get(`${flow.flow_type}:${e.number}`)
    const code = (outline?.coupon_code ?? "").trim()
    if (!code) continue
    couponCodeByEmailId.set(e.id, code)
    for (const b of blocksByEmail.get(e.id) ?? []) {
      if (b.block_type !== "coupon") continue
      const content = (b.content ?? {}) as Record<string, unknown>
      const existing = typeof content.code === "string" ? content.code.trim() : ""
      if (existing) continue
      const nextContent = { ...content, code }
      b.content = nextContent // reflete no payload montado adiante
      couponUpdates.push({ id: b.id, content: nextContent })
    }
  }
  if (couponUpdates.length > 0) {
    await Promise.all(
      couponUpdates.map((u) =>
        admin
          .from("email_blocks")
          .update({ content: u.content })
          .eq("id", u.id)
          .then(({ error }) => {
            if (error) {
              log.warn("email_copy.webhook.coupon_write_failed", {
                storeId,
                blockId: u.id,
                error: error.message,
              })
            }
          }),
      ),
    )
  }

  // Auditoria de ancoragem do spec: bloco cujos fields de copy saem
  // majoritariamente SEM example não tem âncora no HTML — o merge por
  // example não terá onde escrever a copy que volta (o example É o endereço
  // desde 20/08). Observabilidade: warn + telemetria no run do
  // copy_dispatch; nunca bloqueia o dispatch.
  const fieldsSemExample: Array<{
    flow_type: string
    email_number: number
    position: number
    type: string
    variant_name: string | null
    sem_example: number
    total: number
  }> = []

  // Blocos que chegaram na hora do envio SEM contrato de copy. Erro de
  // CURADORIA: sem variante casada não há schema, e sem schema o n8n volta
  // a gerar a partir do tipo/label — que é como o `hero_cta_2_label` sumiu.
  const blocosSemSchema: Array<{
    flow_type: string
    email_number: number
    position: number
    type: string
    variant_id: string | null
  }> = []

  // Blocos que NÃO foram enviados, com o motivo. Registrado sempre —
  // omissão silenciosa é como um bloco deixa de ser gerado sem ninguém ver.
  //   sem_campo_de_copy      — schema só de imagem/asset: nada a escrever.
  //   sem_variante           — a montagem não tem seção para este bloco.
  //   descartado_na_montagem — tinha variante, mas o HTML dela foi recusado.
  // Os dois últimos são MC-1: pedir copy para seção que não entra no email
  // é gasto puro, e o bloco sumia do documento sem deixar rastro no dispatch.
  const blocosOmitidos: Array<{
    flow_type: string
    email_number: number
    position: number
    type: string
    label: string | null
    variant_name: string | null
    motivo: "sem_campo_de_copy" | "sem_variante" | "descartado_na_montagem"
  }> = []

  // ── O bloco é o schema: resolve o contrato de cada bloco ANTES do envio.
  // Lê da linha; se estiver vazia (bloco anterior à migration 20261065),
  // resolve do blueprint UMA vez e grava. Auto-cura, não fallback
  // permanente: cada uso do caminho antigo sai em log.
  const blockSchemas = await resolveBlockSchemas(
    admin,
    blocks,
    emails,
    flows,
    blueprintBlocksByKey,
  )

  const payload = {
    event: "email_copy.requested" as const,
    timestamp: new Date().toISOString(),
    trigger_source: options.triggerSource,
    // Chave aditiva: contexto livre do operador (teste). null fora do teste.
    test_context: options.testContext?.trim() || null,
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
        // Default in-code — só usado quando o banco não tem blueprint.
        const bpDefault = defaultBlueprintByKey.get(key) ?? null
        const bpEffective = bp ?? bpDefault
        const textOnly = textOnlyByKey.has(key)
        // Payload v2: a "Estrutura geral" (email_outline_templates) vai para
        // TODOS os emails — nos somente-texto continua sendo a fonte da copy;
        // nos demais é contexto do objetivo/tom daquele email do flow.
        const outline = outlineByKey.get(key) ?? null
        return {
          email_id: e.id,
          email_number: e.number,
          name: e.name,
          text_only: textOnly,
          // Chave ADITIVA: batch da geração que originou ESTE dispatch. O
          // n8n deve ecoá-la de volta no callback (dispatch_batch_id) — o
          // callback descarta copy cujo batch divergir do vigente no email
          // (copy atrasada de dispatch antigo sobrescrevendo geração nova).
          // null quando o email nunca teve batch (dispatch manual em draft).
          dispatch_batch_id: e.generation_batch_id ?? null,
          // Objetivo efetivo deste email (blueprint do banco > estrutura
          // geral > default in-code) e os tons canônicos da loja — contexto
          // direto pro gerador de copy.
          objective:
            bp?.objective ?? outline?.objective ?? bpDefault?.objective ?? null,
          tones: storeTones,
          // `component_variants` SAIU daqui (20261065). Era a lista de
          // output_schemas das variantes, no nível do email — e o n8n nunca
          // a cruzava com o bloco que estava gerando. O schema agora vive
          // em blocks[].fields, onde é usado. Uma fonte só.
          //
          // Código literal do cupom já resolvido pelo idioma da loja (null se
          // este email não tem cupom no idioma vigente). Já gravado no bloco
          // `coupon`; repetido aqui pra o n8n ter o valor à mão na copy.
          coupon_code: couponCodeByEmailId.get(e.id) ?? null,
          estrutura_geral: outline
            ? {
                objective: outline.objective,
                guidance: outline.guidance,
                suggested_blocks: outline.suggested_blocks ?? [],
                tone_hint: outline.tone_hint,
                coupon_code: couponCodeByEmailId.get(e.id) ?? null,
              }
            : null,
          blueprint: bpEffective
            ? {
                objective: bpEffective.objective,
                messaging: bpEffective.messaging,
                subject_hint: bpEffective.subject_hint,
                // Aditivo (fase 3 do Estruturador): o fio que liga as
                // posições — o n8n ignora até consumir.
                fio_narrativo: bpEffective.fio_narrativo ?? null,
              }
            : null,
          blocks: (options.regenerateAll
            ? (blocksByEmail.get(e.id) ?? [])
            : selectBlocksForCopy(blocksByEmail.get(e.id) ?? [])
          ).flatMap(
            (b) => {
              // ── O BLOCO É O SCHEMA (20261065) ────────────────────────
              // O contrato de copy sai da PRÓPRIA LINHA. Antes ele era
              // reconstruído aqui casando bloco↔blueprint por índice
              // (`bpBlocks[position-1]`, guardado por type) e, quando o
              // guard falhava, TODOS os campos do bloco viravam default
              // genérico do copy_spec — sem um único log. O mesmo
              // casamento era refeito, de forma independente, no callback.
              //
              // `blockSchemas` já resolveu (e persistiu) o schema de blocos
              // que nasceram antes da migration. Aqui só se lê.
              const resolved = blockSchemas.get(b.id)
              const allFields = resolved?.fields ?? []
              // T8 (naturezas): o n8n escreve COPY — campos de imagem gerada
              // são do agente de imagem e asset_fixo fica intacto; ambos fora
              // do payload. Snapshots sem nature derivam do tipo (image →
              // imagem_gerada; resto → copy).
              const fields = allFields.filter(
                (fld) => deriveFieldNature(fld) === "copy",
              )
              const semExample = fields.filter(
                (fld) => !(fld.example ?? "").trim(),
              ).length
              // Bloco SEM schema é erro de curadoria, não modo de operação:
              // sem variante casada não há contrato, e o n8n volta a
              // inventar o vocabulário. Vai inteiro para a telemetria.
              if (allFields.length === 0) {
                blocosSemSchema.push({
                  flow_type: f.flow_type,
                  email_number: e.number,
                  position: b.position,
                  type: b.block_type,
                  variant_id: resolved?.variantId ?? null,
                })
              }
              if (fields.length > 0 && semExample / fields.length > 0.5) {
                fieldsSemExample.push({
                  flow_type: f.flow_type,
                  email_number: e.number,
                  position: b.position,
                  type: b.block_type,
                  variant_name: resolved?.variantName ?? null,
                  sem_example: semExample,
                  total: fields.length,
                })
              }
              // MC-1: a seção não entrou no documento → não se pede a copy
              // dela. Vale tanto para bloco sem variante quanto para
              // variante que a montagem descartou (HTML vazio, fragmento
              // irrecuperável). Sem `slot_map` utilizável o email inteiro
              // fica fora do filtro.
              const montadas = montadasPorEmail.get(`${f.flow_type}:${e.number}`)
              const variantId = resolved?.variantId ?? null
              if (montadas && (!variantId || !montadas.has(variantId))) {
                blocosOmitidos.push({
                  flow_type: f.flow_type,
                  email_number: e.number,
                  position: b.position,
                  type: b.block_type,
                  label: b.label,
                  variant_name: resolved?.variantName ?? null,
                  motivo: variantId ? "descartado_na_montagem" : "sem_variante",
                })
                return []
              }
              const bloco = {
                block_id: b.id,
                position: b.position,
                type: b.block_type,
                label: b.label,
                variant_id: variantId,
                // PONTE DE TRANSIÇÃO — remover quando `contrato.taxa_pct`
                // do run `copy` estabilizar em 100.
                //
                // O `purpose` também vive em `schema.diretriz`, e essa
                // duplicação é deliberada: o flow do n8n de hoje gera a
                // copy a partir do BLOCO (type/label/purpose) e ignora o
                // schema. Tirá-lo daqui junto com o `fields` deixaria o
                // flow atual sem a única diretriz que ele de fato lê — o
                // email sairia PIOR por causa de uma mudança que só devia
                // preparar o terreno.
                purpose: resolved?.purpose?.trim() || null,
                // `schema` É o contrato, e o ÚNICO. `tags` saiu do bloco
                // (redundante com o placeholder de cada campo) junto com o
                // array component_variants do email: eram a segunda fonte
                // que permitia ao n8n gerar por fora do schema.
                //
                // O array `fields` cru virou objeto endereçável: as chaves
                // de `schema.campos` SÃO as chaves que o n8n devolve em
                // `content`. `variant_name` e `purpose` mudaram de lugar
                // (viraram `variante`/`diretriz` lá dentro) em vez de serem
                // repetidos aqui fora.
                schema: buildBlockCopySchema(fields, {
                  variantName: resolved?.variantName ?? null,
                  purpose: resolved?.purpose ?? null,
                }),
              }
              // Bloco sem NENHUM campo de copy sai do payload. Não é
              // economia de bytes: mandar um bloco vazio junto de um
              // `purpose` de 400 caracteres explicando o que fazer é um
              // convite para o modelo improvisar — foi assim que a faixa de
              // cupom saiu com texto de preheader. Header e footer são
              // preenchidos por código (fillStructural: LOGO, PREHEADER,
              // YEAR, UNSUBSCRIBE_URL, FOOTER_LINK_*, redes), então nunca
              // tiveram o que pedir aqui.
              if (bloco.schema.total_campos === 0) {
                blocosOmitidos.push({
                  flow_type: f.flow_type,
                  email_number: e.number,
                  position: b.position,
                  type: b.block_type,
                  label: b.label,
                  variant_name: bloco.schema.variante,
                  motivo: "sem_campo_de_copy",
                })
                return []
              }
              return [bloco]
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

  // ── Piso: email sem NENHUMA seção de conteúdo não é gerável (MC-2) ───
  // Um documento sem seção alguma não é um email incompleto — é um email
  // que não existe. Sem o piso ele seguia o pipeline inteiro e chegava ao
  // workspace do designer vazio, sem nada indicando por quê. Erro de
  // curadoria tem de parecer erro de curadoria.
  //
  // O critério é a MONTAGEM (`slot_map` sem nenhum slot `assembled`), NÃO
  // o `blocks` do payload: em modo incremental o `selectBlocksForCopy`
  // manda só os blocos ainda vazios, então um email já gerado sai com
  // `blocks: []` — reprová-lo aqui derrubaria justamente quem está pronto.
  //
  // `text_only` fica fora: a copy desses emails vem da estrutura geral, e
  // eles não têm seção montada por construção. Reference sem `assembled`
  // (anterior a ago/2026) também fica fora — mesma razão do filtro de
  // blocos: não se reprova por falta de dado.
  const emailsSemSecao: Array<{
    email_id: string
    flow_type: string
    email_number: number
    name: string | null
  }> = []
  for (const f of payload.flows) {
    f.emails = f.emails.filter((e) => {
      if (e.text_only) return true
      const montadas = montadasPorEmail.get(`${f.flow_type}:${e.email_number}`)
      if (!montadas || montadas.size > 0) return true
      emailsSemSecao.push({
        email_id: e.email_id,
        flow_type: f.flow_type,
        email_number: e.email_number,
        name: e.name,
      })
      return false
    })
  }
  payload.flows = payload.flows.filter((f) => f.emails.length > 0)

  if (emailsSemSecao.length > 0) {
    const semSecaoIds = emailsSemSecao.map((e) => e.email_id)
    log.error("email_copy.emails_sem_secao", {
      storeId,
      count: emailsSemSecao.length,
      sample: emailsSemSecao.slice(0, 10),
      hint: "nenhum bloco com variante montada — regerar as references (generate-blueprints) ou curar as variantes das seções",
    })
    // O motivo fica NA LINHA do email: quem abre o workspace precisa ver
    // por que ele não foi gerado, sem passar pela telemetria.
    const { error: failErr } = await admin
      .from("email_flow_emails")
      .update({
        status: "failed",
        failure_reason: "sem_secao_montada",
        updated_at: new Date().toISOString(),
      })
      .in("id", semSecaoIds)
      // Nunca rebaixa email publicado nem já pronto por uma geração nova.
      .in("status", [
        "draft",
        "pending",
        "in_progress",
        "copy_generating",
        "copy_generating_recovery",
        "failed",
      ])
    if (failErr) {
      log.warn("email_copy.emails_sem_secao.update_failed", {
        storeId,
        error: failErr.message,
      })
    }
  }

  // Sobrou nada para gerar: não se dispara o n8n só para ele não ter o que
  // fazer. Os emails já foram marcados acima com o motivo.
  if (payload.flows.length === 0) {
    log.warn("email_copy.webhook.skip", { storeId, reason: "no_assembled_sections" })
    return {
      ok: false,
      flow_count: 0,
      email_count: 0,
      reason: "no_assembled_sections",
    }
  }

  // Ids efetivamente despachados. Sem esta separação o UPDATE final
  // reverteria para `in_progress` justamente os emails que acabaram de ser
  // marcados `failed` — `failed` está na lista de status que ele aceita.
  const semSecaoIdSet = new Set(emailsSemSecao.map((e) => e.email_id))
  const dispatchedEmailIds = emailIds.filter((id) => !semSecaoIdSet.has(id))

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

    if (fieldsSemExample.length > 0) {
      log.warn("email_copy.fields_sem_example", {
        storeId,
        blocks: fieldsSemExample.length,
        sample: fieldsSemExample.slice(0, 10),
      })
    }

    // Erro de CURADORIA, não do dispatch: o bloco foi enviado sem contrato
    // de copy. É `error` e não `warn` porque o email que sai daqui já sai
    // errado — o n8n vai gerar por conta própria naquele bloco.
    if (blocosSemSchema.length > 0) {
      log.error("email_copy.blocos_sem_schema", {
        storeId,
        blocks: blocosSemSchema.length,
        sample: blocosSemSchema.slice(0, 10),
        hint: "bloco sem variante casada — o Curador não escolheu, ou o blueprint não foi regerado",
      })
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
  // O PAYLOAD ENVIADO, na íntegra. Não estava sendo gravado em lugar nenhum:
  // quando um campo do schema não voltava com copy, não havia como saber se
  // ele tinha sido pedido ao n8n ou se o dispatch o havia perdido no caminho
  // (match bloco↔blueprint por índice, filtro de natureza, blueprint legado
  // caindo em copy_spec). Reconstruir "o que foi enviado" a partir do banco
  // depois do fato é aproximação — o blueprint pode ter sido regerado desde
  // então. Aqui fica o registro exato.
  //
  // Guarda de tamanho: uma loja grande (muitos flows × emails × blocos) pode
  // passar de 1 MB, e a linha de telemetria não pode virar o maior objeto da
  // tabela. Acima do teto grava só o esqueleto por bloco — que ainda responde
  // "este campo foi pedido?", que é a pergunta que importa.
  const payloadJson = JSON.stringify(payload)
  const payloadTooBig = payloadJson.length > PAYLOAD_SNAPSHOT_MAX_CHARS
  const inputVars = payloadTooBig
    ? { payload_truncated: true, payload_chars: payloadJson.length,
        payload_digest: digestPayload(payload) }
    : { payload_truncated: false, payload_chars: payloadJson.length,
        payload }

  // ── Identidade da run (ago/2026) ──
  // Até aqui o insert era cru e não gravava email/flow/batch — e as DUAS
  // abas do Estúdio filtram por isso (Execuções por email_id; Teste por
  // email_id OU batch_id). Resultado: o payload ficava gravado e ninguém
  // conseguia abrir. O batch sai dos próprios emails (já ecoado no payload
  // como `dispatch_batch_id`); email/flow só quando o lote é de UM email —
  // que é o caminho do Estúdio (a aba Teste sempre despacha 1).
  const batches = new Set(
    emails.map((e) => e.generation_batch_id).filter((b): b is string => !!b),
  )
  const loteDeUm = dispatchedEmailIds.length === 1
  const emailDoLote = loteDeUm
    ? emails.find((e) => e.id === dispatchedEmailIds[0])
    : undefined

  // Entrada estruturada: o que foi ENVIADO, com origem. Os números saem do
  // payload já montado — nada é recalculado.
  const emailsDoPayload = payload.flows.flatMap((f) => f.emails)
  const blocosTotal = emailsDoPayload.reduce((n, e) => n + e.blocks.length, 0)
  const camposTotal = emailsDoPayload.reduce(
    (n, e) =>
      n +
      e.blocks.reduce(
        (m, b) => m + Object.keys(b.schema?.campos ?? {}).length,
        0,
      ),
    0,
  )
  const comFio = emailsDoPayload.filter((e) => !!e.blueprint?.fio_narrativo).length
  const inputSummary: InputSummaryItem[] = [
    {
      rotulo: "Loja",
      cls: "loja",
      // O select do store é `select("*")`-ish e o TS infere `{}` no campo;
      // aqui só precisamos do rótulo legível.
      valor: String(payload.store?.store_name ?? "") || storeId,
    },
    {
      rotulo: "Lote",
      cls: "sistema",
      valor: `${flows.length} flow(s) · ${emails.length} email(s) · disparo ${options.triggerSource}`,
    },
    {
      rotulo: "Blocos enviados",
      cls: "sistema",
      valor: `${blocosTotal} bloco(s) em ${emailsDoPayload.length} email(s)`,
    },
    {
      rotulo: "Campos pedidos ao n8n",
      cls: "biblioteca",
      valor: `${camposTotal} campo(s) — do output_schema das variantes casadas`,
    },
    {
      rotulo: "Blueprint + fio narrativo",
      cls: "upstream",
      valor: comFio > 0
        ? `${comFio} de ${emailsDoPayload.length} email(s) com fio do Estruturador`
        : "sem fio nesta geração (consumidores caem no messaging)",
    },
    {
      rotulo: "Pesquisa & Diagnóstico",
      cls: "loja",
      valor: `${(payload.pesquisa_diagnostico ?? "").length.toLocaleString("pt-BR")} chars`,
    },
    {
      rotulo: "Top produtos",
      cls: "loja",
      valor: `${payload.top_products?.length ?? 0} produto(s)`,
    },
    {
      rotulo: "Payload",
      cls: "sistema",
      valor: payloadTooBig
        ? `${payloadJson.length.toLocaleString("pt-BR")} chars — acima do teto, gravado o esqueleto (digest)`
        : `${payloadJson.length.toLocaleString("pt-BR")} chars — gravado na íntegra`,
    },
  ]

  const telemetryRunId = await logGenerationRun({
    storeId,
    // Batch único no lote → a run entra na aba Teste; heterogêneo → "" (o
    // helper normaliza para null) e ela fica só na aba de Logs.
    batchId: batches.size === 1 ? Array.from(batches)[0] : "",
    emailId: emailDoLote?.id,
    flowId: emailDoLote?.flow_id,
    triggeredBy: options.triggeredBy,
    agent: "copy_dispatch",
    status: dispatchStatus,
    model: "n8n",
    durationMs: Date.now() - t0,
    inputVars,
    inputSummary,
    errorMessage: dispatchError ?? undefined,
    parsedOutput: {
      trigger_source: options.triggerSource,
      flow_count: flows.length,
      email_count: emails.length,
      only_drafts: options.onlyDrafts ?? false,
      // Blocos com spec desancorado (fields de copy sem example) —
      // incoerência schema↔HTML na variante, visível no drawer de logs.
      ...(fieldsSemExample.length > 0
        ? { fields_sem_example: fieldsSemExample.slice(0, 30) }
        : {}),
      // Blocos que saíram SEM contrato de copy. O bloco é o schema: sem
      // fields o n8n não tem o que preencher e volta a inventar as chaves.
      ...(blocosSemSchema.length > 0
        ? { blocos_sem_schema: blocosSemSchema.slice(0, 30) }
        : {}),
      // Blocos que ficaram FORA do payload por não terem copy a pedir
      // (header/footer são preenchidos por código). Sem este registro, um
      // bloco deixaria de ser gerado sem deixar rastro.
      ...(blocosOmitidos.length > 0
        ? { blocos_omitidos: blocosOmitidos.slice(0, 30) }
        : {}),
      // Emails que não foram gerados por não sobrar seção nenhuma (MC-2).
      // Ficam marcados `failed` com `failure_reason='sem_secao_montada'`.
      ...(emailsSemSecao.length > 0
        ? { emails_sem_secao: emailsSemSecao.slice(0, 30) }
        : {}),
    },
  })
  // logGenerationRun nunca lança: devolve "" e loga `telemetry.insert_failed`.
  // A falha PRECISA aparecer — este insert ficou meses falhando em silêncio
  // porque 'copy_dispatch' não estava no CHECK do agent (migration 20260728).
  if (!telemetryRunId) {
    log.warn("email_copy.telemetry_failed", { storeId })
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
        // Geração NOVA zera o cap de re-dispatch do watchdog. Sem isto, um
        // email cujo contador esgotou (3 POSTs de fase 2 falhos) numa geração
        // ANTERIOR ficava preso em copy_ready PRA SEMPRE na seguinte: o
        // Front 4 do watchdog filtra attempts < MAX e nunca mais o pegava
        // (bug provado na Luxe Lift, dispatch 24/jul 21h — copy voltou e a
        // fase 2 nunca iniciou, sem erro e sem log).
        copy_ready_dispatch_attempts: 0,
      })
      .in("id", dispatchedEmailIds)
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
