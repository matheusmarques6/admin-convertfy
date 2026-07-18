/**
 * Alertas de saúde dos canais WhatsApp (Evolution) — sino do admin.
 *
 * Gera UMA notificação (type=error) por canal desconectado para todos
 * os membros ativos da org, e a marca como lida automaticamente quando
 * a conexão volta (state=open). Dedup simples: enquanto existir alerta
 * ABERTO do canal, não cria outro — desconexão é evento raro, não
 * precisa do upsert atômico do inbox.
 *
 * Produtores (ver docs/crm/channel-health-alerts.md):
 *  - webhook connection.update (tempo real): close com statusCode 401
 *    (deslogou no celular) alerta na hora; open limpa.
 *  - envio recusado "not connected" (markEvolutionDisconnected).
 *  - cron /api/cron/whatsapp-connection-health (5 em 5 min): consulta o
 *    estado LIVE de cada instância — pega queda silenciosa/zumbi em que
 *    o config diz "open" mas a API falha.
 *
 * Contrato de metadata (estável — futuro push mobile):
 *   { source: 'crm_channel_alert', channel_id, org_id, state, reason }
 *
 * Best-effort: nenhuma função lança.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { channelAlertPriority, sendPilotPush } from "./pushover.service"

const log = logger.child("CrmChannelAlert")

export const CRM_CHANNEL_ALERT_SOURCE = "crm_channel_alert"

/** Link da notificação — tela de canais com o botão de reconectar/QR. */
const CHANNELS_PAGE_LINK = "/admin/comercial/canais"

/**
 * Pura, testável: motivo legível da desconexão a partir do sinal bruto.
 * kind:
 *  - "logged_out"   → close com statusCode 401 (deslogou no celular)
 *  - "close"        → connection.update close genérico
 *  - "connecting"   → instância presa em connecting
 *  - "unreachable"  → Evolution API não respondeu / erro na consulta
 *  - "send_refused" → envio recusado com "not connected"
 */
export function buildDisconnectReason(kind: string, detail?: string | null): string {
  switch (kind) {
    case "logged_out":
      return "WhatsApp deslogado no celular — é preciso ler o QR code novamente."
    case "close":
      return "A conexão da instância com o WhatsApp caiu. Verifique o canal e reconecte se necessário."
    case "connecting":
      return "A instância está tentando reconectar e ainda não voltou. Se persistir, leia o QR novamente."
    case "unreachable":
      return `A Evolution API não respondeu ao health check${detail ? ` (${detail})` : ""}. Instância pode estar fora do ar.`
    case "send_refused":
      return "Um envio foi recusado porque a instância não está conectada. Reconecte o canal."
    default:
      return `Canal WhatsApp com problema de conexão${detail ? ` (${detail})` : ""}.`
  }
}

/**
 * Cria o alerta de canal desconectado para todos os membros ativos da
 * org — no máximo 1 alerta ABERTO por canal. Nunca lança.
 */
export async function notifyChannelDisconnected(
  admin: SupabaseClient,
  args: { channelId: string; kind: string; detail?: string | null },
): Promise<void> {
  const { channelId, kind, detail } = args
  try {
    // Dedup: já existe alerta aberto deste canal? (desconexão contínua
    // não deve re-alertar a cada webhook/ciclo do cron)
    const { data: existing } = await admin
      .from("notifications")
      .select("id")
      .eq("read", false)
      .filter("metadata->>source", "eq", CRM_CHANNEL_ALERT_SOURCE)
      .filter("metadata->>channel_id", "eq", channelId)
      .limit(1)
      .maybeSingle()
    if (existing) return

    const { data: channel } = await admin
      .from("crm_channels")
      .select("id, org_id, display_name, external_id")
      .eq("id", channelId)
      .maybeSingle<{ id: string; org_id: string; display_name: string | null; external_id: string }>()
    if (!channel) {
      log.warn("canal não encontrado ao alertar desconexão", { channelId })
      return
    }

    const { data: members } = await admin
      .from("org_members")
      .select("profile_id")
      .eq("org_id", channel.org_id)
      .eq("is_active", true)
    const recipients = (members ?? []).map((m) => m.profile_id as string)
    if (recipients.length === 0) {
      log.warn("org sem membros ativos — alerta de canal descartado", { channelId })
      return
    }

    const label = channel.display_name?.trim() || channel.external_id
    const reason = buildDisconnectReason(kind, detail)

    const { error } = await admin.from("notifications").insert(
      recipients.map((userId) => ({
        user_id: userId,
        title: `WhatsApp desconectado: ${label}`,
        body: reason,
        type: "error",
        link: CHANNELS_PAGE_LINK,
        metadata: {
          source: CRM_CHANNEL_ALERT_SOURCE,
          channel_id: channelId,
          org_id: channel.org_id,
          state: "disconnected",
          kind,
          reason,
        },
      })),
    )
    if (error) {
      log.warn("insert do alerta de canal falhou", { channelId, message: error.message })
      return
    }
    log.info("alerta de canal desconectado criado", { channelId, kind, recipients: recipients.length })

    // Push pro celular piloto (Fase 0). Dedup acima garante 1 push por
    // queda. priority default 1 (fura o modo silencioso do Pushover —
    // canal parado = leads sendo perdidos); ajustável via env
    // PUSHOVER_ALERT_PRIORITY=0. Sem TTL: alerta não deve sumir sozinho.
    await sendPilotPush({
      title: `WhatsApp desconectado: ${label}`,
      message: reason,
      url: CHANNELS_PAGE_LINK,
      urlTitle: "Abrir canais",
      priority: channelAlertPriority(),
    })
  } catch (err) {
    log.warn("notifyChannelDisconnected falhou (best-effort)", {
      channelId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Conexão voltou (state=open) — marca como lidos os alertas abertos do
 * canal, para todos os destinatários. Nunca lança.
 */
export async function clearChannelAlerts(admin: SupabaseClient, channelId: string): Promise<void> {
  try {
    const { error } = await admin
      .from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("read", false)
      .filter("metadata->>source", "eq", CRM_CHANNEL_ALERT_SOURCE)
      .filter("metadata->>channel_id", "eq", channelId)
    if (error) {
      log.warn("clearChannelAlerts falhou", { channelId, message: error.message })
    }
  } catch (err) {
    log.warn("clearChannelAlerts falhou (best-effort)", {
      channelId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
