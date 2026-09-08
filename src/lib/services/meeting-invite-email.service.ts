/**
 * Email da Convertfy confirmando a reunião.
 *
 * Anda ao lado do convite nativo do Google (`sendUpdates: "all"` no sync),
 * não no lugar dele. O convite do Google traz o botão de aceitar e o evento
 * na agenda; este email traz a marca, o contexto da loja e chega quando o
 * convite cai no spam do cliente. Redundância proposital — a mesma razão de
 * manter pixel e CAPI ligados nos eventos de conversão.
 *
 * Regra dura: falha de email NUNCA derruba o agendamento. A reunião já está
 * no banco e no Google quando isto roda; um 429 do Resend não pode desfazer
 * nada nem devolver erro para quem clicou em salvar. O que ele pode é ser
 * relatado — daí o resultado detalhado por destinatário.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { emailService } from "@/lib/email/email.service"
import { meetingInviteTemplate } from "@/lib/email/templates"
import {
  dataPorExtenso,
  duracaoPorExtenso,
  janelaLocal,
} from "@/lib/meetings/formato"
import { montarConvidados, type Convidado } from "@/lib/meetings/convidados"
import { logger } from "@/lib/logger"

const log = logger.child("MeetingInviteEmail")

export interface EnvioDeConvite {
  email: string
  enviado: boolean
  erro?: string
}

export interface ResultadoDoConvite {
  enviados: number
  falhas: number
  destinatarios: EnvioDeConvite[]
  /** Motivo de não ter enviado nada (não é erro — é estado). */
  motivo?: "sem_destinatario" | "sem_reuniao"
}

interface LinhaDaReuniao {
  id: string
  title: string
  scheduled_at: string
  duration_minutes: number
  timezone: string | null
  notes: string | null
  meeting_url: string | null
  org_id: string | null
  store_id: string | null
  guest_emails: string[] | null
  user: { name: string | null } | { name: string | null }[] | null
  store: { store_name: string | null } | { store_name: string | null }[] | null
  participants: Array<{
    participant_id: string
    participant_type: string
    email: string | null
  }>
}

function primeiro<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/**
 * Envia a confirmação para o LADO DO CLIENTE apenas.
 *
 * Membros do time não recebem: eles já têm o evento na agenda (são attendees
 * na conta central) e um segundo email por reunião marcada vira ruído que
 * ensina o time a ignorar a caixa.
 */
export async function sendMeetingInviteEmails(
  meetingId: string,
): Promise<ResultadoDoConvite> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from("meetings")
    .select(
      `
      id, title, scheduled_at, duration_minutes, timezone, notes, meeting_url,
      org_id, store_id, guest_emails,
      user:profiles!meetings_user_id_fkey(name),
      store:client_stores(store_name),
      participants:meeting_participants(participant_id, participant_type, email)
    `,
    )
    .eq("id", meetingId)
    .single()

  if (error || !data) {
    log.warn("Reunião não encontrada para enviar convite", {
      meetingId,
      message: error?.message,
    })
    return { enviados: 0, falhas: 0, destinatarios: [], motivo: "sem_reuniao" }
  }

  const meeting = data as unknown as LinhaDaReuniao

  // Contatos do cliente que entraram como participantes
  const contactIds = (meeting.participants || [])
    .filter((p) => p.participant_type === "contact")
    .map((p) => p.participant_id)

  let contatos: Array<{ id: string; name: string; email: string | null }> = []
  if (contactIds.length > 0) {
    const { data: rows } = await admin
      .from("crm_contacts")
      .select("id, name, email")
      .in("id", contactIds)
    contatos = rows ?? []
  }

  // A lista final passa pelo mesmo montador do sync: se o contato e o
  // convidado externo forem a mesma pessoa, ela recebe UM email.
  const destinatarios: Convidado[] = montarConvidados({
    contatos: contatos.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
    })),
    externos: meeting.guest_emails ?? [],
  })

  if (destinatarios.length === 0) {
    return { enviados: 0, falhas: 0, destinatarios: [], motivo: "sem_destinatario" }
  }

  const organizador = primeiro(meeting.user)?.name ?? null
  const loja = primeiro(meeting.store)?.store_name ?? null
  const tz = meeting.timezone

  const dateLabel = dataPorExtenso(meeting.scheduled_at, tz)
  const timeLabel = janelaLocal(meeting.scheduled_at, meeting.duration_minutes, tz)
  const durationLabel = duracaoPorExtenso(meeting.duration_minutes)

  const resultados: EnvioDeConvite[] = []

  // Em série: o Resend tem limite por segundo e uma rajada de convites
  // derrubaria os últimos da lista — justamente os que ninguém confere.
  for (const destinatario of destinatarios) {
    const html = meetingInviteTemplate({
      recipientName: destinatario.displayName ?? null,
      title: meeting.title,
      dateLabel,
      timeLabel,
      durationLabel,
      organizerName: organizador,
      storeName: loja,
      meetingUrl: meeting.meeting_url,
      notes: meeting.notes,
    })

    try {
      await emailService.send({
        to: destinatario.email,
        subject: `Reunião confirmada: ${meeting.title}`,
        html,
        org_id: meeting.org_id,
      })
      resultados.push({ email: destinatario.email, enviado: true })
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err)
      log.warn("Falha ao enviar confirmação de reunião", {
        meetingId,
        to: destinatario.email,
        error: mensagem,
      })
      resultados.push({ email: destinatario.email, enviado: false, erro: mensagem })
    }
  }

  const enviados = resultados.filter((r) => r.enviado).length
  return {
    enviados,
    falhas: resultados.length - enviados,
    destinatarios: resultados,
  }
}
