/**
 * reconcile-blocks.service — reconcilia a ESTRUTURA dos emails de uma loja
 * com a blueprint vigente, de forma ADITIVA e SEM gerar copy (custo zero de
 * token). Usado pelo botão "Re-sincronizar estrutura" no workspace.
 *
 * Adiciona os blocos faltantes da blueprint preservando a copy já existente
 * (carry-over por `reconcileBlocksAdditive`). No-op nos emails cuja estrutura
 * já bate. Emails finalizados (ready/approved/live) são preservados.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { reconcileBlocksAdditive } from "@/lib/agents/seed-blocks"

const log = logger.child("ReconcileBlocks")

// Status finalizados — não mexer na estrutura pronta.
const FINALIZED_STATUSES = new Set(["ready", "approved", "live"])

export interface ReconcileStoreResult {
  /** Emails cuja estrutura foi reescrita (estavam defasados). */
  emails_reconciled: number
  /** Total de blocos vazios adicionados (somados em todos os emails). */
  blocks_added: number
  /** Emails elegíveis avaliados (não-finalizados). */
  emails_evaluated: number
}

export async function reconcileStoreStructure(
  storeId: string,
  options: { flowIds?: string[] } = {},
): Promise<ReconcileStoreResult> {
  const admin = createAdminClient()

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

  const targets = (emails ?? []).filter(
    (e) => !FINALIZED_STATUSES.has(e.status as string),
  )

  let emailsReconciled = 0
  let blocksAdded = 0
  // Sequencial: reconcile é no-op na maioria (early-return) e só os emails
  // defasados fazem delete+insert. Evita rajada de queries no Supabase.
  for (const e of targets) {
    const flowType = flowTypeById.get(e.flow_id as string)
    if (!flowType) continue
    try {
      const r = await reconcileBlocksAdditive(
        e.id as string,
        flowType,
        e.number as number,
      )
      if (r.reconciled) emailsReconciled++
      blocksAdded += r.added
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
    emails_evaluated: targets.length,
    emails_reconciled: emailsReconciled,
    blocks_added: blocksAdded,
  })

  return {
    emails_reconciled: emailsReconciled,
    blocks_added: blocksAdded,
    emails_evaluated: targets.length,
  }
}
