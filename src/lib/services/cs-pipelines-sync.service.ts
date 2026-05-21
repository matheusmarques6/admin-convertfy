/**
 * Sync bidirecional entre tabelas legadas (store_feedback_calls,
 * store_cadence_overrides) e os deals dos pipelines CS canonicos
 * (Calls Mensais, Cadencias CS).
 *
 * Cada funcao e idempotente e silencia falhas (nao bloqueia o fluxo
 * principal — o legado continua sendo fonte de verdade pra ficha de
 * loja e crons existentes).
 *
 * Acompanhamento tem sync proprio em acompanhamento-flagging.service.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { getCsPipeline } from "@/lib/cs-pipelines"
import { logger } from "@/lib/logger"

const log = logger.child("CsPipelinesSync")

// ─────────────────────────────────────────────────────────────
// CALLS MENSAIS
// ─────────────────────────────────────────────────────────────

interface CallSyncInput {
  callId: string
  storeId: string
  clientId: string
  conductedBy: string | null
  conductedAt: string | null
  nextCallDate: string | null
  notes: string | null
  actionItems: string | null
  durationMinutes: number | null
  resultPercentage: number | null
}

/**
 * Calcula o stage correto pra uma call no pipeline "Calls Mensais"
 * baseado nas datas e no estado de notes/action_items.
 */
function resolveCallStage(args: {
  conductedAt: string | null
  nextCallDate: string | null
  notes: string | null
}): "a_marcar" | "aguardando" | "agendadas" | "hoje" | "pos_call_pendente" | "finalizada" {
  if (args.conductedAt) {
    if (!args.notes || args.notes.trim() === "") return "pos_call_pendente"
    return "finalizada"
  }
  if (args.nextCallDate) {
    const nextDate = new Date(args.nextCallDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const nextDay = new Date(nextDate)
    nextDay.setHours(0, 0, 0, 0)
    const diffDays = Math.round(
      (nextDay.getTime() - today.getTime()) / 86_400_000,
    )
    if (diffDays === 0) return "hoje"
    if (diffDays >= 1 && diffDays <= 3) return "agendadas"
    if (diffDays > 3) return "aguardando"
  }
  return "a_marcar"
}

const CALL_STAGE_ORDER: Record<
  "a_marcar" | "aguardando" | "agendadas" | "hoje" | "pos_call_pendente" | "finalizada",
  number
> = {
  a_marcar: 1,
  aguardando: 2,
  agendadas: 3,
  hoje: 4,
  pos_call_pendente: 5,
  finalizada: 6,
}

/**
 * Sincroniza uma call (criada/atualizada) com o pipeline "Calls Mensais".
 * Idempotente — busca deal existente por custom_fields.legacy_call_id.
 */
export async function syncCallToDeal(args: CallSyncInput): Promise<void> {
  try {
    const admin = createAdminClient()
    const pipeline = await getCsPipeline("calls")
    if (!pipeline) return

    const stageKey = resolveCallStage({
      conductedAt: args.conductedAt,
      nextCallDate: args.nextCallDate,
      notes: args.notes,
    })
    const order = CALL_STAGE_ORDER[stageKey]
    const stage = pipeline.stages.find((s) => s.order === order)
    if (!stage) return

    // Busca dados extras da store
    const { data: store } = await admin
      .from("client_stores")
      .select("store_name, mrr_cents")
      .eq("id", args.storeId)
      .maybeSingle()

    const storeName = store?.store_name ?? "(loja)"
    const dateLabel = args.conductedAt
      ? new Date(args.conductedAt).toLocaleDateString("pt-BR")
      : args.nextCallDate
        ? new Date(args.nextCallDate).toLocaleDateString("pt-BR")
        : "a marcar"
    const title = `${storeName} — Call ${dateLabel}`

    const customFields = {
      conducted_at: args.conductedAt,
      next_call_date: args.nextCallDate,
      duration_minutes: args.durationMinutes,
      notes: args.notes,
      action_items: args.actionItems,
      result_percentage: args.resultPercentage,
      legacy_call_id: args.callId,
    }

    // Existe deal pra essa call?
    const { data: existing } = await admin
      .from("deals")
      .select("id, stage_id")
      .eq("pipeline_id", pipeline.id)
      .contains("custom_fields", { legacy_call_id: args.callId })
      .limit(1)
      .maybeSingle()

    if (existing) {
      // Update stage + custom_fields
      const status = stageKey === "finalizada" ? "won" : "open"
      await admin
        .from("deals")
        .update({
          stage_id: stage.id,
          title,
          status,
          custom_fields: customFields,
        })
        .eq("id", existing.id)
    } else {
      await admin.from("deals").insert({
        pipeline_id: pipeline.id,
        stage_id: stage.id,
        title,
        status: stageKey === "finalizada" ? "won" : "open",
        source: "feedback_call",
        store_id: args.storeId,
        client_id: args.clientId,
        owner_id: args.conductedBy,
        currency: "BRL",
        value: 0,
        custom_fields: customFields,
      })
    }
  } catch (err) {
    log.warn("syncCallToDeal falhou", {
      callId: args.callId,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

// ─────────────────────────────────────────────────────────────
// CADENCIAS CS
// ─────────────────────────────────────────────────────────────

const CADENCE_STAGE_TO_FREQUENCY: Record<number, "weekly" | "biweekly" | "monthly" | "paused"> = {
  1: "weekly",
  2: "biweekly",
  3: "monthly",
  4: "paused",
}

/**
 * Hook chamado em /api/crm/deals/[id]/move quando o deal pertence ao
 * pipeline "Cadencias CS". Atualiza store_cadence_overrides pra refletir
 * a nova frequencia (drag-drop entre colunas).
 *
 * Se o deal nao for de Cadencias, retorna sem fazer nada.
 * Se o deal nao tem store_id, retorna (nao da pra atualizar override).
 */
export async function syncCadenceMove(args: {
  dealId: string
  newStageId: string
  movedBy: string
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const pipeline = await getCsPipeline("cadencias")
    if (!pipeline) return

    // Confirma que o deal eh do pipeline Cadencias e pega store_id
    const { data: deal } = await admin
      .from("deals")
      .select("id, pipeline_id, store_id, custom_fields")
      .eq("id", args.dealId)
      .maybeSingle()
    if (!deal || deal.pipeline_id !== pipeline.id) return
    if (!deal.store_id) return

    // Acha a stage atual e descobre a frequencia correspondente
    const stage = pipeline.stages.find((s) => s.id === args.newStageId)
    if (!stage) return
    const newFrequency = CADENCE_STAGE_TO_FREQUENCY[stage.order]
    if (!newFrequency) return

    // Resolve org_id via store
    const { data: store } = await admin
      .from("client_stores")
      .select("org_id")
      .eq("id", deal.store_id)
      .maybeSingle()
    if (!store?.org_id) return

    // Upsert no override (so cria/atualiza se o user mudou a frequencia)
    const existingOverrideId = (
      deal.custom_fields as { legacy_override_id?: string | null } | null
    )?.legacy_override_id

    if (existingOverrideId) {
      await admin
        .from("store_cadence_overrides")
        .update({
          frequency: newFrequency,
          configured_by: args.movedBy,
          configured_at: new Date().toISOString(),
        })
        .eq("id", existingOverrideId)
    } else {
      const { data: created } = await admin
        .from("store_cadence_overrides")
        .insert({
          org_id: store.org_id,
          store_id: deal.store_id,
          frequency: newFrequency,
          reason: `Configurado via pipeline Cadencias CS`,
          configured_by: args.movedBy,
        })
        .select("id")
        .single()

      if (created) {
        // Atualiza custom_fields do deal pra apontar pro override
        await admin
          .from("deals")
          .update({
            custom_fields: {
              ...(deal.custom_fields as Record<string, unknown> | null),
              frequency: newFrequency,
              legacy_override_id: created.id,
              is_default: false,
            },
          })
          .eq("id", args.dealId)
      }
    }

    log.info("Cadence sync ok", {
      deal_id: args.dealId,
      store_id: deal.store_id,
      new_frequency: newFrequency,
    })
  } catch (err) {
    log.warn("syncCadenceMove falhou", {
      dealId: args.dealId,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}
