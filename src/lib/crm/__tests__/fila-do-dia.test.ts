import { describe, it, expect } from "vitest"
import { TETO_DIARIO_PADRAO, montarFilaDoDia, type NegocioDaFila } from "../fila-do-dia"

function neg(over: Partial<NegocioDaFila> = {}): NegocioDaFila {
  return {
    id: "d1",
    title: "Ana",
    stage_name: "A · Aluno Luan",
    position: 10,
    contact_phone: "5511999998888",
    custom_fields: { segmento_parceiro: "A · Aluno Luan", prioridade: "P1" },
    ...over,
  }
}

const seg = (letra: string) =>
  ({
    A: "A · Aluno Luan",
    B: "B · Fez call, não comprou",
    C: "C · Agendou, não fez call",
    D: "D · MQL sem conversa",
  })[letra]!

describe("ordem: A → B → C → D, depois pela posição", () => {
  it("segmento manda sobre a posição", () => {
    const fila = montarFilaDoDia([
      neg({ id: "d", position: 1, custom_fields: { segmento_parceiro: seg("D") } }),
      neg({ id: "a", position: 999, custom_fields: { segmento_parceiro: seg("A") } }),
      neg({ id: "b", position: 500, custom_fields: { segmento_parceiro: seg("B") } }),
    ])
    expect(fila.novos.map((i) => i.dealId)).toEqual(["a", "b", "d"])
  })

  it("dentro do segmento, a posição do board decide", () => {
    const fila = montarFilaDoDia([
      neg({ id: "x", position: 30 }),
      neg({ id: "y", position: 10 }),
      neg({ id: "z", position: 20 }),
    ])
    expect(fila.novos.map((i) => i.dealId)).toEqual(["y", "z", "x"])
  })

  it("empate desempata por id — a ordem não muda entre recarregamentos", () => {
    const um = montarFilaDoDia([neg({ id: "b2" }), neg({ id: "a1" })])
    const dois = montarFilaDoDia([neg({ id: "a1" }), neg({ id: "b2" })])
    expect(um.novos.map((i) => i.dealId)).toEqual(dois.novos.map((i) => i.dealId))
  })

  it("segmento desconhecido vai pro fim, não pro começo", () => {
    const fila = montarFilaDoDia([
      neg({ id: "?", custom_fields: {} }),
      neg({ id: "d", custom_fields: { segmento_parceiro: seg("D") } }),
    ])
    expect(fila.novos.map((i) => i.dealId)).toEqual(["d", "?"])
  })
})

describe("teto diário", () => {
  const muitos = Array.from({ length: 50 }, (_, i) =>
    neg({ id: `d${String(i).padStart(2, "0")}`, position: i }),
  )

  it("corta no teto e diz quantos ficaram esperando", () => {
    const fila = montarFilaDoDia(muitos, { teto: 40 })
    expect(fila.novos).toHaveLength(40)
    expect(fila.aguardandoVez).toBe(10)
  })

  it("o padrão é o limite do número de WhatsApp", () => {
    expect(montarFilaDoDia(muitos).novos).toHaveLength(TETO_DIARIO_PADRAO)
  })

  it("teto zero não quebra e não engole a fila em silêncio", () => {
    const fila = montarFilaDoDia(muitos, { teto: 0 })
    expect(fila.novos).toEqual([])
    expect(fila.aguardandoVez).toBe(50)
  })
})

describe("pendentes vêm antes e NÃO contam no teto", () => {
  it("follow-up vencido entra em pendentes", () => {
    const fila = montarFilaDoDia([
      neg({ id: "v", custom_fields: { followup_vencido: true, tentativas_contato: 1 } }),
      neg({ id: "n" }),
    ])
    expect(fila.pendentes.map((i) => i.dealId)).toEqual(["v"])
    expect(fila.novos.map((i) => i.dealId)).toEqual(["n"])
  })

  it("tarefa VENCIDA entra em pendentes mesmo sem a marca do job", () => {
    const fila = montarFilaDoDia(
      [neg({ id: "t", tarefa: { id: "t1", content: "Enviar T2", due_at: "2026-09-20T12:00:00Z" } })],
      { agora: new Date("2026-09-22T12:00:00Z") },
    )
    expect(fila.pendentes).toHaveLength(1)
    expect(fila.novos).toEqual([])
  })

  it("o teto vale só sobre as novas — cortar follow-up mataria a cadência", () => {
    const pendentes = Array.from({ length: 5 }, (_, i) =>
      neg({ id: `p${i}`, custom_fields: { followup_vencido: true, tentativas_contato: 1 } }),
    )
    const fila = montarFilaDoDia([...pendentes, ...Array.from({ length: 3 }, (_, i) => neg({ id: `n${i}` }))], {
      teto: 2,
    })
    expect(fila.pendentes).toHaveLength(5)
    expect(fila.novos).toHaveLength(2)
  })

  it("pendente mais antigo primeiro — o de três dias é o que dói", () => {
    const fila = montarFilaDoDia(
      [
        neg({ id: "novo", tarefa: { id: "a", content: "x", due_at: "2026-09-21T09:00:00Z" } }),
        neg({ id: "velho", tarefa: { id: "b", content: "y", due_at: "2026-09-18T09:00:00Z" } }),
      ],
      { agora: new Date("2026-09-22T12:00:00Z") },
    )
    expect(fila.pendentes.map((i) => i.dealId)).toEqual(["velho", "novo"])
  })
})

describe("quem fica de fora, e por quê", () => {
  it("negociação com o parceiro não entra na fila", () => {
    const fila = montarFilaDoDia([neg({ stage_name: "Aguardando liberação Luan" })])
    expect(fila.novos).toEqual([])
    expect(fila.excluidos.aguardando_parceiro).toBe(1)
  })

  it("quem pediu pra parar nunca entra", () => {
    const fila = montarFilaDoDia([neg({ tags: ["nao-contatar"] })])
    expect(fila.excluidos.nao_contatar).toBe(1)
  })

  it("tag em qualquer caixa protege", () => {
    expect(montarFilaDoDia([neg({ tags: [" NAO-CONTATAR "] })]).excluidos.nao_contatar).toBe(1)
  })

  it("sem telefone sai — o botão só saberia falhar", () => {
    const fila = montarFilaDoDia([neg({ contact_phone: null }), neg({ id: "c", contact_phone: "1199" })])
    expect(fila.excluidos.sem_telefone).toBe(2)
  })

  it("checagem marcada pra depois NÃO é pendente — 40 toques de hoje afogariam o vencido", () => {
    const agora = new Date("2026-09-21T15:00:00Z")
    const fila = montarFilaDoDia(
      [
        neg({
          id: "hoje",
          custom_fields: { tentativas_contato: 1 },
          tarefa: { id: "a", content: "Checar resposta do T1", due_at: "2026-09-23T15:00:00Z" },
        }),
        neg({
          id: "vencido",
          custom_fields: { tentativas_contato: 1 },
          tarefa: { id: "b", content: "Checar resposta do T1", due_at: "2026-09-18T15:00:00Z" },
        }),
      ],
      { agora },
    )
    expect(fila.pendentes.map((i) => i.dealId)).toEqual(["vencido"])
    expect(fila.novos).toEqual([])
    expect(fila.excluidos.aguardando_resposta).toBe(1)
  })

  it("tarefa sem prazo é pendente: quem a criou à mão queria que fosse feita", () => {
    const fila = montarFilaDoDia([
      neg({ tarefa: { id: "a", content: "Ligar", due_at: null } }),
    ])
    expect(fila.pendentes).toHaveLength(1)
  })

  it("nutrição não volta à fila: ela é `open` e reapareceria como abordagem nova", () => {
    const fila = montarFilaDoDia([neg({ stage_name: "Nutrir · loja sem vendas" })])
    expect(fila.novos).toEqual([])
    expect(fila.excluidos.fora_da_cadencia).toBe(1)
  })

  it("cadência concluída sai das novas, com o motivo declarado", () => {
    const fila = montarFilaDoDia([neg({ custom_fields: { tentativas_contato: 3 } })])
    expect(fila.novos).toEqual([])
    expect(fila.excluidos.cadencia_concluida).toBe(1)
  })
})

describe("o item carrega o que o operador precisa ver", () => {
  it("segmento, prioridade, ângulo e o próximo toque", () => {
    const [item] = montarFilaDoDia([
      neg({
        custom_fields: {
          segmento_parceiro: seg("B"),
          prioridade: "P2",
          angulo: "irrelevante",
          angulo_abordagem: "Perguntar se colocou a loja no ar",
          tentativas_contato: 1,
        },
      }),
    ]).novos
    expect(item).toMatchObject({
      segmentoCurto: "B",
      prioridade: "P2",
      angulo: "Perguntar se colocou a loja no ar",
      tentativas: 1,
      proximoToque: "T2",
    })
  })

  it("alerta de dados viaja pro operador conferir antes de mandar", () => {
    const [item] = montarFilaDoDia([
      neg({ custom_fields: { alerta_dados: "telefone com 8 dígitos" } }),
    ]).novos
    expect(item.alerta).toBe("telefone com 8 dígitos")
  })
})
