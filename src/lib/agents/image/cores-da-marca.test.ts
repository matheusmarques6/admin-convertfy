/**
 * Casos medidos nas gerações de 09/09 — os três selos da `body 3` saíram
 * salmão / verde escuro / verde claro nas DUAS lojas, com as cores da peça
 * de referência.
 */
import { describe, expect, it } from "vitest"
import {
  PALETA_VAZIA,
  avisoDeCorDeReferencia,
  paletaPorPapel,
  traduzirCoresDoBrief,
} from "./cores-da-marca"

/** O texto real do cadastro da `body 3`, encurtado. */
const SELO_1 = "círculo chapado em #D88B71 (cor secundária) ocupando todo o canvas."
const SELO_2 = "mesma construção do selo 1, com o círculo chapado em #2A4439 (cor primária)."
const SELO_3 =
  "mesma construção, com o círculo chapado em #B0C4AB (cor terciária). Único dos três com texto escuro: centro e arco em #2A4439."

describe("paletaPorPapel", () => {
  it("cascata: secundária cai na 2ª primária, terciária na 3ª", () => {
    const p = paletaPorPapel(
      [{ hex: "#111111" }, { hex: "#222222" }, { hex: "#333333" }],
      [],
    )
    expect(p).toEqual({
      primaria: "#111111",
      secundaria: "#222222",
      terciaria: "#333333",
    })
  })

  it("secundária cadastrada vence a 2ª primária", () => {
    const p = paletaPorPapel([{ hex: "#111111" }, { hex: "#222222" }], [{ hex: "#999999" }])
    expect(p.secundaria).toBe("#999999")
    expect(p.terciaria).toBe("#222222")
  })

  it("o retrato real da base: 14 de 20 lojas sem cor nenhuma", () => {
    expect(paletaPorPapel([], [])).toEqual(PALETA_VAZIA)
    expect(paletaPorPapel(null, undefined)).toEqual(PALETA_VAZIA)
  })

  it("hex inválido não vira cor", () => {
    const p = paletaPorPapel([{ hex: "azul" }, { hex: "#ABC" }, { hex: "#00FF00" }], [])
    expect(p.primaria).toBe("#00FF00")
    expect(p.secundaria).toBeNull()
  })
})

describe("traduzirCoresDoBrief — a loja TEM paleta", () => {
  const paleta = {
    primaria: "#1F1F1F",
    secundaria: "#E4572E",
    terciaria: "#C9D6C1",
  }

  it("troca cada hex pela cor do MESMO papel", () => {
    const r = traduzirCoresDoBrief(`${SELO_1}\n${SELO_2}`, paleta)
    expect(r.texto).toContain("#E4572E (cor secundária)")
    expect(r.texto).toContain("#1F1F1F (cor primária)")
    expect(r.texto).not.toContain("#D88B71")
    expect(r.trocas.map((t) => t.papel).sort()).toEqual(["primaria", "secundaria"])
    expect(r.semCorDaLoja).toEqual([])
  })

  it("o hex mapeado é trocado em TODAS as ocorrências, não só onde o papel aparece", () => {
    // O seal_3 repete `#2A4439` sem rótulo. Trocar só a primeira deixaria a
    // peça com metade da paleta nova e metade da antiga.
    const r = traduzirCoresDoBrief(`${SELO_2}\n${SELO_3}`, paleta)
    expect(r.texto).not.toContain("#2A4439")
    expect(r.texto.match(/#1F1F1F/g)).toHaveLength(2)
    expect(r.texto).toContain("#C9D6C1 (cor terciária)")
  })

  it("caixa diferente no cadastro não escapa da troca", () => {
    const r = traduzirCoresDoBrief(
      "fundo em #2a4439 (cor primária); borda em #2A4439",
      paleta,
    )
    expect(r.texto).not.toMatch(/#2a4439/i)
  })

  it("cor que já é a da loja não conta como troca", () => {
    const r = traduzirCoresDoBrief("chapado em #1F1F1F (cor primária)", paleta)
    expect(r.trocas).toEqual([])
    expect(r.texto).toContain("#1F1F1F")
  })
})

describe("traduzirCoresDoBrief — a loja NÃO tem paleta (o caso comum)", () => {
  it("o hex FICA, mas é declarado como cor de referência", () => {
    const r = traduzirCoresDoBrief(`${SELO_1}\n${SELO_2}`, PALETA_VAZIA)
    // Trocar por preto e branco pioraria a peça em 19 de 20 lojas.
    expect(r.texto).toContain("#D88B71")
    expect(r.trocas).toEqual([])
    expect(r.semCorDaLoja.map((c) => c.papel).sort()).toEqual([
      "primaria",
      "secundaria",
    ])
    const aviso = avisoDeCorDeReferencia(r)
    expect(aviso).toContain("#D88B71")
    expect(aviso).toContain("NÃO da paleta desta marca")
  })

  it("paleta parcial traduz o que dá e declara o resto", () => {
    const r = traduzirCoresDoBrief(`${SELO_1}\n${SELO_2}`, {
      primaria: "#000000",
      secundaria: null,
      terciaria: null,
    })
    expect(r.texto).toContain("#000000 (cor primária)")
    expect(r.texto).toContain("#D88B71") // secundária ficou
    expect(r.semCorDaLoja).toEqual([{ hex: "#D88B71", papel: "secundaria" }])
  })
})

describe("traduzirCoresDoBrief — o que NÃO se toca", () => {
  const paleta = { primaria: "#1F1F1F", secundaria: "#E4572E", terciaria: "#C9D6C1" }

  it("hex sem papel declarado fica intacto — não se sabe o que seria", () => {
    // `offer 3`: "O card (558 × 517, raio 19, #C7D6EB)". Sem papel, trocar
    // pela primária seria chute.
    const r = traduzirCoresDoBrief("O card (raio 19, #C7D6EB) e o gradiente.", paleta)
    expect(r.texto).toContain("#C7D6EB")
    expect(r.trocas).toEqual([])
    expect(r.semPapel).toEqual(["#C7D6EB"])
    expect(avisoDeCorDeReferencia(r)).toBe("")
  })

  it("painel A/B do comparativo não é papel de paleta", () => {
    // O painel B é o genérico do concorrente, cinza por decisão de desenho:
    // pintá-lo com a cor da marca inverteria o argumento do bloco.
    const r = traduzirCoresDoBrief(
      "retângulo na cor do painel A ( #FAF7F2) … painel B ( #EFEFEF).",
      paleta,
    )
    expect(r.texto).toContain("#FAF7F2")
    expect(r.texto).toContain("#EFEFEF")
    expect(r.trocas).toEqual([])
  })

  it("o rótulo distante não captura o hex de outra frase", () => {
    const longe = `#AABBCC ${"x".repeat(80)} (cor primária)`
    const r = traduzirCoresDoBrief(longe, paleta)
    expect(r.texto).toContain("#AABBCC")
    expect(r.trocas).toEqual([])
  })

  it("texto sem hex, vazio ou nulo atravessa intacto", () => {
    expect(traduzirCoresDoBrief("foto de estúdio, luz difusa", paleta).texto).toBe(
      "foto de estúdio, luz difusa",
    )
    expect(traduzirCoresDoBrief("", paleta).texto).toBe("")
    expect(traduzirCoresDoBrief(null, paleta).texto).toBe("")
  })

  it("sem hex sem tradução, nenhum aviso é emitido", () => {
    const r = traduzirCoresDoBrief(SELO_2, paleta)
    expect(avisoDeCorDeReferencia(r)).toBe("")
  })
})
