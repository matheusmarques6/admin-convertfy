import { describe, expect, it } from "vitest"
import { blocoDeReferencias, renderizarReferencia, selecionarReferencias, utilizavel, type ReferenciaParaPrompt } from "./referencias"

const ref = (over: Partial<ReferenciaParaPrompt> & { nome: string }): ReferenciaParaPrompt => ({
  slides: [
    { ordem: 1, imagemUrl: "x", tipo: "capa", titulo: "8% dos clientes fazem 41% do faturamento", corpo: "e a maioria trata todo mundo igual" },
    { ordem: 2, imagemUrl: "x", tipo: "dado", titulo: "41%", corpo: "da receita vem de menos de 1 em cada 10 clientes" },
    { ordem: 7, imagemUrl: "x", tipo: "cta", titulo: "Comente 41", corpo: "e eu te mando a segmentação no direct" },
  ],
  legenda: "A maioria das lojas trata todo cliente igual. Comente 41 aqui embaixo.",
  palavraChave: "41",
  pilar: "Educacional",
  molde: "Turbo",
  porQueFunciona: ["Capa com número e contraste", "Um dado por slide"],
  metricas: { reach: 2246, saved: 23, shares: 19, follows: 2, comments: 8 },
  peso: 1,
  ativa: true,
  transcricao: "lida",
  ...over,
})

describe("utilizavel", () => {
  it("só ativa, lida e com alguma copy", () => {
    expect(utilizavel(ref({ nome: "a" }))).toBe(true)
    expect(utilizavel(ref({ nome: "b", ativa: false }))).toBe(false)
    expect(utilizavel(ref({ nome: "c", transcricao: "pendente" }))).toBe(false)
    // Transcrita mas vazia (a IA não leu nada): não ensina nada.
    expect(utilizavel(ref({ nome: "d", slides: [{ ordem: 1, imagemUrl: "x" }] }))).toBe(false)
  })
})

describe("selecionarReferencias", () => {
  it("mesmo molde vence mesmo pilar, que vence peso", () => {
    const sel = selecionarReferencias(
      [
        ref({ nome: "peso3", molde: "MEC", pilar: "Case", peso: 3 }),
        ref({ nome: "pilar", molde: "MEC", pilar: "Educacional", peso: 1 }),
        ref({ nome: "molde", molde: "Turbo", pilar: "Case", peso: 1 }),
      ],
      { molde: "Turbo", pilar: "Educacional" },
    )
    expect(sel.map((r) => r.nome)).toEqual(["molde", "pilar", "peso3"])
  })

  it("sem contexto, peso e depois salvamentos decidem", () => {
    const sel = selecionarReferencias([
      ref({ nome: "fraca", peso: 1, metricas: { reach: 100, saved: 1, shares: 0, follows: 0, comments: 0 } }),
      ref({ nome: "forte", peso: 1, metricas: { reach: 100, saved: 40, shares: 0, follows: 0, comments: 0 } }),
      ref({ nome: "curada", peso: 3, metricas: null }),
    ])
    expect(sel.map((r) => r.nome)).toEqual(["curada", "forte", "fraca"])
  })

  it("respeita o teto de itens", () => {
    const todas = Array.from({ length: 8 }, (_, i) => ref({ nome: `r${i}` }))
    expect(selecionarReferencias(todas).length).toBe(4)
    expect(selecionarReferencias(todas, {}, { maxItens: 2 }).length).toBe(2)
  })

  it("teto de caracteres deixa a longa de fora mesmo com vaga em itens", () => {
    const longa = ref({ nome: "longa", legenda: "x".repeat(5000), slides: Array.from({ length: 10 }, (_, i) => ({ ordem: i + 1, imagemUrl: "x", titulo: `t${i}`, corpo: "y".repeat(200) })) })
    const curta = ref({ nome: "curta" })
    const sel = selecionarReferencias([longa, curta], {}, { maxChars: 800 })
    expect(sel.map((r) => r.nome)).toEqual(["curta"])
  })

  it("empate mantém a ordem de entrada (estável)", () => {
    const sel = selecionarReferencias([ref({ nome: "a" }), ref({ nome: "b" }), ref({ nome: "c" })])
    expect(sel.map((r) => r.nome)).toEqual(["a", "b", "c"])
  })

  it("ignora as não utilizáveis", () => {
    const sel = selecionarReferencias([ref({ nome: "pendente", transcricao: "pendente" }), ref({ nome: "ok" })])
    expect(sel.map((r) => r.nome)).toEqual(["ok"])
  })
})

describe("renderizarReferencia", () => {
  it("numera os slides, traz molde/pilar/métricas e o porquê — nunca a imagem", () => {
    const txt = renderizarReferencia(ref({ nome: "8% fazem 41%" }), 2)
    expect(txt).toContain('### Referência 2: "8% fazem 41%"')
    expect(txt).toContain("molde Turbo · pilar Educacional")
    expect(txt).toContain("23 salvamentos")
    expect(txt).toContain("01 [capa] 8% dos clientes fazem 41% do faturamento — e a maioria trata todo mundo igual")
    expect(txt).toContain("07 [cta] Comente 41")
    expect(txt).toContain("Palavra-chave do comment gate: 41")
    expect(txt).toContain("Por que funciona: Capa com número e contraste / Um dado por slide")
    expect(txt).not.toContain("imagemUrl")
  })

  it("corta corpo e legenda longos", () => {
    const txt = renderizarReferencia(ref({ nome: "x", legenda: "l".repeat(2000), slides: [{ ordem: 1, imagemUrl: "x", titulo: "t", corpo: "c".repeat(600) }] }), 1)
    expect(txt.length).toBeLessThan(1400)
    expect(txt).toContain("…")
  })

  it("slide sem copy some da lista", () => {
    const txt = renderizarReferencia(ref({ nome: "x", slides: [{ ordem: 1, imagemUrl: "x", titulo: "só este" }, { ordem: 2, imagemUrl: "x" }] }), 1)
    expect(txt).toContain("01 [slide] só este")
    expect(txt).not.toContain("02 ")
  })
})

describe("blocoDeReferencias", () => {
  it("vazio sem referência — o pedido segue como antes", () => {
    expect(blocoDeReferencias([])).toBe("")
  })

  it("avisa que os números são dos posts originais, antes e depois dos exemplos", () => {
    const b = blocoDeReferencias([ref({ nome: "a" })])
    expect(b).toContain("exemplos de ESTILO")
    expect(b).toContain("não os reutilize como dado deste carrossel")
    expect(b).toContain("Fim das referências")
    expect(b.indexOf("Referência 1")).toBeGreaterThan(b.indexOf("exemplos de ESTILO"))
    expect(b.indexOf("Fim das referências")).toBeGreaterThan(b.indexOf("Referência 1"))
  })
})
