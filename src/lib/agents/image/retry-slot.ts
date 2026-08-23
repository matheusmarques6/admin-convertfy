/**
 * retry-slot — uma segunda chance por slot de imagem.
 *
 * Por que existe: `runImageSlot` não tinha retry. Uma falha deixava o slot
 * sem URL e o e-mail seguia com o buraco — foi assim que o 1º review da
 * Luxe Lift (23/08) saiu sem foto, com o erro
 * "Não foi possível extrair imagem da resposta do OpenRouter
 * (status=200, content-type=application/json)": o modelo devolveu texto
 * onde o contrato pede PNG. Falha transitória, e a chamada seguinte
 * costuma vir certa.
 *
 * UMA tentativa extra, não mais: se o modelo erra duas vezes seguidas o
 * problema não é sorte, é o prompt ou o slot — e insistir só queima
 * orçamento que os outros slots precisam.
 *
 * O orçamento é conferido ANTES da segunda chamada, nunca depois: gastar o
 * resto da fase num slot deixaria os que ainda não rodaram sem nenhuma.
 *
 * Parametrizado sobre a função que roda o slot (zero I/O aqui) — testável.
 */

export interface SlotAttempt {
  ok: boolean
}

export interface RetryOutcome<R extends SlotAttempt> {
  result: R
  /** A segunda tentativa chegou a rodar. */
  retried: boolean
}

/**
 * Roda o slot; se falhar e ainda houver orçamento, roda mais uma vez.
 *
 * `budgetLeftMs` é uma função, não um número: entre a 1ª e a 2ª tentativa
 * passa o tempo da própria chamada, e um valor capturado antes mentiria
 * exatamente no caso em que a decisão importa.
 */
export async function runSlotWithRetry<R extends SlotAttempt>(
  run: () => Promise<R>,
  budgetLeftMs: () => number,
): Promise<RetryOutcome<R>> {
  const primeira = await run()
  if (primeira.ok || budgetLeftMs() <= 0) {
    return { result: primeira, retried: false }
  }
  return { result: await run(), retried: true }
}
