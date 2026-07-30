import { describe, it, expect } from "vitest"

import {
  parseHeroFragment,
  parseHeroReport,
  decideHeroVision,
  buildHeroSystemPrompt,
  HERO_VISION_MODEL,
} from "./hero.chain"

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

// Story CM-8. O exemplo renderizado chegava como STRING da URL — sem
// multimodal e sem browsing, o espelho não existia para os 26 mockups da
// biblioteca. Agora ele vai ANEXADO, num modelo com visão.
describe("decideHeroVision", () => {
  const KIMI = "moonshotai/kimi-k3"
  const mockup = '<img src="https://cdn/hero.png" width="600">'

  it("mockup com imagem → anexa e troca de modelo", () => {
    const d = decideHeroVision(KIMI, { kind: "mockup", renderedHtml: mockup })
    expect(d.used).toBe(true)
    expect(d.model).toBe(HERO_VISION_MODEL)
    expect(d.reason).toBe("mockup_com_imagem")
    expect(d.images).toEqual(["https://cdn/hero.png"])
  })

  // Exemplo estrutural ensina acabamento pelo CSS; screenshot ensinaria
  // menos e custaria mais.
  it("exemplo estrutural segue como texto, no modelo configurado", () => {
    const d = decideHeroVision(KIMI, {
      kind: "structural",
      renderedHtml: "<table><tr><td>…</td></tr></table>",
    })
    expect(d.used).toBe(false)
    expect(d.model).toBe(KIMI)
    expect(d.reason).toBe("exemplo_estrutural")
  })

  it("mockup sem URL aproveitável não vira chamada de visão", () => {
    for (const html of [
      null,
      '<img src="data:image/png;base64,AAAA">',
      '<img src="/relativa.png">',
      "<div>só texto</div>",
    ]) {
      const d = decideHeroVision(KIMI, { kind: "mockup", renderedHtml: html })
      expect(d.used).toBe(false)
      expect(d.reason).toBe("sem_imagem")
      expect(d.model).toBe(KIMI)
    }
  })

  it("string vazia no settings desliga o fallback", () => {
    const d = decideHeroVision(KIMI, {
      kind: "mockup",
      renderedHtml: mockup,
      modelOverride: "",
    })
    expect(d.used).toBe(false)
    expect(d.reason).toBe("desligado")
    expect(d.model).toBe(KIMI)
  })

  it("override no settings vence o default in-code", () => {
    const d = decideHeroVision(KIMI, {
      kind: "mockup",
      renderedHtml: mockup,
      modelOverride: "openai/gpt-5.3-chat",
    })
    expect(d.model).toBe("openai/gpt-5.3-chat")
    expect(d.used).toBe(true)
  })

  it("NULL no settings usa o default in-code", () => {
    const d = decideHeroVision(KIMI, {
      kind: "mockup",
      renderedHtml: mockup,
      modelOverride: null,
    })
    expect(d.model).toBe(HERO_VISION_MODEL)
  })

  it("exemplo ausente não dispara nada", () => {
    const d = decideHeroVision(KIMI, { kind: "empty", renderedHtml: null })
    expect(d.used).toBe(false)
    expect(d.reason).toBe("exemplo_estrutural")
  })
})

describe("buildHeroSystemPrompt — nota da imagem anexada", () => {
  it("sem anexo, o prompt é o de sempre", () => {
    const p = buildHeroSystemPrompt("", "CONTRATO")
    expect(p).not.toContain("<attached_example>")
    expect(p).toContain("CONTRATO")
  })

  // Sem a imagem, essa instrução mandaria o agente procurar algo que não
  // está no prompt.
  it("com anexo, entra a instrução de olhar a imagem", () => {
    const p = buildHeroSystemPrompt("", "CONTRATO", true)
    expect(p).toContain("<attached_example>")
    expect(p).toContain("THE REGION WINS")
  })
})
