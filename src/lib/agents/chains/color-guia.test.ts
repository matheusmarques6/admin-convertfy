import { describe, expect, it } from "vitest"

import { renderImageTemplate } from "../image/template-renderer"
import { buildSegmentedPrompt } from "../shared/prompt-provenance"
import { COLOR_FORMAT_VAR_ORIGINS } from "../html/format-context"
import {
  ALCADA,
  CTAS_BLOCO,
  DOUTRINA_DE_CTA,
  FAIXAS_E_RITMO,
  GUIA_DE_COR,
  OUTPUT_CONTRATO,
} from "./color-guia"
import {
  DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT,
  DEFAULT_COLOR_FORMAT_USER_TEMPLATE,
} from "./color-format.chain"

describe("o conhecimento chega ao agente", () => {
  it("o system carrega o guia INTEIRO, não um resumo", () => {
    // O guia é a especificação deste agente. Resumi-lo seria entregar o
    // resumo do resumo e esperar que o modelo reconstitua a regra.
    expect(DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT).toContain(GUIA_DE_COR)
    expect(DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT).toContain(DOUTRINA_DE_CTA)
    expect(DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT).toContain(ALCADA)
    expect(DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT).toContain(FAIXAS_E_RITMO)
    expect(DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT).toContain(CTAS_BLOCO)
    expect(DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT).toContain(OUTPUT_CONTRATO)
  })

  it("as sete regras de CTA do deck estão lá, e a precedência da casa também", () => {
    expect(DOUTRINA_DE_CTA).toMatch(/ACIMA DA DOBRA/)
    expect(DOUTRINA_DE_CTA).toMatch(/UM BOTÃO POR PRODUTO/)
    expect(DOUTRINA_DE_CTA).toMatch(/CTA GERAL/)
    // Onde o deck e a casa conflitam, a casa vence — sem isso declarado, o
    // modelo hesita justamente no ponto em que a casa já decidiu.
    expect(DOUTRINA_DE_CTA).toMatch(/todo bloco tem CTA/)
    expect(DOUTRINA_DE_CTA).toMatch(/ELA\s*\n?VENCE|ELA VENCE/)
  })

  it("as regras do guia que o agente EXECUTA aparecem nomeadas", () => {
    for (const regra of ["R2", "R3", "R5", "R6", "C1", "C3", "C4", "C5"]) {
      expect(GUIA_DE_COR).toContain(regra)
    }
  })

  it("a alçada separa o que ele faz do que ele só registra", () => {
    // 17/09: os títulos deixaram de ser "VOCÊ EXECUTA"/"VOCÊ NÃO EXECUTA".
    // A lista de proibições vinha primeiro no olho e era metade do bloco —
    // ler regra que não se pode cumprir é o que produzia a resposta
    // defensiva (68,2% das faixas decididas saíam como `manter`).
    expect(ALCADA).toMatch(/O QUE É SEU/)
    expect(ALCADA).toMatch(/TEM OUTRO DONO/)
    // As regras cujo dono é outro continuam NOMEADAS — servir a regra sem a
    // ferramenta é o modo de falha que o `momento` e o `exige` já custaram a
    // este repo, e apagá-las do texto seria o mesmo erro pelo outro lado.
    for (const fora of ["R1", "R4", "R7", "R8"]) {
      expect(ALCADA).toContain(fora)
    }
    expect(ALCADA).toMatch(/você não reprova nada/i)
    // O que o agente decide tem de aparecer como obrigação, não como opção.
    expect(ALCADA).toMatch(/ninguém decide no seu lugar/i)
    expect(ALCADA).toMatch(/lacuna não substitui decisão/i)
  })

  it("o freio explícito saiu do bloco de faixas", () => {
    // A frase dizia, com estas palavras, que não mudar nada era "resposta
    // legítima e comum" — e era lida como recomendação. O TETO de 2 faixas
    // fica, porque é do código; o que saiu foi o convite a não usar nenhuma.
    expect(FAIXAS_E_RITMO).not.toMatch(/resposta\s+legítima/i)
    expect(FAIXAS_E_RITMO).toMatch(/até 2 faixas por peça/)
    expect(FAIXAS_E_RITMO).toMatch(/não é uma cota a economizar/)
    // Manter passa a se justificar como qualquer outra decisão.
    expect(FAIXAS_E_RITMO).toMatch(/Manter é uma decisão/)
  })

  it("a lista vazia de faixas tem instrução própria — bloco que some faz o modelo caçar", () => {
    expect(FAIXAS_E_RITMO).toMatch(/VAZIO/)
    expect(FAIXAS_E_RITMO).toMatch(/NÃO decide ritmo/)
  })

  it("o bloco de CTA proíbe escrever URL e mede a oferta contra o fato", () => {
    expect(CTAS_BLOCO).toMatch(/NÃO escreve URL/)
    expect(CTAS_BLOCO).toMatch(/A OFERTA É UM FATO/)
    expect(CTAS_BLOCO).toMatch(/produto_do_bloco/)
  })

  it("o contrato de saída é o plano, não a lista de ops de antes", () => {
    expect(OUTPUT_CONTRATO).toMatch(/"faixas"/)
    expect(OUTPUT_CONTRATO).toMatch(/"adicionar"/)
    expect(OUTPUT_CONTRATO).toMatch(/"lacunas"/)
    expect(DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT).not.toContain("<ops_vocabulary>")
  })
})

describe("as vars novas viajam com proveniência", () => {
  const vars: Record<string, string> = {
    brand_name: "Hero Boxers",
    niche: "moda",
    locale: "pt-BR",
    font_heading: "Inter",
    font_body: "Inter",
    brand_colors: "#111111",
    color_bg: "#FFFFFF",
    color_text: "#111111",
    color_heading: "#111111",
    color_button_bg: "#111111",
    color_button_text: "#FFFFFF",
    color_accent: "#D4AF37",
    color_surface: "#F4F4F4",
    color_surface_strong: "#E8E8E8",
    tones: "premium",
    email_name: "Welcome 1",
    subject: "Bem-vindo",
    pesquisa_full_text: "…",
    color_inventory_json: "[]",
    faixas_json: '[{"ordem":1,"bloco":0}]',
    ctas_json: '[{"id":"cta1"}]',
  }

  it("o template referencia faixas e ctas", () => {
    expect(DEFAULT_COLOR_FORMAT_USER_TEMPLATE).toContain("{{faixas_json}}")
    expect(DEFAULT_COLOR_FORMAT_USER_TEMPLATE).toContain("{{ctas_json}}")
  })

  it("as duas têm origem declarada — var sem origem aparece marcada na UI", () => {
    expect(COLOR_FORMAT_VAR_ORIGINS.faixas_json?.cls).toBe("sistema")
    expect(COLOR_FORMAT_VAR_ORIGINS.ctas_json?.cls).toBe("sistema")
  })

  it("a recomposição continua byte-igual — o guard da proveniência", () => {
    // Divergiu, a run grava sem marcação e ninguém percebe. É por isso que
    // este teste existe e não a inspeção visual do prompt.
    const render = renderImageTemplate(DEFAULT_COLOR_FORMAT_USER_TEMPLATE, vars)
    const seg = buildSegmentedPrompt(
      DEFAULT_COLOR_FORMAT_USER_TEMPLATE,
      vars,
      COLOR_FORMAT_VAR_ORIGINS,
      { parte: "user" },
    )
    expect(seg.prompt).toBe(render)
    expect(seg.segments).not.toBeNull()
  })
})
