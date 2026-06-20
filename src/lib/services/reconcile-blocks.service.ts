/**
 * reconcile-blocks.service — reconcilia a ESTRUTURA dos emails de uma loja
 * com a blueprint vigente, de forma ADITIVA e SEM gerar copy (custo zero de
 * token). Usado pelo botão "Re-sincronizar estrutura" no workspace.
 *
 * Adiciona os blocos faltantes da blueprint preservando a copy já existente
 * (carry-over por `reconcileBlocksAdditive`). No-op nos emails cuja estrutura
 * já bate. Emails finalizados (ready/approved/live) são preservados por padrão;
 * pode-se forçar reescrita passando `force: true` (escolha consciente do user).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { reconcileBlocksAdditive, type ReconcileResult } from "@/lib/agents/seed-blocks"

const log = logger.child("ReconcileBlocks")

// Status finalizados — não mexer na estrutura pronta (a menos que `force=true`).
const FINALIZED_STATUSES = new Set(["ready", "approved", "live"])

export interface ReconcileEmailResult extends ReconcileResult {
  /** Por que pulou, quando não reconciliou por motivo estrutural. */
  skipped: "not_found" | "finalized" | null
  /** True quando atravessou um status finalizado por causa de `force`. */
  forced_through_finalized?: boolean
}

export interface ReconcileOptions {
  /**
   * Quando true, ignora o guard de FINALIZED_STATUSES e reescreve a estrutura
   * mesmo em emails ready/approved/live. A copy existente continua sendo
   * preservada por tipo (carry-over em `reconcileBlocksAdditive`); blocos novos
   * vêm vazios e precisam de regeração de copy depois. Use com consciência —
   * a UI deve confirmar com o user antes.
   */
  force?: boolean
}

/**
 * Reconcilia a estrutura de UM email contra a blueprint VIGENTE da loja,
 * resolvendo o emailId a partir de (storeId, flowType, emailNumber).
 *
 * Usado pelo Architect logo após persistir um `store_email_blueprints` novo,
 * para que os `email_blocks` acompanhem a estrutura recém-gerada — sem isso, um
 * email cuja copy foi semeada ANTES do Architect (ou via regeneração) fica
 * preso na estrutura antiga e o reference do Montador é ignorado pelo HTML agent.
 *
 * Sempre passa `storeId` ao `reconcileBlocksAdditive`, então o blueprint da
 * loja é preferido (cai no global só se a loja não tiver um). Preserva emails
 * finalizados (ready/approved/live), a menos que `options.force=true`.
 */
export async function reconcileEmailStructure(
  storeId: string,
  flowType: string,
  emailNumber: number,
  options: ReconcileOptions = {},
): Promise<ReconcileEmailResult> {
  const admin = createAdminClient()
  const force = options.force === true

  const { data: flow, error: flowErr } = await admin
    .from("email_flows")
    .select("id")
    .eq("store_id", storeId)
    .eq("flow_type", flowType)
    .maybeSingle()
  if (flowErr) throw flowErr
  if (!flow) {
    return { reconciled: false, added: 0, total: 0, skipped: "not_found" }
  }

  const { data: email, error: emailErr } = await admin
    .from("email_flow_emails")
    .select("id, status")
    .eq("flow_id", flow.id as string)
    .eq("number", emailNumber)
    .maybeSingle()
  if (emailErr) throw emailErr
  if (!email) {
    return { reconciled: false, added: 0, total: 0, skipped: "not_found" }
  }

  const wasFinalized = FINALIZED_STATUSES.has(email.status as string)
  if (wasFinalized && !force) {
    return { reconciled: false, added: 0, total: 0, skipped: "finalized" }
  }
  if (wasFinalized && force) {
    log.warn("reconcile.email.forced_through_finalized", {
      storeId,
      flowType,
      emailNumber,
      previousStatus: email.status,
    })
  }

  const r = await reconcileBlocksAdditive(
    email.id as string,
    flowType,
    emailNumber,
    storeId,
  )
  return {
    ...r,
    skipped: null,
    forced_through_finalized: wasFinalized && force,
  }
}

export interface ReconcileStoreResult {
  /** Emails cuja estrutura foi reescrita (estavam defasados). */
  emails_reconciled: number
  /** Total de blocos vazios adicionados (somados em todos os emails). */
  blocks_added: number
  /** Emails elegíveis avaliados (não-finalizados, ou todos quando force=true). */
  emails_evaluated: number
  /** Quantos emails atravessaram o guard de FINALIZED por causa de `force`. */
  forced_finalized?: number
}

export async function reconcileStoreStructure(
  storeId: string,
  options: { flowIds?: string[]; force?: boolean } = {},
): Promise<ReconcileStoreResult> {
  const admin = createAdminClient()
  const force = options.force === true

  let flowQuery = admin
    .from("email_flows")
    .select("id, flow_type")
    .eq("store_id", storeId)
  if (options.flowIds && options.flowIds.length > 0) {
    flowQuery = flowQuery.in("id", options.flowIds)
  }
  const { data: flows, error: flowErr } = await flowQuery
  if (flowErr) throw flowErr
  if (!flows || flows.length === 0) {
    return { emails_reconciled: 0, blocks_added: 0, emails_evaluated: 0 }
  }

  const flowTypeById = new Map(
    flows.map((f) => [f.id as string, f.flow_type as string]),
  )
  const flowIds = flows.map((f) => f.id as string)

  const { data: emails, error: emailErr } = await admin
    .from("email_flow_emails")
    .select("id, flow_id, number, status")
    .in("flow_id", flowIds)
  if (emailErr) throw emailErr

  // Quando force=true, avalia TODOS os emails (inclusive ready/approved/live).
  const targets = (emails ?? []).filter(
    (e) => force || !FINALIZED_STATUSES.has(e.status as string),
  )

  let emailsReconciled = 0
  let blocksAdded = 0
  let forcedFinalized = 0
  // Sequencial: reconcile é no-op na maioria (early-return) e só os emails
  // defasados fazem delete+insert. Evita rajada de queries no Supabase.
  for (const e of targets) {
    const flowType = flowTypeById.get(e.flow_id as string)
    if (!flowType) continue
    const wasFinalized = FINALIZED_STATUSES.has(e.status as string)
    try {
      const r = await reconcileBlocksAdditive(
        e.id as string,
        flowType,
        e.number as number,
        storeId, // preferir o blueprint da loja (store_email_blueprints)
      )
      if (r.reconciled) emailsReconciled++
      blocksAdded += r.added
      if (wasFinalized && force) forcedFinalized++
    } catch (err) {
      log.warn("reconcile.email_failed", {
        storeId,
        emailId: e.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  log.info("reconcile.store.done", {
    storeId,
    force,
    emails_evaluated: targets.length,
    emails_reconciled: emailsReconciled,
    blocks_added: blocksAdded,
    forced_finalized: forcedFinalized,
  })

  return {
    emails_reconciled: emailsReconciled,
    blocks_added: blocksAdded,
    emails_evaluated: targets.length,
    forced_finalized: forcedFinalized,
  }
}
