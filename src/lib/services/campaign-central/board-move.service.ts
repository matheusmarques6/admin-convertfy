/**
 * Execução de um drag no board (Fase 2).
 *
 * O board é uma FACHADA: cada transição de coluna reusa os services já prontos.
 * NÃO reimplementa approve/dispatch/updateProductionStore/reopen.
 *
 * | Transição             | Ação                                    |
 * |-----------------------|-----------------------------------------|
 * | Sugestão → Aprovada   | approveSuggestion() (gate piloto 'good')|
 * | Aprovada → Copy       | dispatchCampaignCopyToN8n(production)    |
 * | colunas 4↔7 (prod)    | updateProductionStore() em bulk          |
 * | voltar p/ Sugestão    | reopenAsDraft() / undoSuggestionDecision |
 *
 * Guard-rails:
 *   - drag só para coluna ADJACENTE (validado aqui e no cliente);
 *   - Sugestão→Aprovada sem piloto 'good' → ConflictError (gate em
 *     approveSuggestion); o cliente pré-desabilita, o servidor é a barreira final;
 *   - colunas de produção movem TODAS as lojas juntas.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/api/errors"
import type { CampaignStage } from "@/types/campaign-pipeline"
import type { BoardColumnKey } from "@/types/campaign-board"
import {
  boardColumnIndex,
  deriveBoardColumn,
  resolveProdStages,
} from "./board-mapping"
import { approveSuggestion, undoSuggestionDecision } from "./suggestion-approval.service"
import { reopenAsDraft, updateProductionStore } from "./production.service"
import { dispatchCampaignCopyToN8n } from "./campaign-copy-dispatch.service"
import { executeColumnTransition } from "./central-automation.service"

const log = logger.child("CampaignBoardMove")

/** prod_stage (0..4) correspondente a cada coluna de produção. */
const COLUMN_TO_PROD_STAGE: Partial<Record<BoardColumnKey, number>> = {
  copy: 0,
  design: 1,
  revisao: 2,
  agendada: 3,
  enviada: 4,
}

const PRODUCTION_COLUMNS: BoardColumnKey[] = ["copy", "design", "revisao", "agendada", "enviada"]

export interface MoveBoardCardParams {
  orgId: string
  userId: string
  /** id do card: pipeline_item_id OU "sugg:<suggestion_id>". */
  cardId: string
  /** Coluna de destino. */
  to: BoardColumnKey
}

export interface MoveBoardCardResult {
  ok: true
  from: BoardColumnKey
  to: BoardColumnKey
  /** Ação reusada (telemetria/UX). */
  action:
    | "approve"
    | "dispatch_copy"
    | "update_production"
    | "reopen_draft"
    | "undo_decision"
}

interface RawTargetStore {
  store_id: string
  prod_stage?: number
}

interface LoadedCard {
  suggestionId: string | null
  pipelineItemId: string | null
  status: "suggested" | "approved" | "dismissed" | null
  hasProductionCopy: boolean
  itemStage: CampaignStage
  rawStores: RawTargetStore[]
  prodStages: number[]
  currentColumn: BoardColumnKey
}

/** Carrega o estado autoritativo do card direto do banco e deriva a coluna atual. */
async function loadCard(orgId: string, cardId: string): Promise<LoadedCard> {
  const admin = createAdminClient()

  // Card só-sugestão: id = "sugg:<suggestion_id>".
  if (cardId.startsWith("sugg:")) {
    const suggestionId = cardId.slice("sugg:".length)
    const { data: s, error } = await admin
      .from("campaign_suggestions")
      .select("id, status, copy_results, pipeline_item_id")
      .eq("id", suggestionId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (error) throw error
    if (!s) throw new NotFoundError("Campanha")

    const copyResults = (s.copy_results ?? {}) as {
      production?: Record<string, unknown>
    }
    const status = (s.status as LoadedCard["status"]) ?? null
    const hasProductionCopy = Object.keys(copyResults.production ?? {}).length > 0

    // Se a sugestão ganhou pipeline_item nesse meio tempo, redireciona p/ ele.
    if (s.pipeline_item_id) {
      return loadCard(orgId, s.pipeline_item_id as string)
    }

    return {
      suggestionId: s.id as string,
      pipelineItemId: null,
      status,
      hasProductionCopy,
      itemStage: "copy_creation",
      rawStores: [],
      prodStages: [],
      currentColumn: deriveBoardColumn({ status, hasProductionCopy, prodStages: [] }),
    }
  }

  // Card de pipeline_item.
  const { data: item, error: itemErr } = await admin
    .from("campaign_pipeline_items")
    .select("id, stage, copy_data, target_stores")
    .eq("id", cardId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (itemErr) throw itemErr
  if (!item) throw new NotFoundError("Campanha")

  const copy = (item.copy_data ?? {}) as Record<string, unknown>
  const suggestionId = (copy.suggestion_id as string | null) ?? null
  const itemStage = item.stage as CampaignStage
  const rawStores = ((item.target_stores as RawTargetStore[] | null) ?? []).map((t) => ({
    store_id: t.store_id,
    prod_stage: t.prod_stage,
  }))
  const prodStages = resolveProdStages(rawStores, itemStage)

  let status: LoadedCard["status"] = "approved"
  let hasProductionCopy = false
  if (suggestionId) {
    const { data: s } = await admin
      .from("campaign_suggestions")
      .select("status, copy_results")
      .eq("id", suggestionId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (s) {
      status = (s.status as LoadedCard["status"]) ?? "approved"
      const cr = (s.copy_results ?? {}) as { production?: Record<string, unknown> }
      hasProductionCopy = Object.keys(cr.production ?? {}).length > 0
    }
  }

  return {
    suggestionId,
    pipelineItemId: item.id as string,
    status,
    hasProductionCopy,
    itemStage,
    rawStores,
    prodStages,
    currentColumn: deriveBoardColumn({ status, hasProductionCopy, prodStages }),
  }
}

/** Move TODAS as lojas do item pro prod_stage da coluna de destino (bulk). */
async function moveAllStoresToStage(
  orgId: string,
  card: LoadedCard,
  targetStage: number,
): Promise<void> {
  if (!card.pipelineItemId) {
    throw new ConflictError("Campanha sem produção iniciada — gere a copy primeiro.")
  }
  // Sequencial: updateProductionStore faz read-modify-write no JSONB; rodar em
  // paralelo na mesma linha causaria lost update.
  for (const s of card.rawStores) {
    await updateProductionStore({
      orgId,
      itemId: card.pipelineItemId,
      storeId: s.store_id,
      prodStage: targetStage,
    })
  }
}

/**
 * Move um card do board (público). Após a transição persistir com sucesso,
 * dispara o motor de automações FIRE-AND-FORGET (igual campaign-copy-dispatch):
 * sem await, erros logam mas NÃO revertem a transição. A barreira de
 * idempotência (só "para frente" + dedup por dia) vive no próprio motor.
 */
export async function moveBoardCard(
  params: MoveBoardCardParams,
): Promise<MoveBoardCardResult> {
  const result = await runBoardMove(params)

  // Fire-and-forget: não bloqueia a resposta do move.
  void executeColumnTransition({
    cardId: params.cardId,
    fromColumn: result.from,
    toColumn: result.to,
    orgId: params.orgId,
    userId: params.userId,
  })

  return result
}

async function runBoardMove(
  params: MoveBoardCardParams,
): Promise<MoveBoardCardResult> {
  const { orgId, userId, cardId, to } = params
  const card = await loadCard(orgId, cardId)
  const from = card.currentColumn

  if (from === to) {
    throw new ValidationError("O card já está nessa coluna.")
  }

  const fromIdx = boardColumnIndex(from)
  const toIdx = boardColumnIndex(to)

  // Guard-rail: só coluna adjacente.
  if (Math.abs(fromIdx - toIdx) !== 1) {
    throw new ValidationError(
      "Só dá pra mover o card para a coluna vizinha (um passo por vez).",
    )
  }

  const forward = toIdx > fromIdx

  // ── Transições "para frente" ─────────────────────────────────────────
  if (forward) {
    // Sugestão → Aprovada
    if (from === "sugestao" && to === "aprovada") {
      if (!card.suggestionId) {
        throw new ConflictError("Card sem sugestão atrelada não pode ser aprovado aqui.")
      }
      // approveSuggestion já valida o gate de piloto 'good' (ConflictError).
      await approveSuggestion({ suggestionId: card.suggestionId, orgId, userId })
      log.info("move.approved", { cardId, from, to })
      return { ok: true, from, to, action: "approve" }
    }

    // Aprovada → Copy: dispara geração de copy de produção pra todas as lojas.
    if (from === "aprovada" && to === "copy") {
      if (!card.suggestionId) {
        throw new ConflictError("Card sem sugestão atrelada não pode gerar copy.")
      }
      const storeIds = await resolveSuggestionStoreIds(orgId, card)
      if (storeIds.length === 0) {
        throw new ConflictError("Campanha sem lojas-alvo para gerar copy.")
      }
      const res = await dispatchCampaignCopyToN8n({
        suggestionId: card.suggestionId,
        orgId,
        mode: "production",
        storeIds,
        triggeredBy: userId,
      })
      if (!res.ok && res.reason === "missing_master_copy") {
        throw new ConflictError(
          "Gere a copy mestre antes de iniciar a produção (abra a campanha e gere a copy).",
        )
      }
      log.info("move.dispatched_copy", { cardId, from, to, job: res.job_id })
      return { ok: true, from, to, action: "dispatch_copy" }
    }

    // Colunas de produção pra frente (copy→design→revisao→agendada→enviada).
    if (PRODUCTION_COLUMNS.includes(from) && PRODUCTION_COLUMNS.includes(to)) {
      const targetStage = COLUMN_TO_PROD_STAGE[to]!
      await moveAllStoresToStage(orgId, card, targetStage)
      log.info("move.production_forward", { cardId, from, to, stage: targetStage })
      return { ok: true, from, to, action: "update_production" }
    }
  }

  // ── Transições "para trás" ───────────────────────────────────────────
  if (!forward) {
    // Aprovada/Copy → Sugestão: reabre como rascunho.
    if (to === "sugestao") {
      if (card.pipelineItemId) {
        // Tem pipeline_item: reverte a sugestão pra 'suggested' sem apagar nada.
        await reopenAsDraft({ orgId, pipelineItemId: card.pipelineItemId, userId })
        log.info("move.reopened", { cardId, from, to })
        return { ok: true, from, to, action: "reopen_draft" }
      }
      if (card.suggestionId) {
        // Sem pipeline_item (aprovada sem produção): desfaz a decisão.
        await undoSuggestionDecision({ suggestionId: card.suggestionId, orgId })
        log.info("move.undone", { cardId, from, to })
        return { ok: true, from, to, action: "undo_decision" }
      }
      throw new ConflictError("Card sem sugestão atrelada não pode voltar para Sugestão.")
    }

    // Copy → Aprovada: "Aprovada" é derivada por AUSÊNCIA de copy de produção
    // (status='approved' E copy_results.production vazio). Uma vez gerada a copy
    // de rollout, nenhum service existente a apaga com segurança — e baixar o
    // prod_stage não tira o card de "Copy" (ele re-deriva pra Copy pq a copy
    // persiste). Em vez de fingir o movimento (otimista + snap-back), é rejeitado
    // com mensagem clara. Pra voltar de fato, use Copy → Sugestão (reabre como
    // rascunho). Conflito documentado entre adjacência do board × derivação.
    if (from === "copy" && to === "aprovada") {
      throw new ConflictError(
        "A copy de produção já foi gerada — não dá pra voltar para 'Aprovada'. " +
          "Arraste para 'Sugestão' para reabrir como rascunho.",
      )
    }

    // Colunas de produção pra trás (design→copy, revisao→design, agendada→revisao).
    if (PRODUCTION_COLUMNS.includes(from) && PRODUCTION_COLUMNS.includes(to)) {
      const targetStage = COLUMN_TO_PROD_STAGE[to]!
      await moveAllStoresToStage(orgId, card, targetStage)
      log.info("move.production_back", { cardId, from, to, stage: targetStage })
      return { ok: true, from, to, action: "update_production" }
    }
  }

  // Qualquer combinação não mapeada (ex: design → aprovada não-adjacente já
  // barrado acima) é rejeitada explicitamente.
  throw new ValidationError(`Transição não suportada: ${from} → ${to}.`)
}

/**
 * Resolve os store_ids alvo de uma sugestão pra disparar a copy de produção.
 * Prioriza as lojas do pipeline_item (já refletem a produção); senão usa os
 * targets da própria sugestão.
 */
async function resolveSuggestionStoreIds(
  orgId: string,
  card: LoadedCard,
): Promise<string[]> {
  if (card.rawStores.length > 0) {
    return card.rawStores.map((s) => s.store_id).filter(Boolean)
  }
  if (!card.suggestionId) return []
  const admin = createAdminClient()
  const { data: s } = await admin
    .from("campaign_suggestions")
    .select("targets")
    .eq("id", card.suggestionId)
    .eq("org_id", orgId)
    .maybeSingle()
  const targets = (s?.targets as Array<{ store_id?: string }> | null) ?? []
  return targets.map((t) => t.store_id ?? "").filter(Boolean)
}
