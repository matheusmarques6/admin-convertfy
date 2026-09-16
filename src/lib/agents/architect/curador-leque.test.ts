import { describe, it, expect, vi } from "vitest"
import { parseCuratorRanking } from "./curator-ranking.parser"
import {
  conflitoComAsDecididas,
  costurarLeque,
  escolherPorPosicao,
  parseEscolhaDaPosicao,
  type EscolhaDaPosicao,
  type PosicaoDoLeque,
} from "./curador-leque"

const pos = (i: number, section: string, ids: string[]): PosicaoDoLeque => ({
  block_index: i,
  section,
  papel: `papel ${i}`,
  requisitos: "",
  candidatas: "",
  notas: "",
  notaDaSecao: "",
  lacunas: "",
  eliminadas: "",
  idsPermitidos: ids,
})

const resposta = (variantId: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    block_index: 0,
    section: "hero",
    papel: "abre com a objeção",
    justificativa: "3 candidatas; objecao decidiu.",
    conversa_com: "",
    escolhas: [{ variant_id: variantId, motivo: "encaixa" }],
    ...extra,
  })

describe("parseEscolhaDaPosicao", () => {
  it("lê a decisão e mantém a posição do CÓDIGO", () => {
    const e = parseEscolhaDaPosicao(resposta("v1"), pos(0, "hero", ["v1", "v2"]))
    expect(e).toMatchObject({ block_index: 0, section: "hero", variant_id: "v1", motivo: "encaixa" })
    expect(e.justificativa).toContain("objecao")
    expect(e.erro).toBeUndefined()
  })

  it("o eco de outro block_index NÃO reendereça a escolha — vira registro", () => {
    // Aceitar o eco montaria a variante da posição 2 na 4 porque o modelo
    // copiou o número errado.
    const raw = resposta("v1", { block_index: 4, section: "footer" })
    const e = parseEscolhaDaPosicao(raw, pos(2, "body", ["v1"]))
    expect(e.block_index).toBe(2)
    expect(e.section).toBe("body")
    expect(e.eco_divergente).toContain("block_index 4")
    expect(e.eco_divergente).toContain("footer")
  })

  it("seção ecoada com caixa diferente não é divergência", () => {
    const e = parseEscolhaDaPosicao(resposta("v1", { section: " Hero " }), pos(0, "hero", ["v1"]))
    expect(e.eco_divergente).toBeUndefined()
  })

  it("id fora das candidatas servidas é DESCARTADO, não aceito", () => {
    const e = parseEscolhaDaPosicao(resposta("inventada"), pos(0, "hero", ["v1", "v2"]))
    expect(e.variant_id).toBeNull()
    expect(e.erro).toBe("ids_fora_das_candidatas")
  })

  it("distingue `escolhas: []` declarado de id inválido", () => {
    const e = parseEscolhaDaPosicao(
      JSON.stringify({ justificativa: "nenhuma sobreviveu ao passo 2", escolhas: [] }),
      pos(0, "hero", ["v1"]),
    )
    expect(e.erro).toBe("sem_escolha")
    expect(e.justificativa).toContain("passo 2")
  })

  it("JSON ilegível não derruba: vira posição vazia com o motivo", () => {
    const e = parseEscolhaDaPosicao("desculpe, não consegui", pos(1, "body", ["v1"]))
    expect(e).toMatchObject({ block_index: 1, section: "body", variant_id: null, erro: "json_ilegivel" })
  })

  it("aceita fence e prosa em volta", () => {
    const e = parseEscolhaDaPosicao("```json\n" + resposta("v1") + "\n```", pos(0, "hero", ["v1"]))
    expect(e.variant_id).toBe("v1")
  })

  it("a reserva vem do campo próprio ou da 2ª escolha, e nunca é a escolhida", () => {
    const comCampo = parseEscolhaDaPosicao(resposta("v1", { reserva: "v2" }), pos(0, "hero", ["v1", "v2"]))
    expect(comCampo.reserva).toBe("v2")

    const naSegunda = parseEscolhaDaPosicao(
      JSON.stringify({ escolhas: [{ variant_id: "v1" }, { variant_id: "v2" }] }),
      pos(0, "hero", ["v1", "v2"]),
    )
    expect(naSegunda.variant_id).toBe("v1")
    expect(naSegunda.reserva).toBe("v2")

    const repetida = parseEscolhaDaPosicao(resposta("v1", { reserva: "v1" }), pos(0, "hero", ["v1"]))
    expect(repetida.reserva).toBeNull()
  })

  it("reserva fora das candidatas é descartada", () => {
    const e = parseEscolhaDaPosicao(resposta("v1", { reserva: "inventada" }), pos(0, "hero", ["v1"]))
    expect(e.reserva).toBeNull()
  })
})

describe("conflitoComAsDecididas", () => {
  const escolha = (id: string, section: string, reserva: string | null = null): EscolhaDaPosicao => ({
    block_index: 2,
    section,
    papel: "",
    justificativa: "",
    conversa_com: "",
    variant_id: id,
    motivo: "encaixa",
    reserva,
  })

  it("hero repetida cai para a RESERVA em vez de sumir", () => {
    const r = conflitoComAsDecididas(escolha("h1", "hero", "h2"), [
      { block_index: 0, section: "hero", variant_id: "h1" },
    ])
    expect(r.escolha.variant_id).toBe("h2")
    expect(r.escolha.reserva).toBeNull()
    expect(r.escolha.motivo).toContain("reserva")
    expect(r.ajuste).toBe("reserva_por_repeticao")
  })

  it("sem reserva utilizável, a posição fica vazia — e o motivo é nomeado", () => {
    const r = conflitoComAsDecididas(escolha("h1", "hero"), [
      { block_index: 0, section: "hero", variant_id: "h1" },
    ])
    expect(r.escolha.variant_id).toBeNull()
    expect(r.escolha.erro).toBe("repetida_sem_reserva")
    expect(r.ajuste).toBe("vazia_por_repeticao")
  })

  it("reserva também bloqueada não vale", () => {
    const r = conflitoComAsDecididas(escolha("p1", "products", "p2"), [
      { block_index: 0, section: "products", variant_id: "p1" },
      { block_index: 1, section: "products", variant_id: "p2" },
    ])
    expect(r.escolha.variant_id).toBeNull()
  })

  it("repetir FORA de hero e products é composição legítima — não mexe", () => {
    const r = conflitoComAsDecididas(escolha("b1", "body"), [
      { block_index: 0, section: "body", variant_id: "b1" },
    ])
    expect(r.escolha.variant_id).toBe("b1")
    expect(r.ajuste).toBe("")
  })

  it("posição já vazia passa intacta", () => {
    const r = conflitoComAsDecididas({ ...escolha("x", "hero"), variant_id: null }, [])
    expect(r.ajuste).toBe("")
  })
})

describe("escolherPorPosicao", () => {
  it("é SÉRIE: cada posição recebe o que as anteriores decidiram", async () => {
    const vistos: number[][] = []
    const chamar = vi.fn(async (p: PosicaoDoLeque, ja) => {
      vistos.push(ja.map((d) => d.block_index))
      return { raw: resposta(p.idsPermitidos[0]) }
    })
    await escolherPorPosicao({
      posicoes: [pos(0, "hero", ["h1"]), pos(1, "body", ["b1"]), pos(2, "footer", ["f1"])],
      chamar,
    })
    expect(vistos).toEqual([[], [0], [0, 1]])
  })

  it("`try` é POR posição: a 2ª falhar não perde as outras", async () => {
    const chamar = vi.fn(async (p: PosicaoDoLeque) => {
      if (p.block_index === 1) throw new Error("timeout")
      return { raw: resposta(p.idsPermitidos[0]) }
    })
    const r = await escolherPorPosicao({
      posicoes: [pos(0, "hero", ["h1"]), pos(1, "body", ["b1"]), pos(2, "footer", ["f1"])],
      chamar,
    })
    expect(r.escolhas.map((e) => e.variant_id)).toEqual(["h1", null, "f1"])
    expect(r.falhas).toEqual([{ block_index: 1, erro: "timeout" }])
    expect(r.escolhas[1].erro).toContain("timeout")
    expect(chamar).toHaveBeenCalledTimes(3)
  })

  it("posição que falhou NÃO entra no <ja_decididas> da seguinte", async () => {
    const vistos: string[][] = []
    const chamar = vi.fn(async (p: PosicaoDoLeque, ja) => {
      vistos.push(ja.map((d) => d.variant_id))
      if (p.block_index === 0) throw new Error("boom")
      return { raw: resposta(p.idsPermitidos[0]) }
    })
    await escolherPorPosicao({ posicoes: [pos(0, "hero", ["h1"]), pos(1, "body", ["b1"])], chamar })
    expect(vistos[1]).toEqual([])
  })

  it("a repetição é resolvida DENTRO do laço, então a 3ª já vê a reserva", async () => {
    const chamar = vi.fn(async (p: PosicaoDoLeque) => {
      if (p.block_index === 0) return { raw: resposta("h1") }
      return { raw: resposta("h1", { reserva: "h2" }) }
    })
    const r = await escolherPorPosicao({
      posicoes: [pos(0, "hero", ["h1", "h2"]), pos(1, "hero", ["h1", "h2"])],
      chamar,
    })
    expect(r.escolhas.map((e) => e.variant_id)).toEqual(["h1", "h2"])
    expect(r.ajustes).toEqual([{ block_index: 1, ajuste: "reserva_por_repeticao" }])
  })

  it("o nome da variante chega ao <ja_decididas> quando existe", async () => {
    let visto: string | null | undefined
    const chamar = vi.fn(async (p: PosicaoDoLeque, ja) => {
      if (p.block_index === 1) visto = ja[0]?.nome
      return { raw: resposta(p.idsPermitidos[0]) }
    })
    await escolherPorPosicao({
      posicoes: [pos(0, "hero", ["h1"]), pos(1, "body", ["b1"])],
      chamar,
      nomePorVariante: new Map([["h1", "hero 3"]]),
    })
    expect(visto).toBe("hero 3")
  })
})

describe("costurarLeque", () => {
  const posicoes = [
    { block_index: 0, section: "hero" },
    { block_index: 1, section: "body" },
  ]
  const escolhas: EscolhaDaPosicao[] = [
    {
      block_index: 0,
      section: "hero",
      papel: "abre",
      justificativa: "j0",
      conversa_com: "",
      variant_id: "h1",
      motivo: "m0",
      reserva: null,
    },
    {
      block_index: 1,
      section: "body",
      papel: "",
      justificativa: "j1",
      conversa_com: "",
      variant_id: null,
      motivo: "",
      reserva: null,
      erro: "sem_escolha",
    },
  ]

  it("devolve o formato que o pipeline de hoje já consome", () => {
    const out = costurarLeque(posicoes, escolhas, "o fio do Estruturador")
    expect(out.estrutura).toEqual([
      { section: "hero", papel: "abre", block_index: 0 },
      { section: "body", papel: "", block_index: 1 },
    ])
    expect(out.fioNarrativo).toBe("o fio do Estruturador")
    expect(out.justificativas).toEqual({ 0: "j0", 1: "j1" })
  })

  it("o `escolhasRaw` costurado é legível pelo parseCuratorRanking", () => {
    // É esta a razão de costurar no formato antigo: conformidade, ranking,
    // restrição à shortlist e medidor continuam valendo sem um 2º caminho.
    const out = costurarLeque(posicoes, escolhas, "")
    const r = parseCuratorRanking({
      raw: out.escolhasRaw,
      sections: ["hero", "body"],
      typeIndex: new Map([["h1", "hero"]]),
      maxPerBlock: 1,
    })
    expect(r.malformed).toBe(false)
    expect(r.byBlock.get(0)?.map((c) => c.variant_id)).toEqual(["h1"])
    expect(r.emptyBlocks).toContain(1)
  })

  it("posição sem resposta vira `escolhas: []` — o caminho de lacuna que o pipeline já trata", () => {
    const out = costurarLeque(posicoes, [escolhas[0]], "")
    expect(out.escolhasDetalhadas[1]).toEqual({ block_index: 1, justificativa: "", escolhas: [] })
  })
})
