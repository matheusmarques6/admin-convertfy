import { describe, expect, it } from "vitest"

import type { Cta } from "./color-faixas"
import { aplicarRaio, LIMITE_DE_ACABAMENTO, unificarRaio } from "./raio-do-botao"

const cta = (over: Partial<Cta> & { id: string }): Cta => ({
  bloco: 2,
  faixa: 3,
  texto: "Comprar",
  href: "https://loja.com/col",
  fundo: "#111111",
  label: "#FFFFFF",
  tipo: "preenchido",
  font_size_px: 16,
  peso: 700,
  padding_v: 14,
  padding_h: 28,
  largura_px: 260,
  radius_px: 8,
  vml: false,
  somente_outlook: false,
  contraste: 18,
  range: { start: 100, end: 200 },
  ...over,
})

describe("unificarRaio", () => {
  it("o caso que originou isto: 10px e 8px na mesma peça viram um só", () => {
    const r = unificarRaio([cta({ id: "cta1", radius_px: 10 }), cta({ id: "cta2", radius_px: 8 })])
    expect(r.alvo).toBe(8)
    expect(r.trocas).toEqual([{ id: "cta1", de: 10, para: 8 }])
    expect(r.lacuna).toBeNull()
  })

  it("o alvo é sempre um raio que EXISTE na peça — nunca a média de dois", () => {
    const r = unificarRaio([cta({ id: "a", radius_px: 8 }), cta({ id: "b", radius_px: 10 })])
    expect([8, 10]).toContain(r.alvo)
    expect(r.alvo).not.toBe(9)
  })

  it("peça coerente não gera troca nenhuma", () => {
    const r = unificarRaio([cta({ id: "a", radius_px: 8 }), cta({ id: "b", radius_px: 8 })])
    expect(r.alvo).toBeNull()
    expect(r.trocas).toEqual([])
  })

  it("botão sem raio declarado não é tocado — não declarar ≠ declarar outro valor", () => {
    const r = unificarRaio([
      cta({ id: "a", radius_px: 8 }),
      cta({ id: "b", radius_px: 10 }),
      cta({ id: "sem", radius_px: null }),
    ])
    expect(r.trocas.map((t) => t.id)).toEqual(["b"])
  })

  it("pílula com canto vivo é DESENHO, não acabamento: cala-se e registra", () => {
    const r = unificarRaio([cta({ id: "a", radius_px: 8 }), cta({ id: "pilula", radius_px: 100 })])
    expect(r.alvo).toBeNull()
    expect(r.trocas).toEqual([])
    expect(r.lacuna).toMatch(/FORMA/)
  })

  it("a fronteira entre acabamento e forma é o limite declarado", () => {
    const dentro = unificarRaio([
      cta({ id: "a", radius_px: 4 }),
      cta({ id: "b", radius_px: 4 + LIMITE_DE_ACABAMENTO }),
    ])
    expect(dentro.alvo).not.toBeNull()

    const fora = unificarRaio([
      cta({ id: "a", radius_px: 4 }),
      cta({ id: "b", radius_px: 5 + LIMITE_DE_ACABAMENTO }),
    ])
    expect(fora.alvo).toBeNull()
    expect(fora.lacuna).not.toBeNull()
  })

  it("botão só do Outlook fica de fora da conta", () => {
    const r = unificarRaio([
      cta({ id: "a", radius_px: 8 }),
      cta({ id: "b", radius_px: 8 }),
      cta({ id: "mso", radius_px: 2, somente_outlook: true }),
    ])
    expect(r.alvo).toBeNull()
    expect(r.trocas).toEqual([])
  })

  it("sem botão nenhum não quebra", () => {
    expect(unificarRaio([])).toEqual({ alvo: null, trocas: [], lacuna: null })
  })
})

describe("aplicarRaio", () => {
  const todo = (h: string) => ({ start: 0, end: h.length })

  it("troca a declaração simples e conta", () => {
    const h = `<td style="background:#111;border-radius:10px;padding:14px">x</td>`
    const r = aplicarRaio(h, 10, 8, todo(h))
    expect(r.html).toContain("border-radius:8px")
    expect(r.trocados).toBe(1)
  })

  it("NÃO toca no atalho de quatro cantos", () => {
    const h = `<td style="border-radius:8px 8px 0 0">x</td>`
    const r = aplicarRaio(h, 8, 4, todo(h))
    expect(r.html).toBe(h)
    expect(r.trocados).toBe(0)
  })

  it("o arcsize do Outlook acompanha, calculado sobre a altura", () => {
    const h = `<v:roundrect style="height:61px;width:354px;" arcsize="13%" fillcolor="#000"><![endif]--><a style="border-radius:8px">x</a>`
    const r = aplicarRaio(h, 8, 16, todo(h))
    expect(r.html).toContain("border-radius:16px")
    // 16 / 61 = 26%
    expect(r.html).toContain('arcsize="26%"')
  })

  it("roundrect sem altura declarada fica intacto — chutar seria pior", () => {
    const h = `<v:roundrect arcsize="13%" fillcolor="#000">`
    const r = aplicarRaio(h, 8, 16, todo(h))
    expect(r.html).toBe(h)
  })

  it("o arcsize nunca passa de 50% — acima disso o VML degenera", () => {
    const h = `<v:roundrect style="height:20px;" arcsize="10%">`
    const r = aplicarRaio(h, 8, 40, todo(h))
    expect(r.html).toContain('arcsize="50%"')
  })

  it("fora da janela nada é tocado", () => {
    const antes = `<a style="border-radius:10px">fora</a>`
    const dentro = `<a style="border-radius:10px">dentro</a>`
    const h = antes + dentro
    const r = aplicarRaio(h, 10, 4, { start: antes.length, end: h.length })
    expect(r.html.slice(0, antes.length)).toBe(antes)
    expect(r.html).toContain("border-radius:4px")
    expect(r.trocados).toBe(1)
  })

  it("janela degenerada devolve o documento intacto", () => {
    const h = `<a style="border-radius:10px">x</a>`
    expect(aplicarRaio(h, 10, 4, { start: 5, end: 5 })).toEqual({ html: h, trocados: 0 })
  })
})

describe("aplicarRaio — o arcsize do vizinho", () => {
  it("botão SEM VML não toca em roundrect nenhum na janela", () => {
    // Medido na peça de 17/09: arcsize de 13%, 16% e 50% convivem. A janela
    // de 600 chars alcança o botão anterior; recalcular ali viraria a pílula
    // do vizinho num canto reto, só no Outlook.
    const vizinho = `<v:roundrect style="height:60px;" arcsize="50%"></v:roundrect>`
    const h = `${vizinho}<a style="border-radius:10px">eu</a>`
    const r = aplicarRaio(h, 10, 8, { start: 0, end: h.length }, false)
    expect(r.html).toContain('arcsize="50%"')
    expect(r.html).toContain("border-radius:8px")
    expect(r.trocados).toBe(1)
  })

  it("botão COM VML acerta o próprio arcsize", () => {
    const h = `<v:roundrect style="height:60px;" arcsize="50%"></v:roundrect><a style="border-radius:10px">eu</a>`
    const r = aplicarRaio(h, 10, 8, { start: 0, end: h.length }, true)
    expect(r.html).toContain('arcsize="13%"')
  })
})
