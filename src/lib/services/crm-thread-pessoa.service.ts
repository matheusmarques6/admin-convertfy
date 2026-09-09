/**
 * A conversa DA PESSOA num canal — criada quando ela ainda não tem uma.
 *
 * Existe por causa do comment gate. A thread de comentários é do POST
 * (`contact_external_id = "comment:<media>"`): cem pessoas comentando caem
 * na MESMA conversa. Tudo que é por pessoa — o negócio na pipeline, o
 * registro da resposta que saiu no direct — precisa de outra conversa, a
 * dela, endereçada pelo id do remetente (o mesmo espaço de identidade que
 * o direct usa, então quando ela responder cai aqui e nada duplica).
 *
 * Nasce `resolved`: a automação já respondeu, não há nada pendente de
 * atendimento. O inbound do webhook reabre quando ela responder.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("CrmThreadPessoa")

export interface ThreadDaPessoa {
  id: string
  deal_id: string | null
  lead_id: string | null
  client_id: string | null
  assigned_to: string | null
  contact_name: string | null
}

export async function garantirThreadDaPessoa(
  admin: ReturnType<typeof createAdminClient>,
  args: { orgId: string; channelId: string; externalId: string; nome?: string | null },
): Promise<ThreadDaPessoa | null> {
  const campos = "id, deal_id, lead_id, client_id, assigned_to, contact_name"

  const { data: existente } = await admin
    .from("crm_threads")
    .select(campos)
    .eq("channel_id", args.channelId)
    .eq("contact_external_id", args.externalId)
    .maybeSingle<ThreadDaPessoa>()

  if (existente) {
    // O nome só é gravado quando falta: sobrescrever a cada passagem é
    // escrita à toa numa tabela que o realtime observa (todo UPDATE
    // acorda todas as abas da org e cada uma relista o inbox).
    if (!existente.contact_name && args.nome) {
      await admin.from("crm_threads").update({ contact_name: args.nome }).eq("id", existente.id)
      return { ...existente, contact_name: args.nome }
    }
    return existente
  }

  const { data: criada, error } = await admin
    .from("crm_threads")
    .insert({
      org_id: args.orgId,
      channel_id: args.channelId,
      contact_external_id: args.externalId,
      contact_name: args.nome ?? null,
      status: "resolved",
      last_message_at: new Date().toISOString(),
    })
    .select(campos)
    .single<ThreadDaPessoa>()

  if (error || !criada) {
    // Corrida com o webhook (a pessoa mandou direct no mesmo instante):
    // relê em vez de falhar — a conversa existe, só não era nossa.
    const { data: relida } = await admin
      .from("crm_threads")
      .select(campos)
      .eq("channel_id", args.channelId)
      .eq("contact_external_id", args.externalId)
      .maybeSingle<ThreadDaPessoa>()
    if (relida) return relida
    log.error("não consegui garantir a conversa da pessoa", { channelId: args.channelId, error })
    return null
  }
  return criada
}
