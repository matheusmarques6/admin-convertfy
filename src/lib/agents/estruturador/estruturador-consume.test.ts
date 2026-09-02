import { describe, it, expect } from "vitest"
import {
  aplicarEstruturadorNoBlueprint,
  DECISAO_MAX_CHARS,
  decisaoCompletaParaCurador,
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

describe("decisaoCompletaParaCurador", () => {
  it("é o output INTEIRO em JSON: diagnóstico, posições com adaptação/porquê, fio, fontes, aprendizados, descartes", () => {
    const o = output()
    o.fontes = [{ ref: "avelmore-inspecao-antecipada", o_que_pegou: "arco", porque: "mecanismo transfere" }]
    o.aprendizados_aplicados = [{ slug: "prova-antes-do-cta", como: "reviews antes da grade" }]
    o.descartes = [{ section: "cta", papel_na_referencia: "CTA isolado", porque: "competiria com a grade", origem: "modelo" }]
    const r = decisaoCompletaParaCurador(o)
    const volta = JSON.parse(r) as typeof o
    expect(volta).toEqual(o)
    // Legível para o modelo: JSON indentado, não uma linha só.
    expect(r).toContain("\n  \"estrutura\": [")
    expect(r).toContain("troca a categoria pela rotina noturna")
    expect(r).toContain("competiria com a grade")
  })

  it("clamp de segurança com marcador quando o output é patológico", () => {
    const o = output()
    o.estrutura[0].papel = "x".repeat(DECISAO_MAX_CHARS)
    const r = decisaoCompletaParaCurador(o)
    expect(r.length).toBeLessThan(DECISAO_MAX_CHARS + 200)
    expect(r).toContain("decisão truncada")
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

// ── Intenção humana (Arquitetura) × papel do agente (02/09) ─────────────
import { combinarIntencaoComPapel } from "./estruturador-consume"

describe("combinarIntencaoComPapel", () => {
  it("intenção vem PRIMEIRO; o papel do agente entra embaixo como detalhe", () => {
    expect(
      combinarIntencaoComPapel("Atacar a objeção 'funciona?'", "Provar o mecanismo com a tese técnica."),
    ).toBe("Atacar a objeção 'funciona?'\n\nPapel (Curador): Provar o mecanismo com a tese técnica.")
  })
  it("sem agente fica só a intenção; sem intenção fica só o papel; nada → null", () => {
    expect(combinarIntencaoComPapel("  só a intenção ", null)).toBe("só a intenção")
    expect(combinarIntencaoComPapel("", "papel do agente")).toBe("papel do agente")
    expect(combinarIntencaoComPapel(null, "   ")).toBeNull()
  })
})
