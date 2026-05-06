/**
 * Trigger dispatcher: roda automacoes ativas que fazem match com um
 * trigger emitido (deal_stage_change, lead_created etc).
 *
 * Estrategia: lookup em automations com is_active=true e
 * trigger.type = trigger_type, valida filtros, chama executor.
 *
 * Fila? Em producao real, isso vai pra um worker (BullMQ/etc).
 * Aqui executamos sincronamente em fire-and-forget (nao bloqueia
 * o response do endpoint que disparou).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { executeAutomation } from "./crm-automation-executor.service"
import type { CrmTriggerType, CrmAutomationContext } from "@/types/crm-automation"

const log = logger.child("CrmTriggerDispatcher")

interface DispatchParams {
  trigger_type: CrmTriggerType
  org_id: string
  trigger_data: Record<string, unknown>
  context: CrmAutomationContext
  /**
   * Opcional: pra evitar reprocessamento. Ex: deal_stage_change com mesma
   * (deal_id, to_stage_id) so executa uma vez por automation.
   */
  idempotency_key?: string
}

export async function dispatchTrigger(params: DispatchParams): Promise<void> {
  const admin = createAdminClient()

  const { data: automations } = await admin
    .from("automations")
    .select("id, trigger")
    .eq("is_active", true)
    .eq("org_id", params.org_id)

  if (!automations || automations.length === 0) return

  // Filtra por trigger.type matching
  const matched = automations.filter((a) => {
    const t = a.trigger as { type?: string; pipeline_id?: string; to_stage_id?: string } | null
    if (!t || t.type !== params.trigger_type) return false

    // Filtros adicionais
    if (params.trigger_type === "deal_stage_change") {
      const ctx = params.context.deal as { pipeline_id?: string; stage_id?: string } | null
      if (t.pipeline_id && t.pipeline_id !== ctx?.pipeline_id) return false
      if (t.to_stage_id && t.to_stage_id !== ctx?.stage_id) return false
    }
    return true
  })

  if (matched.length === 0) return

  log.info("[Dispatch] firing", {
    trigger_type: params.trigger_type,
    matches: matched.length,
  })

  // Fire-and-forget — nao aguarda resultados
  await Promise.allSettled(
    matched.map((a) =>
      executeAutomation({
        automation_id: a.id,
        trigger_type: params.trigger_type,
        trigger_data: params.trigger_data,
        context: params.context,
        idempotency_key: params.idempotency_key,
      }),
    ),
  )
}
