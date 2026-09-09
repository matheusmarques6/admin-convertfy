/**
 * Para quem a automação responde no Instagram — e por qual caminho.
 *
 * São dois caminhos diferentes na Meta, e confundi-los é o que faz o
 * comment gate não entregar:
 *
 * - **Comentário** → *private reply*: a resposta vai ao direct de quem
 *   comentou, endereçada pelo ID DO COMENTÁRIO. É o "comente SEGMENTO e
 *   eu te mando no direct". Só vale uma vez por comentário e dentro de
 *   sete dias.
 * - **Direct** → DM comum, endereçada pelo id do remetente.
 *
 * A thread de comentários é agrupada pelo POST (`comment:<media>`), então
 * o `contact_external_id` dela NÃO é uma pessoa: usá-lo como
 * destinatário manda a mensagem para lugar nenhum. Daí esta função ser
 * pura e testada em vez de um `??` no meio do executor.
 */

export interface DadosDoGatilho {
  event_kind?: unknown
  external_message_id?: unknown
  sender_external_id?: unknown
  contact_external_id?: unknown
}

export type AlvoDaResposta =
  | { via: "private_reply"; para: string }
  | { via: "dm"; para: string }
  | { via: null; motivo: string }

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)

/** A thread de comentários é do POST, não de uma pessoa. */
export function ehContatoDeComentario(contactExternalId: unknown): boolean {
  return typeof contactExternalId === "string" && contactExternalId.startsWith("comment:")
}

export function alvoDaResposta(dados: DadosDoGatilho | null | undefined): AlvoDaResposta {
  const d = dados ?? {}
  const kind = texto(d.event_kind) ?? "message"

  if (kind === "comment") {
    const comentario = texto(d.external_message_id)
    if (!comentario) {
      return { via: null, motivo: "o gatilho não trouxe o id do comentário — sem ele a Meta não entrega a resposta no direct" }
    }
    return { via: "private_reply", para: comentario }
  }

  const remetente = texto(d.sender_external_id) ?? (ehContatoDeComentario(d.contact_external_id) ? null : texto(d.contact_external_id))
  if (!remetente) {
    return { via: null, motivo: "o gatilho não trouxe quem enviou a mensagem" }
  }
  return { via: "dm", para: remetente }
}

/**
 * De quem é o negócio que a automação vai criar.
 *
 * A thread de comentários é do POST: todo mundo que comenta cai na MESMA
 * conversa. Como `action_create_deal` é idempotente por thread, criar o
 * negócio ali dá **um negócio para o post inteiro** — o primeiro que
 * comentou vira lead e todos os outros voltam com `created: false`, em
 * silêncio. Era o comment gate entregando para uma pessoa e ignorando as
 * outras cem.
 *
 * Então: thread de pessoa (direct) → o vínculo da thread vale; thread de
 * post → o dono é QUEM COMENTOU, e o negócio mora na conversa dele.
 */
export type DonoDoNegocio =
  | { escopo: "thread" }
  | { escopo: "pessoa"; externalId: string; nome: string | null }
  | { escopo: null; motivo: string }

export function donoDoNegocio(
  thread: { contact_external_id?: string | null } | null | undefined,
  dados: (DadosDoGatilho & { sender_name?: unknown }) | null | undefined,
): DonoDoNegocio {
  if (!ehContatoDeComentario(thread?.contact_external_id)) return { escopo: "thread" }

  const d = dados ?? {}
  const sender = texto(d.sender_external_id)
  if (!sender) {
    return {
      escopo: null,
      motivo:
        "a conversa é do post e o gatilho não trouxe quem comentou — criar o negócio aqui daria um só para o post inteiro",
    }
  }
  return { escopo: "pessoa", externalId: sender, nome: texto(d.sender_name) }
}
