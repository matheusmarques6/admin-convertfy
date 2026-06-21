/**
 * Motor de automações por transição de coluna do board (Fase 3).
 *
 * Disparado FIRE-AND-FORGET por moveBoardCard() depois que a transição
 * persiste com sucesso (igual ao estilo de campaign-copy-dispatch.service.ts).
 * Erros aqui são LOGADOS mas NUNCA revertem a transição do board — a aba
 * Automações é a única visibilidade de falhas (por isso destacamos 'failed'
 * lá).
 *
 * Fluxo:
 *   1. Idempotência: só dispara em transição "para frente" (índice de coluna
 *      crescente). Drag ida-e-volta (ex: design→copy→design) não re-dispara
 *      porque a volta é "para trás". Defesa extra: dedup por
 *      (pipeline_item_id, to_column, dia) — evita doppel-disparo de um mesmo
 *      avanço repetido no mesmo dia.
 *   2. Carrega o contexto do card (título/assunto/lojas) do banco.
 *   3. Para cada handler do REGISTRY que casa com a coluna de destino:
 *      grava 1 linha em campaign_automation_runs e dispara o efeito (stub).
 *
 * FASE 3 = STUB: os handlers não fazem HTTP; gravam request_payload realista
 * + status='stub'. O contrato permite trocar por HTTP real na Fase 4 sem
 * mudar esta service nem a tabela.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { boardColumnIndex } from "./board-mapping"
import { handlersForColumn } from "./central-automations/registry"
import type { BoardColumnKey } from "./board-mapping"
import type {
  AutomationContext,
  AutomationRunResult,
} from "@/types/campaign-automation"

const log = logger.child("CampaignCentralAutomation")

interface RawTargetStore {
  store_id: string
  store_name?: string
}

export interface ExecuteColumnTransitionParams {
  /** id do card movido (pipeline_item_id OU "sugg:<suggestion_id>"). */
  cardId: string
  fromColumn: BoardColumnKey
  toColumn: BoardColumnKey
  orgId: string
  userId: string
}

/**
 * Resolve suggestionId + pipelineItemId a partir do cardId do board.
 * Aceita "sugg:<id>" (card só-sugestão) ou um pipeline_item_id direto.
 */
function parseCardId(cardId: string): {
  suggestionId: string | null
  pipelineItemId: string | null
} {
  if (cardId.startsWith("sugg:")) {
    return { suggestionId: cardId.slice("sugg:".length), pipelineItemId: null }
  }
  return { suggestionId: null, pipelineItemId: cardId }
}

/**
 * Carrega o snapshot do card (título/assunto/data + lojas) pra montar
 * payloads realistas nos handlers. Best-effort: campos ausentes viram
 * fallback (a transição já persistiu; isto é só pro log da automação).
 */
async function loadContext(
  orgId: string,
  cardId: string,
  fromColumn: BoardColumnKey,
  toColumn: BoardColumnKey,
  userId: string,
): Promise<AutomationContext> {
  const admin = createAdminClient()
  const parsed = parseCardId(cardId)
  let suggestionId = parsed.suggestionId
  const pipelineItemId = parsed.pipelineItemId

  let title = "Campanha"
  let subject: string | null = null
  let sendDate: string | null = null
  let stores: Array<{ store_id: string; store_name: string }> = []

  // 1) Pipeline item: lojas-alvo + suggestion atrelada via copy_data.
  if (pipelineItemId) {
    const { data: item } = await admin
      .from("campaign_pipeline_items")
      .select("id, copy_data, target_stores")
      .eq("id", pipelineItemId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (item) {
      const copy = (item.copy_data ?? {}) as Record<string, unknown>
      suggestionId = (copy.suggestion_id as string | null) ?? suggestionId
      const raw = (item.target_stores as RawTargetStore[] | null) ?? []
      stores = raw.map((t) => ({
        store_id: t.store_id,
        store_name: t.store_name ?? "",
      }))
    }
  }

  // 2) Suggestion: título/assunto/data + (fallback) lojas dos targets.
  if (suggestionId) {
    const { data: s } = await admin
      .from("campaign_suggestions")
      .select("title, subject, send_date, targets")
      .eq("id", suggestionId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (s) {
      title = (s.title as string) ?? title
      subject = (s.subject as string | null) ?? null
      sendDate = (s.send_date as string | null) ?? null
      if (stores.length === 0) {
        const targets =
          (s.targets as Array<{ store_id?: string; store_name?: string }> | null) ?? []
        stores = targets
          .filter((t) => t.store_id)
          .map((t) => ({ store_id: t.store_id as string, store_name: t.store_name ?? "" }))
      }
    }
  }

  return {
    orgId,
    userId,
    fromColumn,
    toColumn,
    suggestionId,
    pipelineItemId,
    title,
    subject,
    sendDate,
    stores,
  }
}

/**
 * Dedup por (pipeline_item_id, to_column, dia): true se já houve uma run
 * pra este card+coluna hoje. Evita doppel-disparo quando o mesmo avanço é
 * repetido no mesmo dia (ex: drag ida-e-volta-e-ida). Só aplica quando há
 * pipeline_item_id; cards só-sugestão (sem item) caem na proteção
 * forward-only apenas.
 */
async function alreadyRanToday(
  orgId: string,
  pipelineItemId: string | null,
  toColumn: BoardColumnKey,
): Promise<boolean> {
  if (!pipelineItemId) return false
  const admin = createAdminClient()
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const { data, error } = await admin
    .from("campaign_automation_runs")
    .select("id")
    .eq("org_id", orgId)
    .eq("pipeline_item_id", pipelineItemId)
    .eq("to_column", toColumn)
    .gte("created_at", startOfDay.toISOString())
    .limit(1)

  if (error) {
    // Em erro de leitura, não bloqueia o disparo (a proteção forward-only já
    // cobre o caso comum). Loga pra investigação.
    log.warn("automation.dedup_check_failed", { pipelineItemId, toColumn, error: error.message })
    return false
  }
  return (data?.length ?? 0) > 0
}

/**
 * Executa as automações de uma transição de coluna. FIRE-AND-FORGET: chame
 * sem await em moveBoardCard. Nunca lança — engole e loga tudo.
 */
export async function executeColumnTransition(
  params: ExecuteColumnTransitionParams,
): Promise<void> {
  const { cardId, fromColumn, toColumn, orgId, userId } = params

  try {
    // ── Idempotência 1: só "para frente" ──────────────────────────────
    const fromIdx = boardColumnIndex(fromColumn)
    const toIdx = boardColumnIndex(toColumn)
    if (toIdx <= fromIdx) {
      log.info("automation.skip_backward", { cardId, from: fromColumn, to: toColumn })
      return
    }

    // Sem handler pra coluna de destino → nada a fazer.
    const handlers = handlersForColumn(toColumn)
    if (handlers.length === 0) {
      log.info("automation.no_handler", { cardId, to: toColumn })
      return
    }

    const ctx = await loadContext(orgId, cardId, fromColumn, toColumn, userId)

    // ── Idempotência 2: dedup por (item, coluna, dia) ─────────────────
    if (await alreadyRanToday(orgId, ctx.pipelineItemId, toColumn)) {
      log.info("automation.skip_duplicate_today", {
        cardId,
        to: toColumn,
        pipelineItemId: ctx.pipelineItemId,
      })
      return
    }

    const admin = createAdminClient()

    // Dispara cada handler em sequência (poucos por coluna; mantém simples).
    for (const handler of handlers) {
      const startedAt = Date.now()
      let result: AutomationRunResult
      try {
        result = await handler.run(ctx)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn("automation.handler_threw", {
          integration: handler.integration,
          cardId,
          to: toColumn,
          error: msg,
        })
        result = {
          status: "failed",
          requestPayload: {},
          errorMessage: msg,
        }
      }
      const durationMs = Date.now() - startedAt

      const { error: insErr } = await admin.from("campaign_automation_runs").insert({
        org_id: orgId,
        suggestion_id: ctx.suggestionId,
        pipeline_item_id: ctx.pipelineItemId,
        from_column: fromColumn,
        to_column: toColumn,
        integration: handler.integration,
        status: result.status,
        request_payload: result.requestPayload,
        response_status: result.responseStatus ?? null,
        response_body: result.responseBody ?? null,
        external_ref: result.externalRef ?? null,
        error_message: result.errorMessage ?? null,
        triggered_by: userId,
        duration_ms: durationMs,
      })

      if (insErr) {
        log.error("automation.run_insert_failed", {
          integration: handler.integration,
          cardId,
          to: toColumn,
          error: insErr.message,
        })
      } else {
        log.info("automation.run_logged", {
          integration: handler.integration,
          cardId,
          from: fromColumn,
          to: toColumn,
          status: result.status,
          duration_ms: durationMs,
        })
      }
    }
  } catch (err) {
    // Barreira final: nada que aconteça aqui pode quebrar o move.
    log.error("automation.execute_failed", {
      cardId,
      from: fromColumn,
      to: toColumn,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
