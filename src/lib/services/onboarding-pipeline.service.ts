/**
 * Onboarding Pipeline Service
 *
 * Funcoes principais:
 *  - createOnboarding: cria onboarding com form_token unico, vincula a
 *    client_stores existente, instancia primeira task
 *  - createFromDeal: idempotente — chamado pelo handler de deal.won
 *  - advanceColumn: valida checklist/deliverables, dispara automacoes
 *  - goBackToColumn: caso especial 6.2 (cliente rejeita preview)
 *  - executeOverride: registra audit log + pula validacao
 *  - confirmBriefing: callback quando cliente confirma briefing inline
 *  - generateTutorialToken: idempotente — gera token quando entra
 *    em etapa de implementacao
 */

import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { ensureOnboardingBootstrap } from "./onboarding-bootstrap.service"
import { dispatchBriefingWebhook } from "./briefing-webhook.service"
import type {
  BriefingContent,
  OperationalPipelineColumn,
  OnboardingPipelineItem,
} from "@/types/onboarding-pipeline"

const log = logger.child("OnboardingPipeline")

function randomToken(len = 24): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let out = ""
  for (let i = 0; i < len; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return out
}

interface CreateOptions {
  orgId: string
  clientId: string
  storeId: string
  sourceDealId?: string | null
  createdBy: string | null
  // Campos comerciais (sprint final)
  plan?: string | null
  mrrValue?: number | null
  clientWhatsapp?: string | null
  language?: string | null
  vertical?: string | null
  source?: "manual" | "deal_won" | "referral" | "migration"
  // Sprint pipeline-final (Bruno): atrela subscription + tracking origem
  subscriptionId?: string | null
  sourceChannel?: string | null
  referredByClientId?: string | null
  referredByName?: string | null
  sourcePipelineId?: string | null
  sourceNotes?: string | null
}

export async function createOnboarding(
  opts: CreateOptions,
): Promise<{ created: boolean; onboarding: OnboardingPipelineItem }> {
  const admin = createAdminClient()
  const { pipelineId, columnIds } = await ensureOnboardingBootstrap(
    opts.orgId,
    opts.createdBy,
  )

  // Idempotencia: ja existe onboarding ativo pra esse client+store?
  const { data: existing } = await admin
    .from("onboardings")
    .select("*")
    .eq("org_id", opts.orgId)
    .eq("client_id", opts.clientId)
    .eq("store_id", opts.storeId)
    .eq("status", "in_progress")
    .maybeSingle()

  if (existing) {
    return { created: false, onboarding: existing as OnboardingPipelineItem }
  }

  const formToken = randomToken(24)
  const initialColumnId = columnIds["entrada"]

  // Se subscription_id foi passado, busca dados pra popular plan/mrr_value.
  // Suporta DOIS tipos de ID:
  //  - UUID local -> client_subscriptions.id (FK direta)
  //  - Asaas ID (ex: "sub_haqy6wnstji7nb74") -> nao eh UUID; faz upsert
  //    de um row local em client_subscriptions com asaas_subscription_id
  //    setado, e usa o id local resultante. Idempotente.
  let resolvedPlan = opts.plan ?? null
  let resolvedMrr = opts.mrrValue ?? null
  let resolvedSubscriptionId: string | null = opts.subscriptionId ?? null

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  if (resolvedSubscriptionId) {
    if (UUID_RE.test(resolvedSubscriptionId)) {
      // Caminho 1: UUID local
      const { data: sub } = await admin
        .from("client_subscriptions")
        .select("name, value, client_id")
        .eq("id", resolvedSubscriptionId)
        .maybeSingle()
      if (sub && sub.client_id === opts.clientId) {
        if (!resolvedPlan) resolvedPlan = sub.name
        if (resolvedMrr === null || resolvedMrr === undefined)
          resolvedMrr = Number(sub.value)
      } else {
        // FK invalida -> evita ON DELETE
        resolvedSubscriptionId = null
      }
    } else {
      // Caminho 2: Asaas ID -> upsert local
      const asaasId = resolvedSubscriptionId
      // Procura row local existente
      const { data: existingLocal } = await admin
        .from("client_subscriptions")
        .select("id, name, value")
        .eq("client_id", opts.clientId)
        .eq("asaas_subscription_id", asaasId)
        .maybeSingle()
      if (existingLocal) {
        resolvedSubscriptionId = existingLocal.id as string
        if (!resolvedPlan && existingLocal.name) resolvedPlan = existingLocal.name as string
        if (resolvedMrr === null || resolvedMrr === undefined)
          resolvedMrr = Number(existingLocal.value)
      } else {
        // Busca dados reais da subscription no Asaas (value + cycle + description)
        // pra criar o stub local ja preenchido.
        let asaasValue = 0
        let asaasCycle = "MONTHLY"
        let asaasName = "Assinatura Asaas"
        try {
          const { data: client } = await admin
            .from("clients")
            .select("custom_fields")
            .eq("id", opts.clientId)
            .maybeSingle()
          const orgIntegrations = await admin
            .from("integrations")
            .select("credentials")
            .eq("type", "asaas")
            .eq("is_active", true)
            .eq("org_id", opts.orgId)
            .maybeSingle()
          if (client?.custom_fields && orgIntegrations.data?.credentials) {
            const { decryptCredentialsJson } = await import("@/lib/crypto")
            const creds = decryptCredentialsJson(
              orgIntegrations.data.credentials as Record<string, unknown>,
            )
            const env = (creds.environment as string) || "sandbox"
            const baseUrl =
              env === "production"
                ? "https://api.asaas.com/v3"
                : "https://sandbox.asaas.com/api/v3"
            const resp = await fetch(`${baseUrl}/subscriptions/${asaasId}`, {
              headers: {
                "Content-Type": "application/json",
                access_token: creds.api_key as string,
              },
            })
            if (resp.ok) {
              const sub = (await resp.json()) as {
                value: number
                cycle?: string
                description?: string
              }
              asaasValue = Number(sub.value) || 0
              asaasCycle = sub.cycle ?? "MONTHLY"
              asaasName = sub.description ?? "Assinatura Asaas"
            }
          }
        } catch (e) {
          log.warn("Falha ao buscar subscription Asaas", e)
        }

        // Cria stub local com dados puxados do Asaas (ou defaults se falhou)
        const subName = resolvedPlan ?? asaasName
        const subValue = resolvedMrr ?? asaasValue
        const todayDate = new Date().toISOString().split("T")[0]
        const { data: inserted } = await admin
          .from("client_subscriptions")
          .insert({
            client_id: opts.clientId,
            name: subName,
            value: subValue,
            cycle: asaasCycle,
            payment_method: "asaas",
            status: "active",
            start_date: todayDate,
            next_due_date: todayDate,
            asaas_subscription_id: asaasId,
            notes: `Auto-criada via onboarding em ${todayDate}`,
          })
          .select("id")
          .single()
        if (inserted?.id) {
          resolvedSubscriptionId = inserted.id as string
          if (!resolvedPlan) resolvedPlan = subName
          if (resolvedMrr === null || resolvedMrr === undefined)
            resolvedMrr = subValue
        } else {
          // Se nao conseguiu criar (RLS, constraint), nao quebra o onboarding
          resolvedSubscriptionId = null
        }
      }
    }
  }

  // Se clientWhatsapp nao foi passado, puxa do cliente
  let resolvedWhatsapp = opts.clientWhatsapp ?? null
  if (!resolvedWhatsapp) {
    const { data: client } = await admin
      .from("clients")
      .select("phone")
      .eq("id", opts.clientId)
      .maybeSingle()
    resolvedWhatsapp = client?.phone ?? null
  }

  const { data: created, error } = await admin
    .from("onboardings")
    .insert({
      org_id: opts.orgId,
      pipeline_id: pipelineId,
      current_column_id: initialColumnId,
      client_id: opts.clientId,
      store_id: opts.storeId,
      source_deal_id: opts.sourceDealId ?? null,
      status: "in_progress",
      current_version: 1,
      form_token: formToken,
      form_token_expires_at: new Date(
        Date.now() + 30 * 24 * 3600 * 1000,
      ).toISOString(),
      briefing_status: "not_started",
      entered_at: new Date().toISOString(),
      last_column_change_at: new Date().toISOString(),
      created_by: opts.createdBy,
      // Campos comerciais (auto-populated da subscription quando disponivel)
      plan: resolvedPlan,
      mrr_value: resolvedMrr,
      client_whatsapp: resolvedWhatsapp,
      language: opts.language ?? "pt-BR",
      vertical: opts.vertical ?? null,
      source: opts.source ?? "manual",
      // Tracking de origem (Bruno - dashboard comercial)
      subscription_id: resolvedSubscriptionId,
      source_channel: opts.sourceChannel ?? null,
      referred_by_client_id: opts.referredByClientId ?? null,
      referred_by_name: opts.referredByName ?? null,
      source_pipeline_id: opts.sourcePipelineId ?? null,
      source_notes: opts.sourceNotes ?? null,
    })
    .select("*")
    .single()

  if (error || !created) {
    throw new Error(`Falha ao criar onboarding: ${error?.message}`)
  }

  // Cria primeira task na coluna Entrada
  await instantiateTaskForColumn(created.id, initialColumnId, opts.createdBy)

  // Cria versao v1
  await admin.from("onboarding_versions").insert({
    onboarding_id: created.id,
    column_id: initialColumnId,
    version_number: 1,
    status: "in_progress",
    created_by: opts.createdBy,
  })

  // Publica evento (best-effort)
  await admin.from("events").insert({
    event_type: "onboarding.created",
    entity_type: "onboarding",
    entity_id: created.id,
    actor_id: opts.createdBy,
    actor_type: "user",
    payload: {
      onboarding_id: created.id,
      client_id: opts.clientId,
      store_id: opts.storeId,
      source_deal_id: opts.sourceDealId ?? null,
    },
    metadata: { org_id: opts.orgId },
  })

  return { created: true, onboarding: created as OnboardingPipelineItem }
}

export async function createFromDeal(deal: {
  id: string
  org_id: string
  client_id: string
  store_id?: string | null
  title?: string | null
  value?: number | string | null
  owner_id?: string | null
  created_by?: string | null
  contact_phone?: string | null
}): Promise<{ created: boolean; onboarding: OnboardingPipelineItem | null }> {
  const admin = createAdminClient()

  // Resolve store: se deal nao tem store_id, usa primeira ativa do cliente
  let storeId = deal.store_id ?? null
  if (!storeId) {
    const { data: stores } = await admin
      .from("client_stores")
      .select("id")
      .eq("client_id", deal.client_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
    storeId = stores?.[0]?.id ?? null
  }

  if (!storeId) {
    // Sem store nem default — cria uma fallback
    const { data: client } = await admin
      .from("clients")
      .select("name, website")
      .eq("id", deal.client_id)
      .maybeSingle()
    const { data: newStore } = await admin
      .from("client_stores")
      .insert({
        org_id: deal.org_id,
        client_id: deal.client_id,
        store_name:
          (client?.name ?? "Loja") + " - " + deal.id.slice(0, 8),
        store_url: client?.website ?? null,
        platform: "other",
        is_active: true,
      })
      .select("id")
      .single()
    storeId = newStore?.id ?? null
  }

  if (!storeId) {
    log.warn("Nao foi possivel resolver store_id pra onboarding from deal", {
      deal_id: deal.id,
    })
    return { created: false, onboarding: null }
  }

  // Buscar telefone do cliente se nao veio no deal
  let phone: string | null = deal.contact_phone ?? null
  if (!phone) {
    const { data: client } = await admin
      .from("clients")
      .select("phone")
      .eq("id", deal.client_id)
      .maybeSingle()
    phone = client?.phone ?? null
  }

  return createOnboarding({
    orgId: deal.org_id,
    clientId: deal.client_id,
    storeId,
    sourceDealId: deal.id,
    createdBy: deal.owner_id ?? deal.created_by ?? null,
    mrrValue: deal.value ? Number(deal.value) : null,
    clientWhatsapp: phone,
    source: "deal_won",
  })
}

/**
 * Auto-instancia (idempotente) as tasks de uma coluna do onboarding.
 * Wrapper exportado pro endpoint GET /api/onboardings/[id] usar como
 * self-healing pra onboardings criados antes da refatoracao do bootstrap.
 */
export async function ensureColumnTasks(
  onboardingId: string,
  columnId: string,
  createdBy: string | null,
): Promise<void> {
  return instantiateTaskForColumn(onboardingId, columnId, createdBy)
}

async function instantiateTaskForColumn(
  onboardingId: string,
  columnId: string,
  createdBy: string | null,
): Promise<void> {
  const admin = createAdminClient()

  const { data: col } = await admin
    .from("operational_pipeline_columns")
    .select(
      "name, default_assignee_role, deliverables_template, checklist_template, sla_hours, slug, color",
    )
    .eq("id", columnId)
    .maybeSingle()
  if (!col) return

  // Pega contexto (store/client) pra popular source_metadata
  const { data: onb } = await admin
    .from("onboardings")
    .select(
      "org_id, current_version, store_id, client_id, client:clients!onboardings_client_id_fkey(name), store:client_stores(store_name)",
    )
    .eq("id", onboardingId)
    .maybeSingle()
  if (!onb) return
  const clientRow = Array.isArray(onb.client) ? onb.client[0] : onb.client
  const storeRow = Array.isArray(onb.store) ? onb.store[0] : onb.store
  const sourceMeta = {
    store_name: storeRow?.store_name ?? null,
    client_name: clientRow?.name ?? null,
    stage_name: col.name,
    stage_color: col.color,
    stage_slug: col.slug,
    onboarding_id: onboardingId,
  }

  type SubChecklistRow = {
    slug: string
    label: string
    from_preview?: string
    completed?: boolean
    preview_deliverable_id?: string | null
    preview_file_url?: string | null
    completed_at?: string | null
    completed_by?: string | null
  }
  type ChecklistRow = {
    id: string
    label: string
    order?: number
    assignee_role?: string | null
    sla_hours?: number
    description?: string
    slug?: string
    auto_complete_on?: Record<string, unknown>
    sub_items?: SubChecklistRow[]
  }
  const checklist = (col.checklist_template ?? []) as ChecklistRow[]

  // Idempotencia: se ja existe pelo menos uma task dessa coluna nessa versao,
  // significa que ja foi instanciado (re-execucao acidental ou go-back).
  const { data: existingTasks } = await admin
    .from("tasks")
    .select("id")
    .eq("onboarding_id", onboardingId)
    .eq("operational_column_id", columnId)
    .eq("version", onb.current_version)
    .limit(1)
  if ((existingTasks ?? []).length > 0) return

  const now = Date.now()
  // Calcula due_date por item (cada task tem o mesmo SLA da coluna a menos
  // que o item especifique seu proprio sla_hours).
  const computeDue = (slaHours: number | undefined): string => {
    const h = typeof slaHours === "number" && slaHours > 0
      ? slaHours
      : col.sla_hours ?? 24
    return new Date(now + h * 3_600_000).toISOString()
  }

  // Novo padrao (refator "1 task por item"):
  // - Cada item do checklist_template vira 1 task atribuivel (assignee_role
  //   herdado do item ou da coluna).
  // - Primeira task criada e marcada como "anchor da coluna" via
  //   metadata.is_column_anchor=true e recebe os deliverables. Isso
  //   simplifica a UI (deliverables aparecem em UM lugar por etapa) e
  //   mantem retrocompat com queries que assumiam 1 task por coluna.
  // - Coluna sem checklist_template (caso de borda) fallback pra criar 1
  //   task "container" com o nome da coluna pra suportar deliverables.

  const ordered = [...checklist].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const itemsToCreate = ordered.length > 0
    ? ordered
    : [{ id: "_default", label: col.name, order: 0 } as ChecklistRow]

  const taskRows = itemsToCreate.map((item, idx) => ({
    org_id: onb.org_id,
    title: item.label,
    description: item.description ?? null,
    status: "pending" as const,
    priority: "medium" as const,
    type: "onboarding" as const,
    source_type: "onboarding",
    source_id: onboardingId,
    source_metadata: sourceMeta,
    onboarding_id: onboardingId,
    operational_column_id: columnId,
    assignee_role: item.assignee_role ?? col.default_assignee_role ?? null,
    version: onb.current_version,
    due_date: computeDue(item.sla_hours ?? col.sla_hours ?? undefined),
    sla_hours: item.sla_hours ?? col.sla_hours ?? 24,
    created_by: createdBy,
    slug: item.slug ?? null,
    auto_complete_on: item.auto_complete_on ?? null,
    metadata: {
      column_slug: col.slug,
      column_name: col.name,
      item_position: item.order ?? idx,
      is_column_anchor: idx === 0,
      // sub_items propagados quando o template define (Etapa 05: emails por flow).
      // Cada sub_item carrega state proprio (completed, preview_file_url, etc).
      // Pre-fill 03->05 atualiza esse array via onboarding-pre-fill.service.
      ...(item.sub_items && item.sub_items.length > 0
        ? { sub_items: item.sub_items.map((si) => ({ ...si, completed: si.completed ?? false })) }
        : {}),
    },
  }))

  const { data: insertedTasks } = await admin
    .from("tasks")
    .insert(taskRows)
    .select("id, metadata")

  if (!insertedTasks || insertedTasks.length === 0) return

  // Popula task_deliverables na PRIMEIRA task criada (anchor da coluna).
  // Single source of truth: deliverables aparecem em UM lugar so, sem
  // duplicar entre as N tasks.
  const anchorTaskId = insertedTasks[0].id
  const deliverables = (col.deliverables_template ?? []) as Array<{
    slug: string
    label: string
    type: string
    required: boolean
  }>
  if (deliverables.length > 0) {
    const rows = deliverables.map((d) => ({
      task_id: anchorTaskId,
      field_slug: d.slug,
      field_label: d.label,
      field_type: d.type,
      required: d.required,
    }))
    await admin.from("task_deliverables").insert(rows)
  }
}

interface AdvanceOptions {
  onboardingId: string
  actorId: string
  forceOverride?: { justification: string; itemsSkipped: unknown[] }
}

export async function advanceColumn(
  opts: AdvanceOptions,
): Promise<{ ok: boolean; onboarding?: OnboardingPipelineItem; error?: string }> {
  const admin = createAdminClient()

  const { data: onb } = await admin
    .from("onboardings")
    .select("*")
    .eq("id", opts.onboardingId)
    .maybeSingle()
  if (!onb) return { ok: false, error: "Onboarding nao encontrado" }
  if (onb.status !== "in_progress")
    return { ok: false, error: "Onboarding nao esta em progresso" }
  if (!onb.current_column_id)
    return { ok: false, error: "Onboarding sem coluna atual" }

  // Busca coluna atual + proxima
  const { data: cols } = await admin
    .from("operational_pipeline_columns")
    .select("*")
    .eq("pipeline_id", onb.pipeline_id)
    .order("position", { ascending: true })

  const sortedCols = (cols ?? []) as OperationalPipelineColumn[]
  const currentIdx = sortedCols.findIndex((c) => c.id === onb.current_column_id)
  if (currentIdx === -1) return { ok: false, error: "Coluna atual invalida" }

  const currentCol = sortedCols[currentIdx]
  const nextCol = sortedCols[currentIdx + 1]

  // Valida checklist + deliverables (a menos que override)
  if (!opts.forceOverride) {
    const validation = await validateColumnCompletion(opts.onboardingId, currentCol)
    if (!validation.ok) {
      return { ok: false, error: validation.error }
    }
  } else {
    await admin.from("task_overrides").insert({
      onboarding_id: opts.onboardingId,
      column_id: currentCol.id,
      user_id: opts.actorId,
      justification: opts.forceOverride.justification,
      items_skipped: opts.forceOverride.itemsSkipped,
    })
  }

  // Se eh coluna final, marca como completed
  if (!nextCol || currentCol.is_final) {
    await admin
      .from("onboardings")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        last_column_change_at: new Date().toISOString(),
      })
      .eq("id", opts.onboardingId)
    await admin.from("events").insert({
      event_type: "onboarding.completed",
      entity_type: "onboarding",
      entity_id: opts.onboardingId,
      actor_id: opts.actorId,
      actor_type: "user",
      payload: { onboarding_id: opts.onboardingId },
      metadata: { org_id: onb.org_id },
    })

    // Email "Conta ativa" pro cliente (Etapa 7 — Resend, fire-and-forget)
    void (async () => {
      try {
        const { sendAccountActiveEmail } = await import(
          "@/lib/services/onboarding-email.service"
        )
        await sendAccountActiveEmail(opts.onboardingId)
      } catch (e) {
        log.error("sendAccountActiveEmail failed", e)
      }
    })()

    return { ok: true }
  }

  // Avanca
  await admin
    .from("onboardings")
    .update({
      current_column_id: nextCol.id,
      last_column_change_at: new Date().toISOString(),
    })
    .eq("id", opts.onboardingId)

  // Marca task da coluna atual como concluida
  await admin
    .from("tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("onboarding_id", opts.onboardingId)
    .eq("operational_column_id", currentCol.id)
    .neq("status", "completed")

  // Instancia task da proxima coluna
  await instantiateTaskForColumn(opts.onboardingId, nextCol.id, opts.actorId)

  // Eventos pra automacoes da coluna
  await admin.from("events").insert({
    event_type: "onboarding.column_changed",
    entity_type: "onboarding",
    entity_id: opts.onboardingId,
    actor_id: opts.actorId,
    actor_type: "user",
    payload: {
      onboarding_id: opts.onboardingId,
      from_column_id: currentCol.id,
      to_column_id: nextCol.id,
    },
    metadata: { org_id: onb.org_id },
  })

  // Casos especiais — automacoes inline
  if (nextCol.slug === "implementacao") {
    await generateTutorialTokenIfMissing(opts.onboardingId)
  }

  // Pre-fill 03->05: copia uploads dos pilotos pros sub_items da Etapa 05.
  // Roda depois do instantiate porque depende das tasks da Etapa 05 existirem.
  if (nextCol.slug === "emails_finais") {
    try {
      const { applyPreFillFromPreview } = await import(
        "@/lib/services/onboarding-pre-fill.service"
      )
      await applyPreFillFromPreview(opts.onboardingId, opts.actorId)
    } catch (e) {
      log.error("applyPreFillFromPreview failed", e)
    }
  }

  // WhatsApp automatico da nova coluna (fire-and-forget)
  if (nextCol.whatsapp_template) {
    void (async () => {
      try {
        const { sendColumnWhatsApp } = await import(
          "@/lib/services/onboarding-whatsapp.service"
        )
        await sendColumnWhatsApp({
          onboardingId: opts.onboardingId,
          columnId: nextCol.id,
        })
      } catch (e) {
        log.error("sendColumnWhatsApp failed", e)
      }
    })()
  }

  // Notificacao inbox interna (fire-and-forget)
  void (async () => {
    try {
      const { notifyColumnChange } = await import(
        "@/lib/services/onboarding-notifications.service"
      )
      await notifyColumnChange({
        onboardingId: opts.onboardingId,
        orgId: onb.org_id,
        fromCol: currentCol,
        toCol: nextCol,
      })
    } catch (e) {
      log.error("notifyColumnChange failed", e)
    }
  })()

  // Sync stage do deal CRM (custom_fields + history + activity)
  void (async () => {
    try {
      const { syncOnboardingStageToDeal } = await import(
        "@/lib/services/onboarding-deal-sync.service"
      )
      await syncOnboardingStageToDeal({
        onboardingId: opts.onboardingId,
        sourceDealId: onb.source_deal_id ?? null,
        fromCol: currentCol,
        toCol: nextCol,
        actorId: opts.actorId,
      })
    } catch (e) {
      log.error("syncOnboardingStageToDeal failed", e)
    }
  })()

  // Schedule follow-up task se a nova coluna depende de resposta do cliente
  void (async () => {
    try {
      const { scheduleColumnFollowup } = await import(
        "@/lib/services/onboarding-followup.service"
      )
      await scheduleColumnFollowup({
        onboardingId: opts.onboardingId,
        orgId: onb.org_id,
        column: nextCol,
        actorId: opts.actorId,
      })
    } catch (e) {
      log.error("scheduleColumnFollowup failed", e)
    }
  })()

  return { ok: true }
}

async function validateColumnCompletion(
  onboardingId: string,
  col: OperationalPipelineColumn,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()

  // IMPORTANT: pega a versao ATUAL do onboarding pra filtrar tasks.
  // Sem isso, apos go-back (v2), validacao misturava tasks v1+v2 e
  // pegava deliverables vazios de v1 como pendentes (Bruno reportou).
  const { data: onb } = await admin
    .from("onboardings")
    .select("current_version")
    .eq("id", onboardingId)
    .maybeSingle()
  const currentVersion = onb?.current_version ?? 1

  // Pega tasks da coluna NA VERSAO ATUAL
  const { data: tasks } = await admin
    .from("tasks")
    .select("id, status, metadata")
    .eq("onboarding_id", onboardingId)
    .eq("operational_column_id", col.id)
    .eq("version", currentVersion)
  const taskList = tasks ?? []
  const taskIds = taskList.map((t) => t.id)

  // Novo padrao "1 task por checklist item":
  // - Cada item do checklist_template virou 1 task individual.
  // - Validacao: TODAS as N tasks da etapa precisam estar status='completed'.
  // - task_checklists ja nao existe pro novo fluxo (legado mantido em
  //   onboardings antigos so pra retrocompat de leitura).
  if (taskList.length > 0) {
    const pendingTasks = taskList.filter((t) => t.status !== "completed")
    if (pendingTasks.length > 0) {
      const count = pendingTasks.length
      const plural = count > 1 ? "s" : ""
      return {
        ok: false,
        error: `${count} tarefa${plural} pendente${plural} nesta etapa. Conclua todas ou use Forcar avanco.`,
      }
    }

    // Etapa 05 (e qualquer outra com sub_items): exige que TODOS os sub_items
    // estejam completos. Designer pode marcar task pai como completed, mas
    // se algum email do flow nao foi entregue, bloqueia avanco (a menos que
    // use Forcar avanco). Override registra os sub_items pulados.
    const subPending: { task_id: string; slug: string; label: string }[] = []
    for (const t of taskList) {
      const meta = (t.metadata ?? {}) as Record<string, unknown>
      const subItems = Array.isArray(meta.sub_items)
        ? (meta.sub_items as Array<{ slug: string; label: string; completed?: boolean }>)
        : []
      for (const s of subItems) {
        if (!s.completed) subPending.push({ task_id: t.id, slug: s.slug, label: s.label })
      }
    }
    if (subPending.length > 0) {
      const count = subPending.length
      const sample = subPending.slice(0, 3).map((s) => s.label).join(", ")
      const more = count > 3 ? ` e mais ${count - 3}` : ""
      return {
        ok: false,
        error: `${count} email${count > 1 ? "s" : ""} pendente${count > 1 ? "s" : ""} no checklist (${sample}${more}).`,
      }
    }
  }

  // Valida deliverables required
  let approvalRecord: string | null = null
  if (taskIds.length > 0) {
    const { data: delivs } = await admin
      .from("task_deliverables")
      .select("field_slug, field_label, required, value, file_url, filled_at")
      .in("task_id", taskIds)
    const missingDeliv = (delivs ?? []).filter((d) => {
      if (!d.required) return false
      const hasValue =
        !!d.value || !!d.file_url || !!d.filled_at
      return !hasValue
    })
    if (missingDeliv.length > 0) {
      return {
        ok: false,
        error: `Entregaveis pendentes: ${missingDeliv.map((d) => d.field_label).join(", ")}`,
      }
    }
    // Captura valor de client_approval_record pra validacao especifica da Etapa 04.
    const approvalDeliv = (delivs ?? []).find(
      (d) => d.field_slug === "client_approval_record",
    )
    approvalRecord = approvalDeliv?.value ?? null
  }

  // Regra especifica Etapa 04 (preview_aprovacao):
  // - Avancar so funciona se client_approval_record === "aprovado".
  // - Outros valores ("ajustes_solicitados", "sem_resposta") exigem usar
  //   o botao Voltar (que chama goBackToColumn com severity).
  if (col.slug === "preview_aprovacao" && approvalRecord) {
    if (approvalRecord !== "aprovado") {
      return {
        ok: false,
        error: `Aprovacao registrada como "${approvalRecord}". Use o botao Voltar pra retornar ao Preview com feedback.`,
      }
    }
  }

  return { ok: true }
}

interface GoBackOptions {
  onboardingId: string
  targetColumnSlug: string
  feedback: string
  severity: "small" | "medium" | "rework_part" | "rework_all"
  actorId: string
}

export async function goBackToColumn(
  opts: GoBackOptions,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: onb } = await admin
    .from("onboardings")
    .select("*")
    .eq("id", opts.onboardingId)
    .maybeSingle()
  if (!onb) return { ok: false, error: "Onboarding nao encontrado" }

  const { data: targetCol } = await admin
    .from("operational_pipeline_columns")
    .select("id, position")
    .eq("pipeline_id", onb.pipeline_id)
    .eq("slug", opts.targetColumnSlug)
    .maybeSingle()
  if (!targetCol) return { ok: false, error: "Coluna alvo nao encontrada" }

  // Valida que target eh anterior a coluna atual
  if (onb.current_column_id) {
    const { data: curCol } = await admin
      .from("operational_pipeline_columns")
      .select("position")
      .eq("id", onb.current_column_id)
      .maybeSingle()
    if (curCol && targetCol.position >= curCol.position) {
      return {
        ok: false,
        error: "Go-back so funciona pra coluna anterior. Use Avancar pra ir adiante.",
      }
    }
  }

  const nextVersion = (onb.current_version ?? 1) + 1

  // Snapshot dos deliverables da coluna alvo da versao atual ANTES de avancar.
  // Persiste em onboarding_versions.deliverables_snapshot pra historico e pra
  // permitir re-aproveitamento na nova versao (rework parcial).
  const { data: previousTasks } = await admin
    .from("tasks")
    .select("id")
    .eq("onboarding_id", opts.onboardingId)
    .eq("operational_column_id", targetCol.id)
    .eq("version", onb.current_version ?? 1)
  const previousTaskIds = (previousTasks ?? []).map((t) => t.id)
  let previousDeliverables: Array<{
    field_slug: string
    field_label: string
    field_type: string
    required: boolean
    value: string | null
    file_url: string | null
    file_name: string | null
    file_size_bytes: number | null
    metadata: Record<string, unknown> | null
  }> = []
  if (previousTaskIds.length > 0) {
    const { data: delivs } = await admin
      .from("task_deliverables")
      .select(
        "field_slug, field_label, field_type, required, value, file_url, file_name, file_size_bytes, metadata",
      )
      .in("task_id", previousTaskIds)
    previousDeliverables = delivs ?? []
  }

  // Marca versao atual como rejeitada + persiste snapshot
  await admin
    .from("onboarding_versions")
    .update({
      status: "rejected_by_client",
      client_feedback: opts.feedback,
      feedback_severity: opts.severity,
      deliverables_snapshot: previousDeliverables,
      completed_at: new Date().toISOString(),
    })
    .eq("onboarding_id", opts.onboardingId)
    .eq("version_number", onb.current_version)

  // Cria nova versao
  await admin.from("onboarding_versions").insert({
    onboarding_id: opts.onboardingId,
    column_id: targetCol.id,
    version_number: nextVersion,
    status: "in_progress",
    created_by: opts.actorId,
  })

  // Volta o card
  await admin
    .from("onboardings")
    .update({
      current_column_id: targetCol.id,
      current_version: nextVersion,
      last_column_change_at: new Date().toISOString(),
    })
    .eq("id", opts.onboardingId)

  // Cria nova task pra refazer
  await instantiateTaskForColumn(opts.onboardingId, targetCol.id, opts.actorId)

  // Preservacao de trabalho: em rework parcial (small/medium/rework_part),
  // copia os deliverables da versao anterior pras tasks recem-instanciadas.
  // Em rework_all, designer comeca do zero (sem copia).
  const preserveDeliverables =
    opts.severity !== "rework_all" && previousDeliverables.length > 0
  if (preserveDeliverables) {
    const { data: newAnchorTasks } = await admin
      .from("tasks")
      .select("id, metadata")
      .eq("onboarding_id", opts.onboardingId)
      .eq("operational_column_id", targetCol.id)
      .eq("version", nextVersion)
      .order("created_at", { ascending: true })
      .limit(1)
    const newAnchorId = newAnchorTasks?.[0]?.id
    if (newAnchorId) {
      // Atualiza os deliverables da nova task anchor com os valores da snapshot
      // (deliverables ja foram criados pelo instantiate com required + labels;
      //  aqui so populamos os valores preenchidos).
      for (const prev of previousDeliverables) {
        const hasValue = !!prev.value || !!prev.file_url
        if (!hasValue) continue
        await admin
          .from("task_deliverables")
          .update({
            value: prev.value,
            file_url: prev.file_url,
            file_name: prev.file_name,
            file_size_bytes: prev.file_size_bytes,
            metadata: prev.metadata ?? {},
            filled_at: new Date().toISOString(),
            filled_by: opts.actorId,
          })
          .eq("task_id", newAnchorId)
          .eq("field_slug", prev.field_slug)
      }
    }
  }

  await admin.from("events").insert({
    event_type: "onboarding.preview_rejected",
    entity_type: "onboarding",
    entity_id: opts.onboardingId,
    actor_id: opts.actorId,
    actor_type: "user",
    payload: {
      onboarding_id: opts.onboardingId,
      feedback: opts.feedback,
      severity: opts.severity,
      new_version: nextVersion,
    },
    metadata: { org_id: onb.org_id },
  })

  return { ok: true }
}

export async function confirmBriefing(
  formToken: string,
  finalBriefing: BriefingContent,
): Promise<{ ok: boolean; onboarding?: OnboardingPipelineItem; error?: string }> {
  const admin = createAdminClient()
  const { data: onb } = await admin
    .from("onboardings")
    .select("*")
    .eq("form_token", formToken)
    .maybeSingle()
  if (!onb) return { ok: false, error: "Token invalido" }

  // Dedup atomico: se ja confirmado, retorna idempotente sem reprocessar
  if (onb.briefing_confirmed_by_client) {
    return { ok: true, onboarding: onb as OnboardingPipelineItem }
  }

  const now = new Date().toISOString()
  // Update condicional — so atualiza se ainda nao foi confirmado.
  // Previne race condition quando cliente clica botao 2x.
  const { data: updated } = await admin
    .from("onboardings")
    .update({
      briefing: { ...finalBriefing, confirmed_at: now },
      briefing_status: "approved",
      briefing_confirmed_at: now,
      briefing_confirmed_by_client: true,
    })
    .eq("id", onb.id)
    .eq("briefing_confirmed_by_client", false)
    .select("id")
    .maybeSingle()

  // Outra request ja confirmou — para aqui
  if (!updated) {
    return { ok: true, onboarding: onb as OnboardingPipelineItem }
  }

  await admin.from("events").insert({
    event_type: "onboarding.briefing_confirmed",
    entity_type: "onboarding",
    entity_id: onb.id,
    actor_id: null,
    actor_type: "client",
    payload: { onboarding_id: onb.id, briefing: finalBriefing },
    metadata: { org_id: onb.org_id },
  })

  // Avanca automaticamente pra "preview_producao"
  const { data: nextCol } = await admin
    .from("operational_pipeline_columns")
    .select("id")
    .eq("pipeline_id", onb.pipeline_id)
    .eq("slug", "preview_producao")
    .maybeSingle()

  if (nextCol) {
    await admin
      .from("tasks")
      .update({ status: "completed", completed_at: now })
      .eq("onboarding_id", onb.id)
      .eq("operational_column_id", onb.current_column_id)
    await admin
      .from("onboardings")
      .update({
        current_column_id: nextCol.id,
        last_column_change_at: now,
      })
      .eq("id", onb.id)
    await instantiateTaskForColumn(onb.id, nextCol.id, null)
  }

  // Notifica time interno (fire-and-forget)
  void (async () => {
    try {
      const { notifyBriefingReady } = await import(
        "@/lib/services/onboarding-notifications.service"
      )
      await notifyBriefingReady({ onboardingId: onb.id, orgId: onb.org_id })
    } catch (e) {
      log.error("notifyBriefingReady failed", e)
    }
  })()

  // AUTO·CLIENTE: marca items "Brand Brain gerado pela IA" + deliverable
  // "form_100_percent_filled" automaticamente (fire-and-forget).
  void (async () => {
    try {
      const { autoCompleteOnBriefingApproved } = await import(
        "@/lib/services/onboarding-auto-checklist.service"
      )
      await autoCompleteOnBriefingApproved(onb.id)
    } catch (e) {
      log.error("autoCompleteOnBriefingApproved failed", e)
    }
  })()

  // Dispara webhook outbound pro n8n (fire-and-forget via after() do Next 15)
  after(dispatchBriefingWebhook(onb.id))

  return { ok: true }
}

async function generateTutorialTokenIfMissing(
  onboardingId: string,
): Promise<void> {
  const admin = createAdminClient()
  const { data: onb } = await admin
    .from("onboardings")
    .select("tutorial_token")
    .eq("id", onboardingId)
    .maybeSingle()
  if (onb?.tutorial_token) return
  await admin
    .from("onboardings")
    .update({ tutorial_token: randomToken(24) })
    .eq("id", onboardingId)
}

export async function requestBriefingRevision(
  onboardingId: string,
  justification: string,
  actorId: string,
): Promise<{ ok: boolean }> {
  const admin = createAdminClient()
  const { data: onb } = await admin
    .from("onboardings")
    .select("org_id, pipeline_id")
    .eq("id", onboardingId)
    .maybeSingle()
  if (!onb) return { ok: false }

  const { data: formCol } = await admin
    .from("operational_pipeline_columns")
    .select("id")
    .eq("pipeline_id", onb.pipeline_id)
    .eq("slug", "cliente_formulario")
    .maybeSingle()
  if (!formCol) return { ok: false }

  await admin
    .from("onboardings")
    .update({
      current_column_id: formCol.id,
      briefing_status: "needs_review",
      last_column_change_at: new Date().toISOString(),
    })
    .eq("id", onboardingId)

  await admin.from("events").insert({
    event_type: "onboarding.briefing_revision_requested",
    entity_type: "onboarding",
    entity_id: onboardingId,
    actor_id: actorId,
    actor_type: "user",
    payload: { onboarding_id: onboardingId, justification },
    metadata: { org_id: onb.org_id },
  })

  return { ok: true }
}
