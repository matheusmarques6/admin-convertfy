/**
 * Deal Won Watcher — processa eventos `deal.won` da tabela `events`.
 *
 * Estratégia: o trigger SQL `ensure_onboarding_on_deal_won` insere
 * eventos quando deals trocam pra stage "Fechado Ganho". Aqui um
 * processador idempotente lê eventos não processados, cria onboarding
 * via service, marca evento como processado.
 *
 * Chamado por cron leve (a cada 1min) E inline no PATCH de deals
 * (defesa em profundidade — se trigger não disparou, o frontend chama
 * direto).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { createFromDeal } from "./onboarding-pipeline.service"
import { logger } from "@/lib/logger"

const log = logger.child("DealWonWatcher")

interface DealEventPayload {
  deal_id: string
  client_id: string
  store_id?: string | null
  title?: string | null
}

export async function processDealWonEvents(): Promise<{
  processed: number
  errors: number
}> {
  const admin = createAdminClient()
  const { data: events } = await admin
    .from("events")
    .select("id, payload, metadata, actor_id")
    .eq("event_type", "deal.won")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(50)

  let processed = 0
  let errors = 0

  for (const ev of events ?? []) {
    try {
      const payload = ev.payload as DealEventPayload
      const meta = (ev.metadata ?? {}) as { org_id?: string }
      const orgId = meta.org_id
      if (!orgId) {
        await admin
          .from("events")
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
          })
          .eq("id", ev.id)
        continue
      }

      await createFromDeal({
        id: payload.deal_id,
        org_id: orgId,
        client_id: payload.client_id,
        store_id: payload.store_id ?? null,
        title: payload.title ?? null,
        owner_id: ev.actor_id,
        created_by: ev.actor_id,
      })

      await admin
        .from("events")
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
        })
        .eq("id", ev.id)
      processed++
    } catch (e) {
      errors++
      log.error("Falha processando deal.won event", { id: ev.id, error: e })
    }
  }

  return { processed, errors }
}
