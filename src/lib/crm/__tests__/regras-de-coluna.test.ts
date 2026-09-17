import { describe, it, expect } from "vitest"
import {
  ETAPA_AGUARDANDO,
  ETAPA_DIAGNOSTICO,
  ETAPA_NUTRIR,
  ETAPA_QUALIFICAR,
  MOTIVO_NAO_CONTATAR,
  TAG_NAO_CONTATAR,
  impedimentosDaMudanca,
  perguntasDeSaida,
  motivoCanonico,
  regrasSemEtapa,
  sugestoes,
  tagsAoMudar,
  type ContextoDaMudanca,
} from "../regras-de-coluna"

const aberta = (name: string) => ({ name, stage_type: "open" as string | null })

function ctx(over: Partial<ContextoDaMudanca> = {}): ContextoDaMudanca {
  return {
    etapaAtual: aberta("T1 · Abordado"),
    etapaDestino: aberta("T2 · Follow-up com valor"),
    ...over,
  }
}

const codigos = (c: ContextoDaMudanca) => impedimentosDaMudanca(c).map((i) => i.codigo)

describe("perder exige motivo da lista", () => {
  const perdido = { name: "Perdido · sem interesse/fit", stage_type: "lost" }

  it("sem motivo, bloqueia", () => {
    expect(codigos(ctx({ etapaDestino: perdido }))).toContain("lost_reason_ausente")
  })

  it("motivo da lista passa", () => {
    expect(
      codigos(
        ctx({
          etapaDestino: perdido,
          lostReason: "Sem interesse",
          motivosValidos: ["Sem interesse", "Preço"],
        }),
      ),
    ).toEqual([])
  })

  it("acento e caixa não travam o vendedor", () => {
    expect(
      codigos(
        ctx({
          etapaDestino: perdido,
          lostReason: "  preco  ",
          motivosValidos: ["Preço"],
        }),
      ),
    ).toEqual([])
  })

  it("motivo fora da lista bloqueia", () => {
    expect(
      codigos(
        ctx({
          etapaDestino: perdido,
          lostReason: "Sumiu",
          motivosValidos: ["Sem interesse"],
        }),
      ),
    ).toContain("lost_reason_desconhecido")
  })

  it("motivo COM comentário passa — o diálogo grava 'Motivo — comentário'", () => {
    // Sem isto, toda perda comentada tomaria 422: era o que o botão de
    // perder do board mandava.
    expect(
      codigos(
        ctx({
          etapaDestino: perdido,
          lostReason: "Sem interesse — disse que não vale a pena agora",
          motivosValidos: ["Sem interesse", "Preço"],
        }),
      ),
    ).toEqual([])
  })

  it("org sem lista cadastrada aceita qualquer motivo escrito", () => {
    // Bloquear aqui travaria toda org que ainda não cadastrou motivos.
    expect(
      codigos(ctx({ etapaDestino: perdido, lostReason: "Sumiu", motivosValidos: [] })),
    ).toEqual([])
  })
})

describe("sair de Respondeu · qualificar exige a maturidade", () => {
  it("sem maturidade, bloqueia", () => {
    expect(
      codigos(
        ctx({ etapaAtual: aberta(ETAPA_QUALIFICAR), etapaDestino: aberta(ETAPA_NUTRIR) }),
      ),
    ).toContain("maturidade_ausente")
  })

  it("string vazia não conta como preenchida", () => {
    expect(
      codigos(
        ctx({
          etapaAtual: aberta(ETAPA_QUALIFICAR),
          etapaDestino: aberta(ETAPA_NUTRIR),
          custom_fields: { maturidade_loja: "   " },
        }),
      ),
    ).toContain("maturidade_ausente")
  })

  it("com maturidade, libera", () => {
    expect(
      codigos(
        ctx({
          etapaAtual: aberta(ETAPA_QUALIFICAR),
          etapaDestino: aberta(ETAPA_NUTRIR),
          custom_fields: { maturidade_loja: "Sem loja" },
        }),
      ),
    ).toEqual([])
  })

  it("reordenar dentro da própria coluna não é saída", () => {
    expect(
      codigos(
        ctx({
          etapaAtual: aberta(ETAPA_QUALIFICAR),
          etapaDestino: aberta(ETAPA_QUALIFICAR),
        }),
      ),
    ).toEqual([])
  })
})

describe("sair de Aguardando liberação Luan pede confirmação", () => {
  const base = {
    etapaAtual: aberta(ETAPA_AGUARDANDO),
    etapaDestino: aberta("B · Fez call, não comprou"),
  }

  it("pergunta é feita e vira nota", () => {
    const [p] = perguntasDeSaida(ctx(base))
    expect(p.codigo).toBe("luan_liberou")
    expect(p.viraNota).toBe(true)
  })

  it("sem resposta, bloqueia", () => {
    expect(codigos(ctx(base))).toContain("confirmacao:luan_liberou")
  })

  it("resposta escrita libera", () => {
    expect(
      codigos(ctx({ ...base, confirmacoes: { luan_liberou: "Sim, liberou em 20/09" } })),
    ).toEqual([])
  })

  it("resposta em branco não conta", () => {
    expect(codigos(ctx({ ...base, confirmacoes: { luan_liberou: "  " } }))).toContain(
      "confirmacao:luan_liberou",
    )
  })

  it("reordenar dentro da coluna não pergunta nada", () => {
    expect(
      perguntasDeSaida(ctx({ ...base, etapaDestino: aberta(ETAPA_AGUARDANDO) })),
    ).toEqual([])
  })
})

describe("sugestões são conselho, nunca bloqueio", () => {
  const de = (maturidade: string, destino: string) =>
    ctx({
      etapaAtual: aberta(ETAPA_QUALIFICAR),
      etapaDestino: aberta(destino),
      custom_fields: { maturidade_loja: maturidade },
    })

  it("loja vendendo indo pra Nutrir é apontado", () => {
    const s = sugestoes(de("Vendendo", ETAPA_NUTRIR))
    expect(s.map((x) => x.codigo)).toContain("vendendo_para_nutrir")
    // E continua sendo permitido.
    expect(codigos(de("Vendendo", ETAPA_NUTRIR))).toEqual([])
  })

  it("loja vendendo indo pro diagnóstico não gera ruído", () => {
    expect(sugestoes(de("Vendendo", ETAPA_DIAGNOSTICO))).toEqual([])
  })

  it("loja sem vendas indo pro diagnóstico sugere nutrir", () => {
    expect(sugestoes(de("Em construção", ETAPA_DIAGNOSTICO)).map((x) => x.codigo)).toContain(
      "sem_vendas_para_nutrir",
    )
  })

  it("terminal não recebe sugestão — perder é decisão tomada", () => {
    expect(
      sugestoes(
        ctx({
          etapaAtual: aberta(ETAPA_QUALIFICAR),
          etapaDestino: { name: "Perdido · sem interesse/fit", stage_type: "lost" },
          custom_fields: { maturidade_loja: "Sem loja" },
        }),
      ),
    ).toEqual([])
  })

  it("sem maturidade não sugere nada — o bloqueio já cobra", () => {
    expect(sugestoes(de("", ETAPA_NUTRIR))).toEqual([])
  })
})

describe("tagsAoMudar", () => {
  const perdido = { name: "Perdido · sem interesse/fit", stage_type: "lost" }

  it("o pedido de parar vira tag permanente", () => {
    expect(tagsAoMudar(ctx({ etapaDestino: perdido, lostReason: MOTIVO_NAO_CONTATAR }))).toEqual(
      [TAG_NAO_CONTATAR],
    )
  })

  it("compara sem acento e caixa", () => {
    expect(
      tagsAoMudar(ctx({ etapaDestino: perdido, lostReason: "pediu para nao ser contatado" })),
    ).toEqual([TAG_NAO_CONTATAR])
  })

  it("comentário do vendedor não desliga a proteção que a pessoa pediu", () => {
    expect(
      tagsAoMudar(
        ctx({
          etapaDestino: perdido,
          lostReason: `${MOTIVO_NAO_CONTATAR} — pediu por áudio em 18/09`,
        }),
      ),
    ).toEqual([TAG_NAO_CONTATAR])
  })

  it("outro motivo de perda não marca", () => {
    expect(tagsAoMudar(ctx({ etapaDestino: perdido, lostReason: "Preço" }))).toEqual([])
  })

  it("etapa não terminal nunca marca", () => {
    expect(
      tagsAoMudar(ctx({ etapaDestino: aberta("T2"), lostReason: MOTIVO_NAO_CONTATAR })),
    ).toEqual([])
  })
})

describe("motivoCanonico", () => {
  const lista = ["Sem interesse", "Preço", "Preço do concorrente"]

  it("casa o motivo exato", () => {
    expect(motivoCanonico("Preço", lista)).toBe("Preço")
  })

  it("casa por prefixo quando há comentário", () => {
    expect(motivoCanonico("Sem interesse — já tem agência", lista)).toBe("Sem interesse")
  })

  it("o prefixo MAIS LONGO vence — senão 'Preço' engoliria o específico", () => {
    expect(motivoCanonico("Preço do concorrente — 30% mais barato", lista)).toBe(
      "Preço do concorrente",
    )
  })

  it("não casa no meio de outra palavra", () => {
    expect(motivoCanonico("Precoce demais", ["Preco"])).toBeNull()
  })

  it("texto vazio ou lista vazia devolve null", () => {
    expect(motivoCanonico("", lista)).toBeNull()
    expect(motivoCanonico("Preço", [])).toBeNull()
  })
})

describe("regrasSemEtapa", () => {
  it("denuncia a regra que ficou sem coluna — renomear a desliga calado", () => {
    expect(regrasSemEtapa(["T1 · Abordado"])).toEqual([ETAPA_AGUARDANDO, ETAPA_QUALIFICAR])
  })

  it("pipeline completa não tem lacuna", () => {
    expect(regrasSemEtapa([ETAPA_AGUARDANDO, ETAPA_QUALIFICAR, "Ganho"])).toEqual([])
  })

  it("compara sem acento — 'Respondeu · qualificar' é o mesmo nome", () => {
    expect(regrasSemEtapa([ETAPA_AGUARDANDO, "RESPONDEU · QUALIFICAR"])).toEqual([])
  })
})
