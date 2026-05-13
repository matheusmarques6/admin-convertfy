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

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { ensureOnboardingBootstrap } from "./onboarding-bootstrap.service"
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
      briefing_status: "not_started",
      entered_at: new Date().toISOString(),
      last_column_change_at: new Date().toISOString(),
      created_by: opts.createdBy,
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
  owner_id?: string | null
  created_by?: string | null
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

  return createOnboarding({
    orgId: deal.org_id,
    clientId: deal.client_id,
    storeId,
    sourceDealId: deal.id,
    createdBy: deal.owner_id ?? deal.created_by ?? null,
  })
}

async function instantiateTaskForColumn(
  onboardingId: string,
  columnId: string,
  createdBy: string | null,
): Promise<void> {
  const admin = createAdminClient()

  const { data: col } = await admin
    .from("operational_pipeline_columns")
    .select("name, default_assignee_role, deliverables_template, slug")
    .eq("id", columnId)
    .maybeSingle()
  if (!col) return

  const { data: onb } = await admin
    .from("onboardings")
    .select("org_id, current_version")
    .eq("id", onboardingId)
    .maybeSingle()
  if (!onb) return

  // Cria task vinculada
  const { data: task } = await admin
    .from("tasks")
    .insert({
      org_id: onb.org_id,
      title: `${col.name}`,
      status: "pending",
      priority: "medium",
      type: "onboarding",
      source_type: "auto_onboarding_step",
      onboarding_id: onboardingId,
      operational_column_id: columnId,
      assignee_role: col.default_assignee_role,
      version: onb.current_version,
      created_by: createdBy,
    })
    .select("id")
    .single()

  if (!task) return

  // Instancia deliverables a partir do template
  const deliverables = (col.deliverables_template ?? []) as Array<{
    slug: string
    label: string
    type: string
    required: boolean
  }>
  if (deliverables.length > 0) {
    const rows = deliverables.map((d) => ({
      task_id: task.id,
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

  return { ok: true }
}

async function validateColumnCompletion(
  onboardingId: string,
  col: OperationalPipelineColumn,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()

  // Pega tasks da coluna nessa versao atual
  const { data: tasks } = await admin
    .from("tasks")
    .select("id, metadata")
    .eq("onboarding_id", onboardingId)
    .eq("operational_column_id", col.id)
  const taskIds = (tasks ?? []).map((t) => t.id)

  // Valida checklist via metadata.checklist_done (array de ids done)
  const requiredChecklist = (col.checklist_template ?? []) as Array<{ id: string }>
  if (requiredChecklist.length > 0 && taskIds.length > 0) {
    const checklistDone = new Set<string>()
    for (const t of tasks ?? []) {
      const meta = (t.metadata ?? {}) as { checklist_done?: string[] }
      for (const id of meta.checklist_done ?? []) checklistDone.add(id)
    }
    const missing = requiredChecklist.filter((c) => !checklistDone.has(c.id))
    if (missing.length > 0) {
      return {
        ok: false,
        error: `Checklist incompleto: ${missing.length} item(ns) pendente(s). Use override pra avancar.`,
      }
    }
  }

  // Valida deliverables required
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

  // Marca versao atual como rejeitada
  await admin
    .from("onboarding_versions")
    .update({
      status: "rejected_by_client",
      client_feedback: opts.feedback,
      feedback_severity: opts.severity,
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
