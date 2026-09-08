import { describe, expect, it } from "vitest"
import {
  precisaAgendar,
  resolverProximaCall,
  resumirCarteira,
  rotuloDaProximaCall,
  type ReuniaoDaLoja,
} from "./proxima-call"

const AGORA = new Date("2026-09-08T12:00:00.000Z")
const em = (dias: number) =>
  new Date(AGORA.getTime() + dias * 86_400_000).toISOString()

const reuniao = (o: Partial<ReuniaoDaLoja> & { id: string }): ReuniaoDaLoja => ({
  scheduled_at: em(3),
  status: "scheduled",
  ...o,
})

describe("resolverProximaCall", () => {
  it("reunião agendada vence a previsão — fato ganha de conta", () => {
    const r = resolverProximaCall({
      reunioes: [reuniao({ id: "m1", scheduled_at: em(5) })],
      nextFeedbackDate: em(2),
      agora: AGORA,
    })
    expect(r.origem).toBe("agendada")
    expect(r.meetingId).toBe("m1")
  })

  it("sem reunião, a previsão AINDA aparece — marcada como previsão", () => {
    // A regra que impede a carteira de ficar vazia no dia do deploy: hoje
    // nenhuma reunião tem loja vinculada.
    const r = resolverProximaCall({ nextFeedbackDate: em(4), agora: AGORA })
    expect(r.origem).toBe("prevista")
    expect(r.quando).toBe(em(4))
  })

  it("entre duas futuras, vence a mais próxima", () => {
    const r = resolverProximaCall({
      reunioes: [
        reuniao({ id: "longe", scheduled_at: em(10) }),
        reuniao({ id: "perto", scheduled_at: em(1) }),
      ],
      agora: AGORA,
    })
    expect(r.meetingId).toBe("perto")
  })

  it("reunião passada não conta como próxima", () => {
    const r = resolverProximaCall({
      reunioes: [reuniao({ id: "ontem", scheduled_at: em(-1) })],
      nextFeedbackDate: em(6),
      agora: AGORA,
    })
    expect(r.origem).toBe("prevista")
  })

  it("cancelada e concluída não contam", () => {
    const r = resolverProximaCall({
      reunioes: [
        reuniao({ id: "c", status: "cancelled", scheduled_at: em(1) }),
        reuniao({ id: "d", status: "completed", scheduled_at: em(2) }),
      ],
      agora: AGORA,
    })
    expect(r.origem).toBe("nenhuma")
  })

  it("previsão VENCIDA não vira próxima call — isso é atraso", () => {
    // Chamá-la de "próxima" esconderia justamente a loja que precisa de
    // atenção.
    const r = resolverProximaCall({ nextFeedbackDate: em(-5), agora: AGORA })
    expect(r.origem).toBe("nenhuma")
    expect(r.quando).toBeNull()
  })

  it("marca a reunião sem ninguém do cliente convidado", () => {
    const r = resolverProximaCall({
      reunioes: [reuniao({ id: "m", tem_convidado_do_cliente: false })],
      agora: AGORA,
    })
    expect(r.semConvidadoDoCliente).toBe(true)
  })

  it("não marca quando o convidado existe ou quando não se sabe", () => {
    expect(
      resolverProximaCall({
        reunioes: [reuniao({ id: "m", tem_convidado_do_cliente: true })],
        agora: AGORA,
      }).semConvidadoDoCliente,
    ).toBe(false)
    // undefined = a origem não informou; afirmar "sem convidado" seria inventar
    expect(
      resolverProximaCall({ reunioes: [reuniao({ id: "m" })], agora: AGORA })
        .semConvidadoDoCliente,
    ).toBe(false)
  })

  it("data inválida não derruba nem vira próxima call", () => {
    const r = resolverProximaCall({
      reunioes: [reuniao({ id: "x", scheduled_at: "não é data" })],
      nextFeedbackDate: "também não",
      agora: AGORA,
    })
    expect(r.origem).toBe("nenhuma")
  })

  it("entrada vazia devolve 'nenhuma', não erro", () => {
    expect(resolverProximaCall({ agora: AGORA }).origem).toBe("nenhuma")
    expect(resolverProximaCall({ reunioes: [], nextFeedbackDate: null, agora: AGORA }).origem)
      .toBe("nenhuma")
  })
})

describe("rotuloDaProximaCall", () => {
  it("a palavra carrega a diferença", () => {
    expect(rotuloDaProximaCall({ origem: "agendada", quando: em(1) })).toBe("Agendada")
    expect(rotuloDaProximaCall({ origem: "prevista", quando: em(1) })).toBe(
      "Prevista pela cadência",
    )
    expect(rotuloDaProximaCall({ origem: "nenhuma", quando: null })).toBe("Sem call marcada")
  })
})

describe("precisaAgendar", () => {
  it("previsão também precisa de agendamento — previsão não avisa ninguém", () => {
    expect(precisaAgendar({ origem: "prevista", quando: em(2) })).toBe(true)
    expect(precisaAgendar({ origem: "nenhuma", quando: null })).toBe(true)
    expect(precisaAgendar({ origem: "agendada", quando: em(2) })).toBe(false)
  })
})

describe("resumirCarteira", () => {
  it("conta o número que justifica a feature", () => {
    const r = resumirCarteira([
      { origem: "agendada", quando: em(1) },
      { origem: "prevista", quando: em(2) },
      { origem: "prevista", quando: em(3) },
      { origem: "nenhuma", quando: null },
    ])
    expect(r).toEqual({ agendadas: 1, presumidas: 2, sem_call: 1 })
  })

  it("carteira vazia não quebra", () => {
    expect(resumirCarteira([])).toEqual({ agendadas: 0, presumidas: 0, sem_call: 0 })
  })
})
