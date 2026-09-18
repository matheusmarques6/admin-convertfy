import { describe, expect, it } from "vitest"

import { escalaDoBotao, ESCALA_PADRAO } from "./escala-do-botao"
import type { Cta } from "./color-faixas"

const cta = (over: Partial<Cta> & { id: string }): Cta => ({
  bloco: 1,
  faixa: 1,
  texto: "Comprar",
  href: "https://loja.com",
  fundo: "#000000",
  label: "#FFFFFF",
  tipo: "preenchido",
  largura_px: null,
  radius_px: null,
  font_size_px: null,
  peso: null,
  padding_v: null,
  padding_h: null,
  vml: false,
  somente_outlook: false,
  contraste: null,
  range: { start: 0, end: 1 },
  ...over,
})

describe("escalaDoBotao", () => {
  it("o caso real: os 6 links do rodapé NÃO decidem a escala", () => {
    // Hero Boxers, welcome 1. O documento tem 7 CTAs e seis deles são os
    // "Link Here" do rodapé, vazados, com 18px. A mediana de todos daria
    // 18px e o botão novo sairia menor ainda que os 15px da constante.
    const peca = [
      cta({ id: "cta1", tipo: "preenchido", font_size_px: 24, peso: 700, padding_v: 18, padding_h: 56, radius_px: 4 }),
      ...Array.from({ length: 6 }, (_, i) =>
        cta({ id: `cta${i + 2}`, tipo: "vazado", fundo: null, font_size_px: 18, padding_v: 14, padding_h: 36 }),
      ),
    ]
    const e = escalaDoBotao(peca)
    expect(e.fontSizePx).toBe(24)
    expect(e.peso).toBe(700)
    expect(e.paddingH).toBe(56)
    expect(e.origem).toBe("peca")
    expect(e.base).toBe(1)
  })

  it("o caso real 2: os botões de CARD de produto não decidem a escala", () => {
    // Innova Bay, welcome 1, 17/09. Medido no Chromium: os botões de seção
    // fazem 354–405px com fonte 22–32; os três de card fazem 164px com 20.
    // A mediana dos SEIS preenchidos dava 20px — o botão novo nascia do
    // tamanho do menor botão da peça. É o defeito de 11/09 pela outra
    // ponta: o filtro `preenchido` não separa card de seção.
    const peca = [
      cta({ id: "cta1", largura_px: 387, font_size_px: 25, peso: 900 }),
      cta({ id: "cta2", largura_px: 354, font_size_px: 32, peso: 400 }),
      cta({ id: "cta3", largura_px: 164, font_size_px: 20, peso: 900 }),
      cta({ id: "cta4", largura_px: 164, font_size_px: 20, peso: 900 }),
      cta({ id: "cta5", largura_px: 164, font_size_px: 20, peso: 900 }),
      cta({ id: "cta6", largura_px: 390, font_size_px: 22, peso: 400 }),
    ]
    const e = escalaDoBotao(peca)
    expect(e.fontSizePx).toBe(25)
    expect(e.origem).toBe("secao")
    expect(e.base).toBe(3)
  })

  it("peça só de botões de card: eles valem, porque é o que existe", () => {
    // Cada degrau só é usado quando o de cima está vazio — não sobra peça
    // sem escala por causa do filtro.
    const e = escalaDoBotao([
      cta({ id: "a", largura_px: 164, font_size_px: 20 }),
      cta({ id: "b", largura_px: 164, font_size_px: 20 }),
    ])
    expect(e.fontSizePx).toBe(20)
    expect(e.origem).toBe("peca")
  })

  it("peça que não declara largura mede como antes", () => {
    // Zero regressão: sem `largura_px` nenhum botão é de seção e a cascata
    // cai no degrau dos preenchidos, que é o comportamento de 11/09.
    const e = escalaDoBotao([
      cta({ id: "a", font_size_px: 24 }),
      cta({ id: "b", font_size_px: 24 }),
    ])
    expect(e.fontSizePx).toBe(24)
    expect(e.origem).toBe("peca")
  })

  it("sem botão preenchido, o conjunto vale", () => {
    const e = escalaDoBotao([
      cta({ id: "a", tipo: "vazado", fundo: null, font_size_px: 20 }),
      cta({ id: "b", tipo: "vazado", fundo: null, font_size_px: 20 }),
    ])
    expect(e.fontSizePx).toBe(20)
    expect(e.origem).toBe("peca")
  })

  it("peça sem nenhum botão cai no padrão da casa", () => {
    const e = escalaDoBotao([])
    expect(e).toMatchObject({ ...ESCALA_PADRAO, origem: "padrao", base: 0 })
  })

  it("botões sem estilo declarado não mentem a origem", () => {
    // Todos os campos nulos: não há o que medir, e dizer `peca` faria a
    // telemetria afirmar uma medição que não aconteceu.
    const e = escalaDoBotao([cta({ id: "a" }), cta({ id: "b" })])
    expect(e.fontSizePx).toBe(ESCALA_PADRAO.fontSizePx)
    expect(e.origem).toBe("padrao")
    expect(e.base).toBe(0)
  })

  it("cada dimensão cai para o padrão sozinha", () => {
    // Peça que declara fonte e não declara raio herda a fonte e usa o raio
    // da casa — descartar a medida inteira por um campo ausente jogaria
    // fora o dado que existe.
    const e = escalaDoBotao([cta({ id: "a", font_size_px: 22, radius_px: null })])
    expect(e.fontSizePx).toBe(22)
    expect(e.radiusPx).toBe(ESCALA_PADRAO.radiusPx)
  })

  it("é MEDIANA, não média — um banner não desloca a escala", () => {
    const e = escalaDoBotao([
      cta({ id: "a", font_size_px: 16 }),
      cta({ id: "b", font_size_px: 16 }),
      cta({ id: "c", font_size_px: 64 }),
    ])
    expect(e.fontSizePx).toBe(16)
  })

  it("com dois valores devolve o menor — o lado conservador", () => {
    const e = escalaDoBotao([
      cta({ id: "a", font_size_px: 16 }),
      cta({ id: "b", font_size_px: 30 }),
    ])
    expect(e.fontSizePx).toBe(16)
  })
})
