import { describe, expect, it } from "vitest"

import {
  BUDGET_HEADROOM_MS,
  FMT_STEP_TIMEOUT,
  WATCHDOG_BUDGET_MS,
} from "./phase2-runner.service"

/**
 * INVARIANTE: todo step da cadeia precisa CABER num tick do watchdog.
 *
 * O guard de orçamento sai como `out_of_budget` quando
 * `remaining < timeout + 30s`. O watchdog tem 240s (cron com
 * maxDuration=300), então um step com teto acima de 210s nunca é sequer
 * TENTADO ali — e como o resume reentra pelo mesmo estágio persistido, o
 * email entra num LAÇO: cada tick refaz os passos baratos e sai no mesmo
 * ponto, sem registrar run do step que não coube.
 *
 * Foi o que aconteceu com o `text_format` em 540s (Luxe Lift, 10/08): três
 * ticks seguidos, nenhum run do step, email preso em `rendering` para
 * sempre. O sintoma é traiçoeiro justamente porque NÃO há erro — o passo
 * não falha, ele nunca começa.
 *
 * Este teste existe para que subir um teto acima do orçamento do watchdog
 * quebre aqui, e não em produção seis semanas depois.
 */
describe("orçamento por step × tick do watchdog", () => {
  const teto = WATCHDOG_BUDGET_MS - BUDGET_HEADROOM_MS

  for (const [agent, { def }] of Object.entries(FMT_STEP_TIMEOUT)) {
    it(`${agent} cabe num tick do watchdog`, () => {
      expect(def).toBeLessThanOrEqual(teto)
    })
  }

  it("o teto derivado é o esperado (240s - 30s de folga)", () => {
    expect(teto).toBe(210_000)
  })
})
