import { describe, expect, it } from "vitest"
import {
  AGENDA_PADRAO,
  agruparPorDia,
  dataLocal,
  gerarSlots,
  horaDoSlot,
  instanteLocal,
  normalizarRegra,
  slotAgendavel,
  type RegraDeAgenda,
} from "./disponibilidade"

/** Segunda-feira, 21/09/2026, 08:00 em São Paulo (11:00 UTC). */
const SEGUNDA_8H = new Date("2026-09-21T11:00:00.000Z")

const REGRA: RegraDeAgenda = {
  ...AGENDA_PADRAO,
  antecedenciaMinMin: 0,
  horizonteDias: 0,
  maxSlots: 500,
}

describe("gerarSlots", () => {
  it("cobre a janela do dia no passo pedido", () => {
    const slots = gerarSlots(REGRA, SEGUNDA_8H, [])
    // 09:00→18:00 com call de 30 e passo de 30: o último começa 17:30.
    expect(slots).toHaveLength(18)
    expect(horaDoSlot(slots[0].inicio, REGRA.fuso)).toBe("09:00")
    expect(horaDoSlot(slots[17].inicio, REGRA.fuso)).toBe("17:30")
  })

  it("o slot tem de CABER inteiro na janela", () => {
    // Uma call de 45 min numa janela que fecha às 18:00: 17:30 estouraria
    // em 15 minutos. Testar só o início a ofereceria.
    const slots = gerarSlots({ ...REGRA, duracaoMin: 45 }, SEGUNDA_8H, [])
    const ultimo = slots[slots.length - 1]
    expect(horaDoSlot(ultimo.inicio, REGRA.fuso)).toBe("17:00")
    expect(horaDoSlot(ultimo.fim, REGRA.fuso)).toBe("17:45")
  })

  it("duração maior que a janela não devolve slot nenhum", () => {
    const regra = { ...REGRA, janelas: [{ dia: 1, de: "09:00", ate: "09:20" }] }
    expect(gerarSlots({ ...regra, duracaoMin: 30 }, SEGUNDA_8H, [])).toEqual([])
  })

  it("ocupado é meio-aberto: encostar não bloqueia", () => {
    // Reunião das 09:30 às 10:00. O slot das 10:00 continua livre — com
    // `<=` ele sumiria, e a agenda perderia um horário por reunião.
    const ocupados = [
      { inicio: "2026-09-21T12:30:00.000Z", fim: "2026-09-21T13:00:00.000Z" },
    ]
    const horas = gerarSlots(REGRA, SEGUNDA_8H, ocupados).map((s) => horaDoSlot(s.inicio, REGRA.fuso))
    expect(horas).not.toContain("09:30")
    expect(horas).toContain("10:00")
    expect(horas).toContain("09:00")
  })

  it("ocupado que só cobre o meio do slot ainda bloqueia", () => {
    // Um evento de 10 minutos dentro da meia hora: quem comparar só as
    // bordas o deixaria passar, e duas coisas cairiam no mesmo horário.
    const ocupados = [
      { inicio: "2026-09-21T13:10:00.000Z", fim: "2026-09-21T13:20:00.000Z" },
    ]
    const horas = gerarSlots(REGRA, SEGUNDA_8H, ocupados).map((s) => horaDoSlot(s.inicio, REGRA.fuso))
    expect(horas).not.toContain("10:00")
  })

  it("a antecedência mínima corta o começo do dia", () => {
    const slots = gerarSlots({ ...REGRA, antecedenciaMinMin: 4 * 60 }, SEGUNDA_8H, [])
    // 08:00 + 4h = 12:00: o primeiro oferecido é o das 12:00.
    expect(horaDoSlot(slots[0].inicio, REGRA.fuso)).toBe("12:00")
  })

  it("não oferece dia fora das janelas", () => {
    // Sábado 26/09 e domingo 27/09 com horizonte de 7 dias: nenhum slot.
    const slots = gerarSlots({ ...REGRA, horizonteDias: 7 }, SEGUNDA_8H, [])
    const dias = new Set(slots.map((s) => dataLocal(REGRA.fuso, new Date(s.inicio)).dia))
    expect(dias.has(26)).toBe(false)
    expect(dias.has(27)).toBe(false)
    expect(dias.has(25)).toBe(true)
  })

  it("janela invertida ou ilegível descarta o dia inteiro, e o resto continua", () => {
    const regra = {
      ...REGRA,
      horizonteDias: 1,
      janelas: [
        { dia: 1, de: "18:00", ate: "09:00" },
        { dia: 2, de: "09:00", ate: "11:00" },
      ],
    }
    const slots = gerarSlots(regra, SEGUNDA_8H, [])
    expect(slots).toHaveLength(4)
    expect(dataLocal(REGRA.fuso, new Date(slots[0].inicio)).dia).toBe(22)
  })

  it("respeita o teto e devolve em ordem", () => {
    const slots = gerarSlots({ ...REGRA, horizonteDias: 7, maxSlots: 5 }, SEGUNDA_8H, [])
    expect(slots).toHaveLength(5)
    expect([...slots].map((s) => s.inicio).sort()).toEqual(slots.map((s) => s.inicio))
  })
})

describe("horário de verão", () => {
  it("o mesmo 09:00 local é outro instante UTC em fuso com DST", () => {
    // Nova York: -04:00 em setembro (EDT), -05:00 em dezembro (EST).
    const verao = instanteLocal("America/New_York", 2026, 9, 21, 9, 0)
    const inverno = instanteLocal("America/New_York", 2026, 12, 21, 9, 0)
    expect(verao.toISOString()).toBe("2026-09-21T13:00:00.000Z")
    expect(inverno.toISOString()).toBe("2026-12-21T14:00:00.000Z")
  })

  it("a grade continua às 09:00 locais depois da virada", () => {
    // Um offset fixo entregaria a call uma hora deslocada, e o cliente
    // entraria na sala vazia — sem erro em lugar nenhum.
    const regra: RegraDeAgenda = {
      ...REGRA,
      fuso: "America/New_York",
      horizonteDias: 0,
      janelas: [{ dia: 1, de: "09:00", ate: "10:00" }],
    }
    // Segunda, 02/11/2026 — a virada foi no domingo anterior.
    const depois = gerarSlots(regra, new Date("2026-11-02T12:00:00.000Z"), [])
    expect(depois.length).toBeGreaterThan(0)
    expect(horaDoSlot(depois[0].inicio, regra.fuso)).toBe("09:00")
    expect(depois[0].inicio).toBe("2026-11-02T14:00:00.000Z")
  })
})

describe("slotAgendavel", () => {
  it("aceita o horário que a grade ofereceu", () => {
    const [primeiro] = gerarSlots(REGRA, SEGUNDA_8H, [])
    const r = slotAgendavel(REGRA, SEGUNDA_8H, [], primeiro.inicio)
    expect(r.ok).toBe(true)
  })

  it("recusa domingo às 3 da manhã, mesmo vindo de um POST feito à mão", () => {
    const r = slotAgendavel(REGRA, SEGUNDA_8H, [], "2026-09-27T06:00:00.000Z")
    expect(r).toEqual({ ok: false, motivo: "fora_da_grade" })
  })

  it("recusa horário fora do passo da grade", () => {
    // 09:17 não é oferecido; aceitar deixaria a agenda com sobreposição
    // que nenhuma listagem prevê.
    const r = slotAgendavel(REGRA, SEGUNDA_8H, [], "2026-09-21T12:17:00.000Z")
    expect(r.ok).toBe(false)
  })

  it("recusa o que outra pessoa tomou entre a listagem e o clique", () => {
    const [primeiro] = gerarSlots(REGRA, SEGUNDA_8H, [])
    const r = slotAgendavel(REGRA, SEGUNDA_8H, [{ inicio: primeiro.inicio, fim: primeiro.fim }], primeiro.inicio)
    expect(r).toEqual({ ok: false, motivo: "ocupado" })
  })

  it("distingue cedo demais de fora da grade", () => {
    const r = slotAgendavel({ ...REGRA, antecedenciaMinMin: 4 * 60 }, SEGUNDA_8H, [], "2026-09-21T13:00:00.000Z")
    expect(r).toEqual({ ok: false, motivo: "cedo_demais" })
  })

  it("aceita horário além do teto de exibição", () => {
    // O teto é de APRESENTAÇÃO. Reaproveitá-lo na validação recusaria um
    // horário legítimo que a pessoa alcançou paginando.
    const regra = { ...REGRA, horizonteDias: 7, maxSlots: 3 }
    const todos = gerarSlots({ ...regra, maxSlots: 500 }, SEGUNDA_8H, [])
    const longe = todos[todos.length - 1]
    expect(slotAgendavel(regra, SEGUNDA_8H, [], longe.inicio).ok).toBe(true)
  })

  it("instante ilegível não vira exceção", () => {
    expect(slotAgendavel(REGRA, SEGUNDA_8H, [], "amanhã de tarde")).toEqual({
      ok: false,
      motivo: "instante_invalido",
    })
  })
})

describe("agruparPorDia", () => {
  it("agrupa pelo dia LOCAL da agenda, não pelo dia UTC", () => {
    // 17:30 em São Paulo é 20:30 UTC do mesmo dia; num fuso a leste da
    // meia-noite o agrupamento por UTC jogaria a tarde para o dia
    // seguinte e a lista mostraria "terça" em cima de um horário de
    // segunda.
    const slots = gerarSlots({ ...REGRA, horizonteDias: 1 }, SEGUNDA_8H, [])
    const dias = agruparPorDia(slots, REGRA.fuso)
    expect(dias.map((d) => d.data)).toEqual(["2026-09-21", "2026-09-22"])
    expect(dias[0].slots).toHaveLength(18)
    expect(dias[0].rotulo).toContain("21")
  })
})

describe("normalizarRegra", () => {
  it("o que falta vira padrão, e o que veio torto é clampeado", () => {
    const r = normalizarRegra({ duracaoMin: 45, horizonteDias: 9999, passoMin: "x" })
    expect(r.duracaoMin).toBe(45)
    expect(r.horizonteDias).toBe(60)
    expect(r.passoMin).toBe(AGENDA_PADRAO.passoMin)
    expect(r.janelas).toEqual(AGENDA_PADRAO.janelas)
  })

  it("lista de janelas vazia ou só com lixo não zera a agenda", () => {
    // Uma agenda sem janela nenhuma não oferece horário — e o sintoma
    // seria "a agenda não abre", sem nada dizendo que foi o cadastro.
    expect(normalizarRegra({ janelas: [] }).janelas).toEqual(AGENDA_PADRAO.janelas)
    expect(normalizarRegra({ janelas: [{ dia: 9, de: "09:00", ate: "10:00" }] }).janelas).toEqual(
      AGENDA_PADRAO.janelas,
    )
  })
})
