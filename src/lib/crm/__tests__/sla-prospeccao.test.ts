import { describe, it, expect } from "vitest"
import {
  ETAPA_QUALIFICAR,
  MOTIVO_SEM_RESPOSTA,
  diaDaSemanaEmSaoPaulo,
  diaEmSaoPaulo,
  planejarSla,
  tarefaSemanalDoParceiro,
  toqueDaEtapa,
  type NegocioParaSla,
} from "../sla-prospeccao"

const AGORA = new Date("2026-09-21T11:00:00Z") // segunda, 08:00 em SP

function horasAtras(h: number): string {
  return new Date(AGORA.getTime() - h * 3_600_000).toISOString()
}

function negocio(over: Partial<NegocioParaSla> = {}): NegocioParaSla {
  return {
    id: "d1",
    title: "Ana Paula",
    stage_name: "T1 · Abordado",
    stage_sla_hours: 48,
    last_stage_changed_at: horasAtras(72),
    custom_fields: { tentativas_contato: 1 },
    ...over,
  }
}

describe("toqueDaEtapa", () => {
  it("reconhece as três colunas de toque", () => {
    expect(toqueDaEtapa("T1 · Abordado")).toBe("T1")
    expect(toqueDaEtapa("T2 · Follow-up com valor")).toBe("T2")
    expect(toqueDaEtapa("T3 · Último toque")).toBe("T3")
  })

  it("coluna fora da cadência devolve null", () => {
    expect(toqueDaEtapa("A · Aluno Luan")).toBeNull()
    expect(toqueDaEtapa("Ganho")).toBeNull()
  })
})

describe("T1 e T2 vencidos: marcam e cobram, NUNCA movem", () => {
  it("T1 vencido vira follow-up do T2", () => {
    const { acoes } = planejarSla([negocio()], AGORA)
    expect(acoes).toHaveLength(1)
    expect(acoes[0]).toMatchObject({
      tipo: "marcar_vencido",
      toqueAtual: "T1",
      proximo: "T2",
      horasParado: 72,
    })
  })

  it("nenhuma ação move o card — só o T3 move", () => {
    const { acoes } = planejarSla(
      [negocio(), negocio({ id: "d2", stage_name: "T2 · Follow-up com valor" })],
      AGORA,
    )
    expect(acoes.every((a) => a.tipo !== "perder")).toBe(true)
  })

  it("o próximo toque vem das TENTATIVAS, não da coluna", () => {
    // Card movido à mão pra T1 com dois toques já enviados: mandar o T2
    // de novo repetiria a mesma mensagem pro lead.
    const { acoes } = planejarSla(
      [negocio({ custom_fields: { tentativas_contato: 2 } })],
      AGORA,
    )
    expect(acoes[0]).toMatchObject({ toqueAtual: "T1", proximo: "T3" })
  })

  it("dentro do prazo não faz nada", () => {
    const { acoes, resumo } = planejarSla(
      [negocio({ last_stage_changed_at: horasAtras(10) })],
      AGORA,
    )
    expect(acoes).toEqual([])
    expect(resumo.ignorados.dentro_do_prazo).toBe(1)
  })

  it("tarefa já aberta não vira segunda tarefa", () => {
    const { acoes, resumo } = planejarSla([negocio({ tem_tarefa_aberta: true })], AGORA)
    expect(acoes).toEqual([])
    expect(resumo.ignorados.ja_tem_tarefa).toBe(1)
  })
})

describe("T3 vencido perde", () => {
  const t3 = negocio({
    stage_name: "T3 · Último toque",
    custom_fields: { tentativas_contato: 3 },
  })

  it("move com o motivo cadastrado", () => {
    const { acoes } = planejarSla([t3], AGORA)
    expect(acoes[0]).toMatchObject({ tipo: "perder", motivo: MOTIVO_SEM_RESPOSTA })
  })

  it("dentro do prazo não perde ninguém", () => {
    expect(
      planejarSla([{ ...t3, last_stage_changed_at: horasAtras(12) }], AGORA).acoes,
    ).toEqual([])
  })
})

describe("qualificação parada só vira tarefa", () => {
  const q = negocio({
    stage_name: ETAPA_QUALIFICAR,
    stage_sla_hours: 24,
    last_stage_changed_at: horasAtras(30),
  })

  it("passadas 24h, cobra", () => {
    expect(planejarSla([q], AGORA).acoes[0]).toMatchObject({
      tipo: "cobrar_qualificacao",
      horasParado: 30,
    })
  })

  it("NUNCA perde quem respondeu — é o pior desfecho possível", () => {
    const { acoes } = planejarSla(
      [{ ...q, last_stage_changed_at: horasAtras(500) }],
      AGORA,
    )
    expect(acoes.every((a) => a.tipo !== "perder")).toBe(true)
  })

  it("não depende do SLA da coluna estar cadastrado", () => {
    expect(planejarSla([{ ...q, stage_sla_hours: null }], AGORA).acoes).toHaveLength(1)
  })
})

describe("o que o job se recusa a fazer", () => {
  it("quem pediu pra não ser contatado fica intocado", () => {
    const { acoes, resumo } = planejarSla([negocio({ tags: ["nao-contatar"] })], AGORA)
    expect(acoes).toEqual([])
    expect(resumo.ignorados.nao_contatar).toBe(1)
  })

  it("tag em qualquer caixa protege — a origem é planilha", () => {
    expect(planejarSla([negocio({ tags: [" NAO-CONTATAR "] })], AGORA).acoes).toEqual([])
  })

  it("sem carimbo de entrada não inventa atraso", () => {
    const { acoes, resumo } = planejarSla(
      [negocio({ last_stage_changed_at: null })],
      AGORA,
    )
    expect(acoes).toEqual([])
    expect(resumo.ignorados.sem_prazo).toBe(1)
  })

  it("etapa de toque sem SLA cadastrado não é medida", () => {
    const { resumo } = planejarSla([negocio({ stage_sla_hours: null })], AGORA)
    expect(resumo.ignorados.sem_prazo).toBe(1)
  })

  it("coluna fora da cadência é ignorada", () => {
    const { acoes, resumo } = planejarSla(
      [negocio({ stage_name: "A · Aluno Luan" })],
      AGORA,
    )
    expect(acoes).toEqual([])
    expect(resumo.ignorados.fora_da_cadencia).toBe(1)
  })

  it("cadência esgotada em coluna de T1/T2 não gera toque inexistente", () => {
    const { acoes } = planejarSla(
      [negocio({ custom_fields: { tentativas_contato: 3 } })],
      AGORA,
    )
    expect(acoes).toEqual([])
  })
})

describe("idempotência: a chave é por negócio, regra e DIA", () => {
  it("duas rodadas no mesmo dia produzem a mesma chave", () => {
    const manha = planejarSla([negocio()], new Date("2026-09-21T11:00:00Z"))
    const tarde = planejarSla([negocio()], new Date("2026-09-21T20:00:00Z"))
    expect(manha.acoes[0].chave).toBe(tarde.acoes[0].chave)
  })

  it("a chave usa o dia de SÃO PAULO, não o UTC", () => {
    // 02:00Z de 22/09 ainda é 21/09 às 23h em SP.
    expect(diaEmSaoPaulo(new Date("2026-09-22T02:00:00Z"))).toBe("2026-09-21")
  })

  it("regras diferentes no mesmo negócio não colidem", () => {
    const a = planejarSla([negocio()], AGORA).acoes[0].chave
    const b = planejarSla(
      [negocio({ stage_name: "T3 · Último toque" })],
      AGORA,
    ).acoes[0].chave
    expect(a).not.toBe(b)
  })
})

describe("tarefa semanal do parceiro", () => {
  it("é UMA tarefa pra coluna inteira, na segunda", () => {
    const t = tarefaSemanalDoParceiro("org1", 23, AGORA)
    expect(t?.conteudo).toBe("Revisar liberação com o Luan (23 leads)")
    expect(t?.chave).toBe("sla:revisar-parceiro:org1:2026-09-21")
  })

  it("um lead só sai no singular", () => {
    expect(tarefaSemanalDoParceiro("org1", 1, AGORA)?.conteudo).toContain("(1 lead)")
  })

  it("fora de segunda não cria nada", () => {
    expect(diaDaSemanaEmSaoPaulo(new Date("2026-09-22T11:00:00Z"))).toBe(2)
    expect(tarefaSemanalDoParceiro("org1", 23, new Date("2026-09-22T11:00:00Z"))).toBeNull()
  })

  it("coluna vazia não vira tarefa — revisar zero leads é ruído", () => {
    expect(tarefaSemanalDoParceiro("org1", 0, AGORA)).toBeNull()
  })
})

describe("resumo diz por que nada aconteceu", () => {
  it('"0 ações" sem o resumo não distingue nada', () => {
    const { acoes, resumo } = planejarSla(
      [
        negocio({ id: "a", tags: ["nao-contatar"] }),
        negocio({ id: "b", last_stage_changed_at: horasAtras(2) }),
        negocio({ id: "c", stage_name: "Ganho" }),
        negocio({ id: "d", last_stage_changed_at: null }),
      ],
      AGORA,
    )
    expect(acoes).toEqual([])
    expect(resumo).toEqual({
      avaliados: 4,
      ignorados: {
        sem_prazo: 1,
        dentro_do_prazo: 1,
        nao_contatar: 1,
        fora_da_cadencia: 1,
        ja_tem_tarefa: 0,
      },
    })
  })
})
