import { describe, it, expect } from "vitest"

import {
  parseOps,
  applyOps,
  OpsParseError,
  looksLikeMarkup,
} from "./apply-patches"
import { HERO_SENTINEL_START, HERO_SENTINEL_END } from "./hero-locator"

describe("parseOps", () => {
  it("aceita o objeto com fences e tags com chaves", () => {
    const raw = '```json\n{"ops":[{"action":"img","tag":"{{BODY_IMAGE}}","url":"https://cdn/a.png","alt":"foto"}]}\n```'
    expect(parseOps(raw)).toEqual([
      { action: "img", tag: "BODY_IMAGE", url: "https://cdn/a.png", alt: "foto" },
    ])
  })

  it("lança OpsParseError em JSON inválido / sem ops / action desconhecida", () => {
    expect(() => parseOps("nada")).toThrow(OpsParseError)
    expect(() => parseOps('{"x":1}')).toThrow(OpsParseError)
    expect(() => parseOps('{"ops":[{"action":"zzz"}]}')).toThrow(OpsParseError)
    expect(() => parseOps('{"ops":[{"action":"img","tag":"A"}]}')).toThrow(
      OpsParseError,
    )
  })
})

const hero = `${HERO_SENTINEL_START}<table><tr><td><img src="https://cdn/hero.png">Hero {{HERO_BADGE}}</td></tr></table>${HERO_SENTINEL_END}`
const body = `<table><tr><td><img src="{{BODY_IMAGE}}" alt="{{BODY_IMAGE_ALT}}"></td></tr><tr><td>{{BODY_TEXT}}</td></tr></table>`
const doc = `<!DOCTYPE html><html><body>${hero}${body}<p style="color:#111111">CTA</p></body></html>`

describe("applyOps", () => {
  it("img: troca o token pela URL (e o _ALT quando vem alt)", () => {
    const res = applyOps(
      doc,
      [{ action: "img", tag: "BODY_IMAGE", url: "https://cdn/b.png", alt: "vitrine" }],
      { allowHero: false },
    )
    expect(res.applied).toBe(1)
    expect(res.html).toContain('src="https://cdn/b.png"')
    expect(res.html).toContain('alt="vitrine"')
    expect(res.html).not.toContain("{{BODY_IMAGE}}")
  })

  it("img: tag inexistente → skipped tag_not_found", () => {
    const res = applyOps(
      doc,
      [{ action: "img", tag: "PRODUCTS_IMAGE", url: "https://cdn/p.png" }],
      { allowHero: false },
    )
    expect(res.applied).toBe(0)
    expect(res.skipped[0].reason).toBe("tag_not_found")
  })

  it("remove_slot: remove a <tr> envolvente balanceada", () => {
    const res = applyOps(doc, [{ action: "remove_slot", tag: "BODY_IMAGE" }], {
      allowHero: false,
    })
    expect(res.applied).toBe(1)
    expect(res.html).not.toContain("{{BODY_IMAGE}}")
    expect(res.html).toContain("{{BODY_TEXT}}")
  })

  it("remove_slot: <tr> com OUTRO token de imagem → row_not_removable", () => {
    const shared = `<table><tr><td><img src="{{PRODUCT_1_IMAGE}}"><img src="{{PRODUCT_2_IMAGE}}"></td></tr></table>`
    const res = applyOps(
      `<html><body>${shared}</body></html>`,
      [{ action: "remove_slot", tag: "PRODUCT_1_IMAGE" }],
      { allowHero: false },
    )
    expect(res.applied).toBe(0)
    expect(res.skipped[0].reason).toBe("row_not_removable")
    expect(res.html).toContain("{{PRODUCT_2_IMAGE}}")
  })

  it("replace: find único aplica; ambíguo pula", () => {
    const ok = applyOps(
      doc,
      [{ action: "replace", find: 'style="color:#111111"', replace: 'style="color:#BB0000"' }],
      { allowHero: false },
    )
    expect(ok.applied).toBe(1)
    expect(ok.html).toContain("#BB0000")

    const ambiguous = applyOps(
      doc,
      [{ action: "replace", find: "<table>", replace: "<table X>" }],
      { allowHero: false },
    )
    expect(ambiguous.applied).toBe(0)
    expect(ambiguous.skipped[0].reason).toBe("find_ambiguous")
  })

  it("hero protegida: op dentro das sentinelas é rejeitada com allowHero=false", () => {
    const res = applyOps(
      doc,
      [{ action: "replace", find: "https://cdn/hero.png", replace: "https://cdn/x.png" }],
      { allowHero: false },
    )
    expect(res.applied).toBe(0)
    expect(res.skipped[0].reason).toBe("hero_protected")
  })

  it("allowHero=true (color_format) pode tocar a hero", () => {
    const res = applyOps(
      doc,
      [{ action: "replace", find: "https://cdn/hero.png", replace: "https://cdn/x.png" }],
      { allowHero: true },
    )
    expect(res.applied).toBe(1)
    expect(res.html).toContain("https://cdn/x.png")
  })

  // Fase 3 do endereçamento: TODA op é resolvida contra o SNAPSHOT — o
  // mesmo documento que o agente viu ao planejar. Encadeamento (op 2
  // mirando o resultado da op 1) deixou de ser suportado DE PROPÓSITO: era
  // o que fazia uma remoção invalidar o endereço das ops seguintes
  // (cascata de tag_not_found no incidente da Luxe Lift). O agente de
  // imagem já emite a URL final com crop params na própria op `img`.
  it("ops são resolvidas contra o snapshot (sem encadeamento)", () => {
    const res = applyOps(
      doc,
      [
        { action: "img", tag: "BODY_IMAGE", url: "https://cdn/b.png" },
        {
          action: "replace",
          find: 'src="https://cdn/b.png"',
          replace: 'src="https://cdn/b.png" width="600"',
        },
      ],
      { allowHero: false },
    )
    expect(res.applied).toBe(1)
    expect(res.html).toContain("https://cdn/b.png")
    // A 2ª op mirava um texto que só existiria DEPOIS da 1ª — no snapshot
    // ele não existe, então é recusada com razão explícita.
    expect(res.skipped[0].reason).toBe("find_not_found")
  })

  it("remoção NÃO invalida o endereço das ops seguintes (snapshot)", () => {
    const html = [
      "<table>",
      '  <tr id="a"><td>{{A}}</td></tr>',
      '  <tr id="b"><td>{{B}}</td></tr>',
      '  <tr id="c"><td>{{C}}</td></tr>',
      "</table>",
    ].join("\n")
    const res = applyOps(
      html,
      [
        { action: "remove_row", tag: "A" },
        { action: "set_text", tag: "B", value: "texto B" },
        { action: "remove_row", tag: "C" },
      ],
      { allowHero: true },
    )
    expect(res.applied).toBe(3)
    expect(res.skipped).toEqual([])
    expect(res.html).not.toContain('id="a"')
    expect(res.html).toContain("texto B")
    expect(res.html).not.toContain('id="c"')
  })

  it("ops sobrepostas: a região é preservada e a perdedora é telemetrizada", () => {
    const html = '<table><tr id="r"><td>{{X}}</td></tr></table>'
    const res = applyOps(
      html,
      [
        { action: "set_text", tag: "X", value: "valor" },
        { action: "remove_row", tag: "X" },
      ],
      { allowHero: true },
    )
    // Uma das duas vence; a outra vira overlapping_edit — nunca as duas.
    expect(res.applied).toBe(1)
    expect(res.skipped[0].reason).toBe("overlapping_edit")
  })
})

describe("set_text com MARCAÇÃO é recusado (incidente Luxe Lift, 10/08)", () => {
  // O set_text neutraliza `<>` por contrato. Aplicar uma tag HTML como
  // valor escreve a marcação ESCAPADA e VISÍVEL na tela — foi assim que o
  // logo do rodapé virou o literal `&lt;img src="..."&gt;` dentro de um
  // <span>. Trocar imagem é a op `img`; recusar é melhor que renderizar
  // lixo com cara de bug de template.
  const doc = '<tr><td data-cfy-slot="LOGO">{{LOGO}}</td></tr>'

  it("valor com tag <img> não é aplicado", () => {
    const r = applyOps(doc, [
      { action: "set_text", tag: "LOGO", value: '<img src="https://x/l.png" width="180" />' },
    ], { allowHero: true })
    expect(r.applied).toBe(0)
    expect(r.skipped).toEqual([
      expect.objectContaining({ reason: "value_is_html" }),
    ])
    expect(r.html).toBe(doc)
  })

  it("texto com sinal de menor CONTINUA passando", () => {
    // O guard tem de ser conservador: copy legítima usa "<" o tempo todo.
    const r = applyOps(doc, [
      { action: "set_text", tag: "LOGO", value: "frete < R$ 100 e 5 > 3" },
    ], { allowHero: true })
    expect(r.applied).toBe(1)
    expect(r.skipped).toEqual([])
  })
})

describe("looksLikeMarkup", () => {
  it("pega tag de verdade", () => {
    expect(looksLikeMarkup('<img src="x">')).toBe(true)
    expect(looksLikeMarkup("<a href='y'>link</a>")).toBe(true)
    expect(looksLikeMarkup("<br/>")).toBe(true)
  })
  it("não pega comparação nem texto solto", () => {
    expect(looksLikeMarkup("de < 100 para > 200")).toBe(false)
    expect(looksLikeMarkup("Bem-vinda!")).toBe(false)
    expect(looksLikeMarkup("5 < 10")).toBe(false)
  })
})
