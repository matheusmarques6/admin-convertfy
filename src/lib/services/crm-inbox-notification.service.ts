/**
 * Notificações do inbox comercial (CRM) — sino do admin.
 *
 * Produtor ÚNICO das notificações de mensagem recebida: os webhook
 * processors (Cloud API e Evolution) chamam notifyCrmInboundMessage
 * após um insert REAL em crm_messages; o read route e o send route
 * chamam clearCrmThreadNotifications quando a conversa é vista.
 *
 * Regras (ver docs/crm/inbox-notifications.md):
 * - Destinatários: assigned_to da thread se ativo na org; senão
 *   todos os membros ativos (ninguém perde lead sem dono).
 * - Coalescência: 1 notificação aberta por (thread, user), feita em
 *   SQL via RPC upsert_crm_inbox_notification (atômica sob webhooks
 *   concorrentes — migration 20260718_crm_inbox_notifications.sql).
 * - Clear GLOBAL: quando qualquer agente abre/responde, a notificação
 *   some para todos — espelha crm_threads.unread_count, que é global.
 * - Best-effort: nenhuma função lança; falha de notificação NUNCA
 *   pode falhar o webhook nem as rotas do inbox.
 *
 * Futuro push mobile: o hook de envio (FCM/APNs ou realtime no app)
 * entra AQUI, após o RPC — este módulo é o seam de integração.
 *
 * Importar direto (não pelo barrel de services) — roda em webhook/
 * route handlers server-side com o admin client injetado.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

const log = logger.child("CrmInboxNotification")

export const CRM_INBOX_NOTIFICATION_SOURCE = "crm_inbox"

const PREVIEW_MAX_LENGTH = 120

/** Labels de preview para mensagens sem corpo textual útil. */
const MEDIA_PREVIEW_LABELS: Record<string, string> = {
  image: "📷 Imagem",
  audio: "🎤 Áudio",
  video: "🎬 Vídeo",
  document: "📄 Documento",
  sticker: "Figurinha",
  location: "📍 Localização",
  contact: "👤 Contato",
}

/**
 * Monta o corpo da notificação a partir do conteúdo da mensagem.
 * Texto (e tipos com corpo legível, ex: interactive) é truncado;
 * mídia vira label fixo — o corpo de mídia costuma ser caption ou
 * nome de arquivo e o label deixa o tipo óbvio no sino.
 */
export function buildNotificationPreview(contentType: string, body: string | null): string {
  const mediaLabel = MEDIA_PREVIEW_LABELS[contentType]
  if (mediaLabel) return mediaLabel

  const text = body?.trim()
  if (!text) return "Nova mensagem"
  if (text.length <= PREVIEW_MAX_LENGTH) return text
  return `${text.slice(0, PREVIEW_MAX_LENGTH - 1)}…`
}

/**
 * Resolve quem recebe a notificação.
 * - Thread atribuída a um membro ATIVO → só ele.
 * - Sem responsável (ou responsável fora da org/inativo) → broadcast
 *   para todos os membros ativos.
 * - Org sem membros ativos → ninguém (lista vazia).
 */
export function pickRecipients(
  assignedTo: string | null,
  activeMemberProfileIds: string[],
): string[] {
  if (assignedTo && activeMemberProfileIds.includes(assignedTo)) {
    return [assignedTo]
  }
  return activeMemberProfileIds
}

/**
 * Cria/coalesce a notificação de mensagem recebida para os
 * destinatários da thread. Nunca lança — qualquer erro vira log.warn.
 */
export async function notifyCrmInboundMessage(
  admin: SupabaseClient,
  args: {
    orgId: string
    threadId: string
    messageId: string
    contentType: string
    body: string | null
  },
): Promise<void> {
  const { orgId, threadId, messageId, contentType, body } = args
  try {
    const [{ data: thread }, { data: members }] = await Promise.all([
      admin
        .from("crm_threads")
        .select("assigned_to, contact_name, contact_external_id")
        .eq("id", threadId)
        .maybeSingle<{
          assigned_to: string | null
          contact_name: string | null
          contact_external_id: string
        }>(),
      admin
        .from("org_members")
        .select("profile_id")
        .eq("org_id", orgId)
        .eq("is_active", true),
    ])

    if (!thread) {
      log.warn("thread não encontrada ao notificar", { threadId })
      return
    }

    const activeIds = (members ?? []).map((m) => m.profile_id as string)
    const recipients = pickRecipients(thread.assigned_to, activeIds)
    if (recipients.length === 0) {
      log.warn("org sem membros ativos — notificação descartada", { orgId, threadId })
      return
    }

    const contactLabel = thread.contact_name?.trim() || thread.contact_external_id

    const { error } = await admin.rpc("upsert_crm_inbox_notification", {
      p_user_ids: recipients,
      p_thread_id: threadId,
      p_org_id: orgId,
      p_contact_label: contactLabel,
      p_preview: buildNotificationPreview(contentType, body),
      p_link: `/admin/inbox?thread=${threadId}`,
      p_message_id: messageId,
    })
    if (error) {
      log.warn("upsert_crm_inbox_notification falhou", { threadId, message: error.message })
    }
  } catch (err) {
    log.warn("notifyCrmInboundMessage falhou (best-effort)", {
      threadId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Marca como lidas TODAS as notificações abertas da thread (clear
 * global — a conversa foi vista/atendida por alguém). Nunca lança.
 */
export async function clearCrmThreadNotifications(
  admin: SupabaseClient,
  threadId: string,
): Promise<void> {
  try {
    const { error } = await admin
      .from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("read", false)
      // Arrow operator (->>) casa o unique partial index da migration
      .filter("metadata->>source", "eq", CRM_INBOX_NOTIFICATION_SOURCE)
      .filter("metadata->>thread_id", "eq", threadId)
    if (error) {
      log.warn("clearCrmThreadNotifications falhou", { threadId, message: error.message })
    }
  } catch (err) {
    log.warn("clearCrmThreadNotifications falhou (best-effort)", {
      threadId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
