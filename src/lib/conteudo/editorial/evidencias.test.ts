import { describe, expect, it } from "vitest"
import { blocoDeFontes, consultaDaPauta, verificarFontes } from "./evidencias"

const fontes = [
  { titulo: "Smile.io — Loyalty report 2024", url: "https://smile.io/blog/loyalty-report", trecho: "8% dos clientes…" },
  { titulo: "Shopify — Retention", url: "https://www.shopify.com/br/blog/retencao" },
]

describe("triagem com fato da internet", () => {
  it("a consulta sai da pauta, sem palavra vazia nem URL colada", () => {
    expect(consultaDaPauta("O que ninguém olha no relatório: os 8% que pagam a conta https://x.com/a")).toBe(
      "ninguem olha relatorio 8% pagam conta",
    )
    expect(consultaDaPauta("   ")).toBe("")
  })

  it("pauta longa é cortada — consulta comprida devolve ruído", () => {
    const q = consultaDaPauta("palavra ".repeat(30))
    expect(q.split(" ")).toHaveLength(12)
  })

  it("o bloco numera as fontes e proíbe URL fora da lista, nas duas pontas", () => {
    const b = blocoDeFontes(fontes)
    expect(b).toContain("[1]")
    expect(b).toContain("https://smile.io/blog/loyalty-report")
    expect(b).toContain("Só cite como \"fonte\" uma das URLs acima")
    expect(b).toContain("Não invente URL")
  })

  it("sem fonte utilizável não existe bloco — servir cabeçalho vazio convida a inventar", () => {
    expect(blocoDeFontes([])).toBe("")
    expect(blocoDeFontes([{ titulo: "  ", url: "  " }])).toBe("")
  })

  it("fonte fora do que foi servido é DESCARTADA, e o dado sobrevive sem ela", () => {
    const { evidencias, descartadas } = verificarFontes(
      [
        { rotulo: "A", texto: "8% fazem 41%", fonte: "https://smile.io/blog/loyalty-report" },
        { rotulo: "B", texto: "retenção cresce", fonte: "https://exemplo-inventado.com/estudo" },
      ],
      fontes,
    )
    expect(evidencias[0].fonte).toBe("https://smile.io/blog/loyalty-report")
    expect(evidencias[1].fonte).toBeUndefined()
    expect(evidencias[1].texto).toBe("retenção cresce")
    expect(descartadas).toEqual(["https://exemplo-inventado.com/estudo"])
  })

  it("a comparação tolera www, barra final e caixa — não é sobre digitação", () => {
    const { descartadas } = verificarFontes(
      [{ rotulo: "A", texto: "x", fonte: "https://Smile.io/blog/loyalty-report/" }],
      fontes,
    )
    expect(descartadas).toEqual([])
  })

  it("fonte que não é URL veio do insumo e continua valendo", () => {
    const { evidencias, descartadas } = verificarFontes(
      [{ rotulo: "A", texto: "8% fazem 41%", fonte: "Smile.io, 2024" }],
      fontes,
    )
    expect(evidencias[0].fonte).toBe("Smile.io, 2024")
    expect(descartadas).toEqual([])
  })

  it("sem nada servido, toda URL citada é invenção", () => {
    const { evidencias, descartadas } = verificarFontes([{ rotulo: "A", texto: "x", fonte: "https://a.com/b" }], [])
    expect(evidencias[0].fonte).toBeUndefined()
    expect(descartadas).toHaveLength(1)
  })
})
