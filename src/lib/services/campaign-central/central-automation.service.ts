/**
 * Registro interno de transições de coluna do board (Fase 4).
 *
 * DECISÃO DE PRODUTO: NÃO há integrações externas (ClickUp/Slack/Omnisend/GA).
 * O envio/agendamento é manual na Omnisend e os dados já estão no banco. Esta
 * service apenas REGISTRA (auditoria) cada avanço de coluna do board — sem
 * vendors, sem HTTP, sem payload de vendor. Grava 1 linha em
 * campaign_automation_runs com integration='internal' e uma mensagem legível.
 *
 * Disparada FIRE-AND-FORGET por moveBoardCard() depois que a transição persiste
 * com sucesso (igual ao estilo de campaign-copy-dispatch.service.ts). Erros aqui
 * são LOGADOS mas NUNCA revertem a transição do board.
 *
 * Idempotência (mantida da Fase 3):
 *   1. Forward-only: só registra transição "para frente" (índice de coluna
 *      crescente). Drag ida-e-volta (ex: design→copy→design) não re-registra
 *      porque a volta é "para trás".
 *   2. Dedup por (pipeline_item_id, to_column, dia): evita registro duplicado
 *      quando o mesmo avanço é repetido no mesmo dia.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { BOARD_COLUMNS, boardColumnIndex } from "./board-mapping"
import type { BoardColumnKey } from "./board-mapping"
import type { AutomationContext } from "@/types/campaign-automation"

const log = logger.child("CampaignCentralAutomation")

/** Rótulo humano de cada coluna (pra mensagem do registro). */
const COLUMN_LABEL: Record<BoardColumnKey, string> = BOARD_COLUMNS.reduce(
  (acc, c) => {
    acc[c.key] = c.label
    return acc
  },
  {} as Record<BoardColumnKey, string>,
)

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
 * Carrega o snapshot mínimo do card (título + suggestion/pipeline ids) pra
 * montar a mensagem do registro. Best-effort: campos ausentes viram fallback
 * (a transição já persistiu; isto é só pro log de auditoria).
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

  // 1) Pipeline item → suggestion atrelada via copy_data.
  if (pipelineItemId) {
    const { data: item } = await admin
      .from("campaign_pipeline_items")
      .select("id, copy_data")
      .eq("id", pipelineItemId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (item) {
      const copy = (item.copy_data ?? {}) as Record<string, unknown>
      suggestionId = (copy.suggestion_id as string | null) ?? suggestionId
    }
  }

  // 2) Suggestion → título da campanha.
  if (suggestionId) {
    const { data: s } = await admin
      .from("campaign_suggestions")
      .select("title")
      .eq("id", suggestionId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (s?.title) title = s.title as string
  }

  return {
    orgId,
    userId,
    fromColumn,
    toColumn,
    suggestionId,
    pipelineItemId,
    title,
  }
}

/** Mensagem legível da transição: `Campanha "X": Copy → Design`. */
function buildMessage(ctx: AutomationContext): string {
  const from = COLUMN_LABEL[ctx.fromColumn] ?? ctx.fromColumn
  const to = COLUMN_LABEL[ctx.toColumn] ?? ctx.toColumn
  return `Campanha "${ctx.title}": ${from} → ${to}`
}

/**
 * Dedup por (pipeline_item_id, to_column, dia): true se já houve um registro
 * pra este card+coluna hoje. Evita registro duplicado quando o mesmo avanço é
 * repetido no mesmo dia (ex: drag ida-e-volta-e-ida). Só aplica quando há
 * pipeline_item_id; cards só-sugestão (sem item) caem na proteção forward-only
 * apenas.
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
    // Em erro de leitura, não bloqueia o registro (a proteção forward-only já
    // cobre o caso comum). Loga pra investigação.
    log.warn("automation.dedup_check_failed", { pipelineItemId, toColumn, error: error.message })
    return false
  }
  return (data?.length ?? 0) > 0
}

/**
 * Registra uma transição de coluna do board. FIRE-AND-FORGET: chame sem await
 * em moveBoardCard. Nunca lança — engole e loga tudo.
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
    const message = buildMessage(ctx)

    const { error: insErr } = await admin.from("campaign_automation_runs").insert({
      org_id: orgId,
      suggestion_id: ctx.suggestionId,
      pipeline_item_id: ctx.pipelineItemId,
      from_column: fromColumn,
      to_column: toColumn,
      integration: "internal",
      status: "success",
      // Colunas de vendor (request_payload/response_*/external_ref) ficam null:
      // não há vendor nem HTTP. error_message guarda a mensagem do registro.
      error_message: message,
      triggered_by: userId,
      duration_ms: null,
    })

    if (insErr) {
      log.error("automation.run_insert_failed", { cardId, to: toColumn, error: insErr.message })
    } else {
      log.info("automation.transition_logged", {
        cardId,
        from: fromColumn,
        to: toColumn,
        message,
      })
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
