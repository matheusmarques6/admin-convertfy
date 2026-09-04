import { describe, it, expect } from "vitest"
import { pesquisaToFullText, type PesquisaFields } from "./briefing-text"

// Recorte da Innova Bay nova: as cinco seções preenchidas.
const store: PesquisaFields = {
  brand_thesis: "Tecnologia que se paga",
  brand_pillars: [{ number: "01", label: "Prova", text: "mostrar funcionando" }],
  store_story: "Começou em 2023",
  icp_frictions: ["desconfia de anúncio bonito"],
  icp_objections: [
    { objection: "Vai funcionar na minha instalação?", treatment: "Vídeo da instalação em 3 passos" },
  ],
  tone_use_words: ["sem risco"],
  tone_avoid_words: ["jornada"],
  ads_score: 6,
  ads_summary: "Conta concentrada em uma campanha",
  ads_risks: [{ what: "Fadiga", body: "criativo único há 60 dias" }],
}

describe("pesquisaToFullText — objeções (set/2026)", () => {
  it("objeção entra na seção 03 com o tratamento, separada da dor", () => {
    const texto = pesquisaToFullText(store)
    const secao03 = texto.split("## 03 · Cliente Ideal")[1].split("## 04")[0]
    expect(secao03).toContain("O que a faz hesitar:\n- desconfia de anúncio bonito")
    expect(secao03).toContain(
      "O que trava o checkout (objeções — já quer o produto e hesita):\n" +
        "- Vai funcionar na minha instalação? — tratamento: Vídeo da instalação em 3 passos",
    )
  })

  it("sem objeções o cabeçalho não aparece", () => {
    const texto = pesquisaToFullText({ ...store, icp_objections: null })
    expect(texto).not.toContain("O que trava o checkout")
    expect(texto).toContain("O que a faz hesitar")
  })
})

describe("pesquisaToFullText — recorte por seção", () => {
  it("default entrega o dossiê inteiro (nenhum chamador muda)", () => {
    const t = pesquisaToFullText(store)
    expect(t).toContain("## 01 · Perfil da Marca")
    expect(t).toContain("## 05 · Review dos Anúncios")
    expect(t).toContain("Conta concentrada")
  })

  // O Curador pede sem anúncios: era o maior pedaço de <perfil_marca>
  // (5.538 de 13.823 chars na Innova) e não diz nada sobre qual variante
  // serve ao email.
  it("incluirAds:false remove a seção 05 — e SÓ ela", () => {
    const t = pesquisaToFullText(store, { incluirAds: false })
    expect(t).not.toContain("## 05 · Review dos Anúncios")
    expect(t).not.toContain("Conta concentrada")
    expect(t).not.toContain("Fadiga")
    expect(t).toContain("## 01 · Perfil da Marca")
    expect(t).toContain("## 02 · Sobre a loja")
    expect(t).toContain("desconfia de anúncio bonito")
    expect(t).toContain("Vocabulário · Evitar: jornada")
  })

  it("incluirAds:true é o mesmo que omitir", () => {
    expect(pesquisaToFullText(store, { incluirAds: true })).toBe(
      pesquisaToFullText(store),
    )
  })
})
