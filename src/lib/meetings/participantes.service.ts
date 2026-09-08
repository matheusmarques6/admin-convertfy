/**
 * Contatos do cliente como participantes da reunião.
 *
 * Isolado do POST/PUT porque as duas rotas precisam da MESMA validação, e
 * porque a degradação sem a migration 20261125 tem de ser idêntica nas
 * duas: sem o valor 'contact' no enum, o insert falha e o contato precisa
 * chegar ao Google de outro jeito, senão marcar reunião volta a não avisar
 * o cliente — que é justamente o que esta feature conserta.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("MeetingParticipantes")

/** Postgres: valor fora do domínio de um enum. É o sinal de migration ausente. */
const ENUM_INVALIDO = "22P02"

export interface ContatoValidado {
  id: string
  name: string
  email: string | null
}

/** Aceita ["uuid"] ou [{ id: "uuid" }] — o front de hoje e o de amanhã. */
export function normalizarIdsDeContato(bruto: unknown): string[] {
  if (!Array.isArray(bruto)) return []
  const ids = bruto
    .map((item) => {
      if (typeof item === "string") return item
      if (item && typeof item === "object" && "id" in item) {
        const id = (item as { id: unknown }).id
        return typeof id === "string" ? id : null
      }
      return null
    })
    .filter((v): v is string => Boolean(v))
  return Array.from(new Set(ids))
}

/**
 * Confere que os contatos existem e são DAQUELE cliente.
 *
 * Sem esta checagem, um id de contato de outro cliente entraria como
 * attendee e receberia a pauta de uma reunião que não é dele — o vazamento
 * mais fácil de causar e mais difícil de perceber nesta feature.
 */
export async function validarContatosDoCliente(
  contactIds: string[],
  clientId: string | null,
): Promise<ContatoValidado[]> {
  if (contactIds.length === 0) return []

  if (!clientId) {
    throw new AppError(
      "Para convidar contatos, a reunião precisa ter um cliente vinculado",
      422,
      "validation-error",
    )
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("crm_contacts")
    .select("id, name, email, client_id")
    .in("id", contactIds)
    .eq("client_id", clientId)

  if (error) {
    log.error("Falha ao validar contatos", { clientId, message: error.message })
    throw new AppError("Erro ao validar contatos", 500)
  }

  const encontrados = data ?? []
  if (encontrados.length !== contactIds.length) {
    throw new AppError(
      "Um ou mais contatos não pertencem a este cliente",
      422,
      "validation-error",
    )
  }

  return encontrados.map((c) => ({ id: c.id, name: c.name, email: c.email }))
}

export interface ResultadoDeVinculo {
  /** Quantos contatos viraram participantes de verdade. */
  vinculados: number
  /**
   * Emails que precisam entrar em guest_emails porque o banco ainda não
   * conhece o tipo 'contact'. Vazio no caminho normal.
   */
  emailsParaFallback: string[]
  /** true quando a migration 20261125 não rodou neste ambiente. */
  degradado: boolean
}

/**
 * Grava os contatos como participantes.
 *
 * Se o enum não tem 'contact' (migration pendente), não falha: devolve os
 * emails para o chamador colocar em guest_emails. O cliente continua sendo
 * convidado — perde-se o vínculo com o id do contato e o RSVP de volta,
 * que é uma degradação aceitável perto de não convidar ninguém.
 */
export async function vincularContatos(
  meetingId: string,
  contatos: ContatoValidado[],
): Promise<ResultadoDeVinculo> {
  if (contatos.length === 0) {
    return { vinculados: 0, emailsParaFallback: [], degradado: false }
  }

  const admin = createAdminClient()
  const { error } = await admin.from("meeting_participants").insert(
    contatos.map((c) => ({
      meeting_id: meetingId,
      participant_id: c.id,
      participant_type: "contact",
      is_organizer: false,
      response_status: "pending",
      email: c.email,
    })),
  )

  if (!error) {
    return { vinculados: contatos.length, emailsParaFallback: [], degradado: false }
  }

  const semTipoContact =
    error.code === ENUM_INVALIDO || /invalid input value for enum/i.test(error.message)

  if (semTipoContact) {
    log.warn(
      "Enum meeting_participant_type sem 'contact' — aplique a migration 20261125. " +
        "Convidando os contatos por guest_emails.",
      { meetingId },
    )
    return {
      vinculados: 0,
      emailsParaFallback: contatos
        .map((c) => c.email)
        .filter((e): e is string => Boolean(e)),
      degradado: true,
    }
  }

  log.error("Falha ao vincular contatos à reunião", {
    meetingId,
    code: error.code,
    message: error.message,
  })
  throw new AppError("Erro ao adicionar os contatos do cliente", 500)
}
