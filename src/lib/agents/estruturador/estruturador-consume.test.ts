import { describe, it, expect } from "vitest"
import {
  aplicarEstruturadorNoBlueprint,
  estruturaParaPosicoes,
} from "./estruturador-consume"
import { clampStructure } from "../architect/outline-sections"
import type { EstruturadorOutput } from "./estruturador-prompt"

function output(): EstruturadorOutput {
  return {
    diagnostico: {
      objecao_dominante: "Eficácia",
      traducao_do_mecanismo: "Inspeção → demonstração",
    },
    estrutura: [
      { section: "hero", papel: "Entregar o cupom em 3s", referencia: "r", porque: "x" },
      {
        section: "body",
        papel: "O pivô que troca desconto por razão",
        referencia: "r",
        adaptacao: "troca a categoria pela rotina noturna",
        porque: "x",
      },
      { section: "footer", papel: "Rota de saída", referencia: "r", porque: "x" },
    ],
    fio_narrativo: "cupom → razão → saída",
    fontes: [],
    aprendizados_aplicados: [],
    text_only: false,
    descartes: [],
  }
}

describe("estruturaParaPosicoes", () => {
  it("mapeia section + label (papel) + papel completo com adaptação", () => {
    const pos = estruturaParaPosicoes(output())
    expect(pos.map((p) => p.section)).toEqual(["hero", "body", "footer"])
    expect(pos[0].label).toBe("Entregar o cupom em 3s")
    expect(pos[0].papel).toBe("Entregar o cupom em 3s")
    // Adaptação entra no papel completo, não no rótulo.
    expect(pos[1].papel).toContain("Adaptação: troca a categoria")
    expect(pos[1].label).not.toContain("Adaptação")
  })

  it("trunca o rótulo longo mas preserva o papel completo", () => {
    const o = output()
    o.estrutura[0].papel = "a".repeat(200)
    const pos = estruturaParaPosicoes(o)
    expect(pos[0].label.length).toBeLessThanOrEqual(90)
    expect(pos[0].label.endsWith("…")).toBe(true)
    expect(pos[0].papel).toHaveLength(200)
  })

  it("papel vazio cai no nome da seção como rótulo", () => {
    const o = output()
    o.estrutura[0].papel = "  "
    const pos = estruturaParaPosicoes(o)
    expect(pos[0].label).toBe("hero")
  })

  it("posições ricas sobrevivem ao clampStructure (genérico) com footer preservado", () => {
    const o = output()
    o.estrutura.splice(2, 0,
      { section: "products", papel: "Grade", referencia: "r", porque: "x" },
      { section: "reviews", papel: "Prova", referencia: "r", porque: "x" },
    )
    const pos = estruturaParaPosicoes(o) // hero, body, products, reviews, footer
    const clamped = clampStructure(pos, 3)
    expect(clamped.map((p) => p.section)).toEqual(["hero", "body", "footer"])
    // O papel viaja junto — structure e papéis saem da MESMA lista clampada.
    expect(clamped[1].papel).toContain("pivô")
  })
})

describe("aplicarEstruturadorNoBlueprint", () => {
  const bp = (): {
    objective: string
    messaging: string
    fio_narrativo?: string | null
    blocks: Array<{ type: string; purpose: string }>
  } => ({
    objective: "obj",
    messaging: "msg",
    blocks: [
      { type: "hero", purpose: "Diretiva da variante hero" },
      { type: "text", purpose: "" },
      { type: "footer", purpose: "Rodapé legal" },
    ],
  })

  it("papel vira 1ª linha do purpose e a diretiva original vira Forma", () => {
    const r = aplicarEstruturadorNoBlueprint(bp(), ["Abrir o arco", "O pivô", "Saída"], "fio")
    expect(r.blocks[0].purpose).toBe(
      "Abrir o arco\n\nForma (variante): Diretiva da variante hero",
    )
    // Bloco sem purpose original: papel puro, sem sufixo vazio.
    expect(r.blocks[1].purpose).toBe("O pivô")
    expect(r.fio_narrativo).toBe("fio")
  })

  it("não muta o input e tolera comprimentos divergentes", () => {
    const original = bp()
    const r = aplicarEstruturadorNoBlueprint(original, ["Só o primeiro"], "fio")
    expect(original.blocks[0].purpose).toBe("Diretiva da variante hero")
    expect(r.blocks[0].purpose).toContain("Só o primeiro")
    // Posições sem papel mantêm o purpose original.
    expect(r.blocks[1].purpose).toBe("")
    expect(r.blocks[2].purpose).toBe("Rodapé legal")
  })

  it("fio vazio persiste como null", () => {
    const r = aplicarEstruturadorNoBlueprint(bp(), [], "   ")
    expect(r.fio_narrativo).toBeNull()
  })
})
