/**
 * O 402 que NÃO é falta de crédito — módulo puro, client-safe.
 *
 * O OpenRouter RESERVA o custo máximo de cada chamada em voo (prompt +
 * `max_tokens` no preço do modelo). Com saldo curto e modelo caro, a
 * segunda chamada é recusada **enquanto a primeira não liquida**, e a
 * mensagem do provedor diz exatamente isso:
 *
 *     "This request would exceed your available credits given your current
 *      in-flight requests. Retry after in-flight requests settle."
 *
 * São duas doenças com o mesmo código HTTP e tratamentos OPOSTOS:
 *
 * | | o que é | o que resolve |
 * |---|---|---|
 * | `in_flight_budget_exhausted` | saldo RESERVADO | **esperar** |
 * | crédito zerado | saldo ACABOU | recarregar |
 *
 * Medido em 08/09 na ConvertIA: dos 7 turnos com erro, **4 eram in-flight
 * com o saldo em US$ 5,45 e situação "ok"** — o chat mandava recarregar
 * uma conta que tinha dinheiro. E em 09/09, no pipeline de e-mail, o mesmo
 * 402 derrubou runs em **4 dos 12 batches** porque `OpenRouterHttpError`
 * marcava todo 402 como permanente.
 *
 * Este módulo é a fonte ÚNICA da régua para os dois consumidores
 * (`ai/convertia/model-errors.ts` e `agents/openrouter-invoke.ts`) — duas
 * cópias divergiriam na primeira vez que o provedor mudasse a frase.
 */

/**
 * Espera de 3 s para a primeira tentativa, e não 1 s: o que se espera é
 * a chamada ANTERIOR liquidar do lado do provedor. Um segundo não faz
 * isso acontecer, e a tentativa queima outra vez o mesmo erro.
 */
export const IN_FLIGHT_BASE_DELAY_MS = 3000

const IN_FLIGHT_RE = /in_flight_budget|in-flight requests|in flight requests/

/**
 * `true` quando a recusa é por saldo RESERVADO (chamada em voo), não por
 * crédito esgotado. Casa a chave do provedor
 * (`in_flight_budget_exhausted`) e a frase em prosa, com e sem hífen — o
 * OpenRouter usa as duas formas na mesma resposta.
 *
 * Aceita `Error`, string ou qualquer coisa (o erro chega de três camadas
 * diferentes e nem sempre é `Error`).
 */
export function ehInFlight(raw: unknown): boolean {
  const text =
    raw instanceof Error
      ? raw.message
      : typeof raw === "string"
        ? raw
        : String(raw ?? "")
  return IN_FLIGHT_RE.test(text.toLowerCase())
}
