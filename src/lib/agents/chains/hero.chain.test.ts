import { describe, it, expect } from "vitest"

import { renderImageTemplate } from "../image/template-renderer"
import {
  parseHeroFragment,
  parseHeroReport,
  decideHeroVision,
  buildHeroSystemPrompt,
  HERO_VISION_MODEL,
  DEFAULT_HERO_SYSTEM_PROMPT,
  DEFAULT_HERO_USER_TEMPLATE,
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

// O design system é o BRIEFING do agente, não uma nota de rodapé: é a
// autoridade sobre a intenção de desenho da variante. Se ele descer para o
// fim do prompt, ou passar a ser opcional na leitura, o agente volta a
// adivinhar o que é banda intencional e o que é sobra.
describe("design system é o input principal da hero", () => {
  it("a seção abre o system prompt, logo depois do papel", () => {
    const p = DEFAULT_HERO_SYSTEM_PROMPT
    expect(p).toContain("<design_system>")
    expect(p).toContain("THIS IS THE SPECIFICATION OF THE HERO")
    // Antes das regras de origem da região e das regras estruturais.
    expect(p.indexOf("<design_system>")).toBeLessThan(
      p.indexOf("<hero_source_modes>"),
    )
    expect(p.indexOf("<design_system>")).toBeLessThan(
      p.indexOf("<structural_rules>"),
    )
  })

  it("o briefing chega ANTES do restante do contexto na mensagem", () => {
    const t = DEFAULT_HERO_USER_TEMPLATE
    expect(t.indexOf("{{hero_variant_design_system}}")).toBeGreaterThanOrEqual(0)
    expect(t.indexOf("{{hero_variant_design_system}}")).toBeLessThan(
      t.indexOf("{{hero_region_html}}"),
    )
    expect(t.indexOf("{{hero_variant_design_system}}")).toBeLessThan(
      t.indexOf("{{hero_content_json}}"),
    )
  })

  // O design system é a ESPECIFICAÇÃO: manda inclusive na estrutura, e a
  // região é só o material. Sem isso ele vira decoração — foi o que
  // aconteceu na Luxe Lift, com o briefing descrevendo um layout e o
  // prompt proibindo o agente de chegar nele.
  it("a especificação vence a região, inclusive em estrutura", () => {
    const p = DEFAULT_HERO_SYSTEM_PROMPT
    expect(p).toContain("THE SPECIFICATION WINS — including on structure")
    expect(p).toContain("The region carries no authority of its own")
    expect(p).toContain("STARTING POINT")
  })

  // O que nem a especificação autoriza: são invariantes do pipeline, e
  // afrouxá-los faz o agente inventar copy para preencher o layout novo.
  it("declara o que a especificação NÃO autoriza", () => {
    const p = DEFAULT_HERO_SYSTEM_PROMPT
    expect(p).toContain("What you may NOT do, even to satisfy the spec")
    expect(p).toContain("invent copy")
    expect(p).toContain("verbatim")
  })

  // Sem briefing escrito, nada muda: a região volta a ser intocável.
  it("sem design system, a região é estruturalmente final", () => {
    const p = DEFAULT_HERO_SYSTEM_PROMPT
    expect(p).toContain(
      "THEN, and only then, the region is structurally final",
    )
    expect(p).toContain("WITHOUT one, the region is structurally final")
  })

  it("diz o que fazer quando não há briefing escrito", () => {
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain(
      "Empty <design_system> means nothing was written for this variant",
    )
  })
})

// Bloco vazio num prompt é convite para o modelo preencher sozinho: o
// agente leria "<design_system></design_system>" e inventaria uma. Variante
// sem briefing escrito não pode abrir a seção.
describe("a seção do design system só existe quando há texto", () => {
  const vars = (designSystem: string) => ({
    brand_name: "Loja",
    locale: "pt-BR",
    color_bg: "",
    color_text: "",
    color_heading: "",
    color_button_bg: "",
    color_button_text: "",
    color_accent: "",
    font_heading: "",
    font_heading_weight: "",
    font_body: "",
    font_body_weight: "",
    logo_light: "",
    logo_dark: "",
    email_name: "E1",
    subject: "S",
    hero_source: "library",
    hero_variant_html: "",
    hero_variant_rendered_html: "",
    hero_variant_schema_json: "",
    hero_variant_design_system: designSystem,
    hero_content_json: "[]",
    hero_image_url: "",
    hero_image_alt: "",
    montador_html: "",
    hero_region_html: "<tr><td>x</td></tr>",
    output_contract: "CONTRATO",
  })

  it("com briefing escrito, a seção abre a mensagem", () => {
    const out = renderImageTemplate(
      DEFAULT_HERO_USER_TEMPLATE,
      vars("A banda escura do topo é intencional."),
    )
    expect(out.trimStart().startsWith("<design_system>")).toBe(true)
    expect(out).toContain("A banda escura do topo é intencional.")
  })

  it("sem briefing, a seção não aparece — nem vazia", () => {
    const out = renderImageTemplate(DEFAULT_HERO_USER_TEMPLATE, vars(""))
    expect(out).not.toContain("<design_system>")
    expect(out.trimStart().startsWith("<store>")).toBe(true)
  })
})

// O relatório emitido SEM as tags: o modelo escreve só o objeto e nada no
// caminho o reconhece. Um email entregue saiu com `…"],"logo":"light"}`
// impresso no rodapé.
describe("relatório solto, sem as tags", () => {
  const frag = "<table><tr><td>hero</td></tr></table>"
  const report = '{"imagem":"aplicada","linhas_removidas":["cta2"],"logo":"light"}'

  it("JSON depois do HTML é cortado", () => {
    expect(
      parseHeroFragment(`<CFY_HERO_OUTPUT>${frag}\n${report}</CFY_HERO_OUTPUT>`),
    ).toBe(frag)
  })

  it("JSON parcial (o modelo cortou no meio) também sai", () => {
    expect(
      parseHeroFragment(`<CFY_HERO_OUTPUT>${frag}\n{"logo":"light"</CFY_HERO_OUTPUT>`),
    ).toBe(frag)
  })

  // Não pode comer conteúdo: chave sem as chaves do relatório fica.
  it("não corta um { legítimo no fim do HTML", () => {
    const comChave = '<table><tr><td>use o código {PROMO}</td></tr></table>'
    expect(
      parseHeroFragment(`<CFY_HERO_OUTPUT>${comChave}</CFY_HERO_OUTPUT>`),
    ).toBe(comChave)
  })

  it("não mexe em fragmento sem nada depois da última tag", () => {
    expect(parseHeroFragment(`<CFY_HERO_OUTPUT>${frag}</CFY_HERO_OUTPUT>`)).toBe(
      frag,
    )
  })
})
