/**
 * Dispara automações quando chega mensagem de um contato.
 *
 * O gatilho "Mensagem recebida" (`thread_message_received`) existia no
 * construtor de automações desde a fase 5, mas NENHUM webhook o emitia:
 * quem montasse o fluxo ficava esperando para sempre. Este módulo é a
 * ponte que faltava entre os webhooks (WhatsApp, Instagram) e o executor.
 *
 * Filtros que o gatilho aceita (em `automations.trigger`):
 *   channel_type  — 'instagram' | 'whatsapp' (vazio = qualquer canal)
 *   event_kind    — 'message' (DM) | 'comment' (comentário no post)
 *   first_message — true dispara só na PRIMEIRA mensagem do contato,
 *                   que é o caso de "entrou no direct → cria negócio".
 *                   Sem isso a automação rodaria a cada resposta.
 *
 * Fire-and-forget: erro aqui nunca pode derrubar a ingestão do webhook —
 * perder a mensagem é pior que perder a automação.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { dispatchTrigger } from "./crm-trigger-dispatcher.service"

const log = logger.child("CrmThreadTrigger")

export interface ThreadMessageEvent {
  org_id: string
  thread_id: string
  channel_id: string
  channel_type: string
  /** DM/mensagem ou comentário em publicação. */
  event_kind?: "message" | "comment"
  contact_external_id: string
  contact_name?: string | null
  message_text?: string | null
  /** Primeira mensagem do contato nesta thread. */
  is_first_message?: boolean
  external_message_id?: string | null
}

/**
 * Emite `thread_message_received`. Nunca lança: o chamador é um webhook
 * que precisa responder 200 mesmo se a automação falhar.
 */
export async function dispatchThreadMessage(
  event: ThreadMessageEvent,
): Promise<void> {
  try {
    const admin = createAdminClient()

    // Contexto completo para as ações do fluxo (criar negócio, atribuir,
    // responder) trabalharem sem consultar o banco de novo.
    const { data: thread } = await admin
      .from("crm_threads")
      .select(
        "id, org_id, channel_id, contact_external_id, contact_name, lead_id, deal_id, client_id, assigned_to, status",
      )
      .eq("id", event.thread_id)
      .maybeSingle()

    await dispatchTrigger({
      trigger_type: "thread_message_received",
      org_id: event.org_id,
      trigger_data: {
        thread_id: event.thread_id,
        channel_id: event.channel_id,
        channel_type: event.channel_type,
        event_kind: event.event_kind ?? "message",
        is_first_message: event.is_first_message ?? false,
        message_text: event.message_text ?? null,
        external_message_id: event.external_message_id ?? null,
      },
      context: {
        trigger_type: "thread_message_received",
        trigger_data: {
          thread_id: event.thread_id,
          channel_type: event.channel_type,
          event_kind: event.event_kind ?? "message",
          is_first_message: event.is_first_message ?? false,
          message_text: event.message_text ?? null,
        },
        thread: thread
          ? {
              ...thread,
              channel_type: event.channel_type,
              contact_name: thread.contact_name ?? event.contact_name ?? null,
            }
          : {
              id: event.thread_id,
              channel_id: event.channel_id,
              channel_type: event.channel_type,
              contact_external_id: event.contact_external_id,
              contact_name: event.contact_name ?? null,
            },
        org_id: event.org_id,
      },
      // Uma mensagem dispara cada automação uma vez, mesmo se a Meta
      // reenviar o evento (webhook duplicado é comum).
      idempotency_key: event.external_message_id
        ? `thread_msg:${event.external_message_id}`
        : undefined,
    })
  } catch (error) {
    log.error("[ThreadTrigger] falha ao disparar", {
      thread: event.thread_id,
      channel: event.channel_type,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
