import { describe, expect, it } from "vitest"

import {
  descreverIdadeDaPausa,
  idadeDaPausa,
  MOTIVO_PAUSA_EXPIRADA,
  PAUSA_MAX_MS,
  triarPausas,
} from "./pausa"

const AGORA = Date.parse("2026-09-15T22:00:00Z")
const h = (n: number) => new Date(AGORA - n * 3600_000).toISOString()

describe("triarPausas", () => {
  // O caso real: `8658d1a8` pausada em 10/09 23:13, medida em 15/09 — cinco
  // dias segurando o e-mail `758f05de` em `rendering` e trancando o índice
  // único contra qualquer disparo novo.
  it("pausa de cinco dias expira", () => {
    const { vivas, expiradas } = triarPausas(
      [{ id: "8658d1a8", email_id: "758f05de", updated_at: h(24 * 5) }],
      AGORA,
    )
    expect(expiradas.map((e) => e.id)).toEqual(["8658d1a8"])
    expect(vivas).toHaveLength(0)
  })

  // A proteção existe para isto e continua valendo: parar no nó X e sair
  // para almoçar não pode devolver a execução morta.
  it("pausa do almoço continua viva", () => {
    const { vivas, expiradas } = triarPausas(
      [{ id: "almoco", email_id: "e1", updated_at: h(2) }],
      AGORA,
    )
    expect(vivas.map((e) => e.id)).toEqual(["almoco"])
    expect(expiradas).toHaveLength(0)
  })

  // A borda é do lado de dentro: 12 h em ponto ainda é pausa válida.
  it("exatamente no teto ainda vale", () => {
    const noTeto = new Date(AGORA - PAUSA_MAX_MS).toISOString()
    expect(triarPausas([{ id: "x", email_id: "e", updated_at: noTeto }], AGORA).vivas).toHaveLength(1)
  })

  // Sem data não se sabe a idade, e expirar no escuro derruba a proteção
  // justamente onde ela não pôde ser medida.
  it("carimbo ilegível conta como VIVA", () => {
    const { vivas, expiradas } = triarPausas(
      [
        { id: "sem", email_id: "e1" },
        { id: "lixo", email_id: "e2", updated_at: "ontem de manhã" },
      ],
      AGORA,
    )
    expect(vivas).toHaveLength(2)
    expect(expiradas).toHaveLength(0)
  })

  it("separa as duas numa lista só", () => {
    const { vivas, expiradas } = triarPausas(
      [
        { id: "velha", email_id: "e1", updated_at: h(30) },
        { id: "nova", email_id: "e2", updated_at: h(1) },
      ],
      AGORA,
    )
    expect(expiradas.map((e) => e.id)).toEqual(["velha"])
    expect(vivas.map((e) => e.id)).toEqual(["nova"])
  })

  it("lista vazia não inventa nada", () => {
    expect(triarPausas([], AGORA)).toEqual({ vivas: [], expiradas: [] })
  })
})

describe("idadeDaPausa", () => {
  // `updated_at` é o instante da pausa; `started_at` pode ser de meia hora
  // antes, quando a execução ainda rodava. Medir pelo início alongaria a
  // pausa sem motivo.
  it("prefere updated_at ao started_at", () => {
    const idade = idadeDaPausa({ updated_at: h(1), started_at: h(9) }, AGORA)
    expect(idade).toBe(3600_000)
  })

  it("cai para started_at quando não há updated_at", () => {
    expect(idadeDaPausa({ started_at: h(2) }, AGORA)).toBe(2 * 3600_000)
  })

  it("devolve null sem carimbo legível", () => {
    expect(idadeDaPausa({ updated_at: null, started_at: undefined }, AGORA)).toBeNull()
  })
})

describe("descreverIdadeDaPausa", () => {
  it("minutos, horas e dias", () => {
    expect(descreverIdadeDaPausa(40 * 60_000)).toBe("há 40 min")
    expect(descreverIdadeDaPausa(3 * 3600_000)).toBe("há 3 h")
    expect(descreverIdadeDaPausa(5 * 24 * 3600_000)).toBe("há 5 dias")
  })
})

describe("MOTIVO_PAUSA_EXPIRADA", () => {
  // Ele vai para `failure_reason` e para a tela: precisa dizer o que
  // aconteceu e o que mudou, não um código.
  it("explica o que aconteceu", () => {
    expect(MOTIVO_PAUSA_EXPIRADA).toMatch(/pausa/i)
    expect(MOTIVO_PAUSA_EXPIRADA).toMatch(/watchdog/i)
  })
})
