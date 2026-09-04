import { describe, it, expect } from "vitest"
import {
  parseTypographyDecision,
  TypographyOutputInvalidError,
  DEFAULT_TYPOGRAPHY_SYSTEM_PROMPT,
  DEFAULT_TYPOGRAPHY_USER_TEMPLATE,
} from "./typography.chain"

describe("parseTypographyDecision", () => {
  it("lê a decisão completa e resolve o substituto por classe", () => {
    const d = parseTypographyDecision(
      JSON.stringify({
        segunda_fonte: { familia: "Playfair Display", onde: "destaque", classe: "serif" },
        justificativa: "marca editorial",
        ops: [
          { item: 14, fonte: "secundaria", peso: 900, motivo: "maior título" },
          { item: 9, caixa: "alta", tracking: "0.06em", motivo: "CTA" },
        ],
      }),
    )
    expect(d.segunda_fonte).toMatchObject({
      familia: "Playfair Display",
      onde: "destaque",
      classe: "serif",
      fallback: "Georgia, 'Times New Roman', serif",
    })
    expect(d.ops).toHaveLength(2)
    expect(d.ops[0]).toMatchObject({ item: 14, fonte: "secundaria", peso: 900 })
    expect(d.ops[1]).toMatchObject({ item: 9, caixa: "alta", tracking: "0.06em" })
  })

  it("aceita a decisão de NÃO injetar", () => {
    const d = parseTypographyDecision(
      '{"segunda_fonte":null,"justificativa":"tom genérico","ops":[{"item":0,"peso":600,"motivo":"x"}]}',
    )
    expect(d.segunda_fonte).toBeNull()
    expect(d.justificativa).toBe("tom genérico")
    expect(d.ops[0].peso).toBe(600)
  })

  it("tolera cerca de markdown e texto ao redor", () => {
    const d = parseTypographyDecision(
      'Claro:\n```json\n{"segunda_fonte":null,"justificativa":"","ops":[]}\n```\n',
    )
    expect(d.ops).toEqual([])
  })

  it("descarta op sem item utilizável e classe de fonte inválida", () => {
    const d = parseTypographyDecision(
      JSON.stringify({
        segunda_fonte: { familia: "Comic", onde: "destaque", classe: "manuscrita" },
        ops: [{ item: "abc", peso: 700, motivo: "x" }, { item: 3, motivo: "y" }],
      }),
    )
    expect(d.segunda_fonte).toBeNull()
    expect(d.ops).toHaveLength(1)
    expect(d.ops[0].item).toBe(3)
  })

  it("resposta sem JSON é erro retryable", () => {
    expect(() => parseTypographyDecision("não consegui")).toThrow(TypographyOutputInvalidError)
    expect(() => parseTypographyDecision("{ isto não é json }")).toThrow(
      TypographyOutputInvalidError,
    )
  })
})

describe("prompts default", () => {
  it("o system carrega as regras que os guards também aplicam", () => {
    const p = DEFAULT_TYPOGRAPHY_SYSTEM_PROMPT
    expect(p).toContain("TRÊS OCORRÊNCIAS")
    expect(p).toContain("PISO DURO: nada de família abaixo de 16px")
    expect(p).toContain("MAIOR título")
    expect(p).toContain("nunca proponha um par de duas fontes da mesma classe")
    expect(p).toContain("O CTA fica FORA")
  })

  it("o user template pede o inventário e nunca o documento", () => {
    expect(DEFAULT_TYPOGRAPHY_USER_TEMPLATE).toContain("{{inventario}}")
    expect(DEFAULT_TYPOGRAPHY_USER_TEMPLATE).toContain("{{font_whitelist}}")
    expect(DEFAULT_TYPOGRAPHY_USER_TEMPLATE).not.toContain("{{html}}")
  })
})
