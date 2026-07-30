import { describe, it, expect } from "vitest"

import { parseHeroFragment, parseHeroReport } from "./hero.chain"

// O relatório é RECIBO, não conteúdo. Quando o modelo o emite dentro do
// wrapper de output, o JSON entra no documento e o cliente de email o mostra
// como texto — um email entregue saiu com {"imagem":"aplicada",…} impresso
// no rodapé, porque <CFY_HERO_REPORT> é tag desconhecida (invisível) mas o
// texto de dentro renderiza.
describe("o relatório nunca vaza para o fragmento", () => {
  const frag = "<table><tr><td>hero</td></tr></table>"
  const report = '{"imagem":"aplicada","campos_vazios":["COUPON_CODE"]}'

  it("bloco completo dentro do output é removido", () => {
    const out = parseHeroFragment(
      `<CFY_HERO_OUTPUT>${frag}<CFY_HERO_REPORT>${report}</CFY_HERO_REPORT></CFY_HERO_OUTPUT>`,
    )
    expect(out).toBe(frag)
    expect(out).not.toContain("imagem")
  })

  it("abertura órfã leva junto tudo o que vem depois", () => {
    const out = parseHeroFragment(
      `<CFY_HERO_OUTPUT>${frag}<CFY_HERO_REPORT>${report}</CFY_HERO_OUTPUT>`,
    )
    expect(out).toBe(frag)
  })

  it("tag de fechamento solta some", () => {
    const out = parseHeroFragment(
      `<CFY_HERO_OUTPUT>${frag}</CFY_HERO_REPORT></CFY_HERO_OUTPUT>`,
    )
    expect(out).toBe(frag)
  })

  it("o relatório continua sendo lido do output cru", () => {
    const raw = `<CFY_HERO_OUTPUT>${frag}</CFY_HERO_OUTPUT><CFY_HERO_REPORT>${report}</CFY_HERO_REPORT>`
    expect(parseHeroFragment(raw)).toBe(frag)
    expect(parseHeroReport(raw)?.imagem).toBe("aplicada")
  })

  it("fragmento sem relatório não é alterado", () => {
    expect(parseHeroFragment(`<CFY_HERO_OUTPUT>${frag}</CFY_HERO_OUTPUT>`)).toBe(
      frag,
    )
  })
})
