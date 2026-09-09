import { describe, expect, it } from "vitest"
import {
  auditVariantCoverage,
  resumirBiblioteca,
  type VarianteEntrada,
} from "./coverage-audit"

/** Variante mínima: uma frase por campo, sem colisão. */
const OK: VarianteEntrada = {
  id: "v-ok",
  name: "ok",
  block_type: "body",
  html: `<table><tr><td>Title Here</td></tr><tr><td>SHOP NOW</td></tr></table>`,
  schema: [
    { key: "section_title", example: "Title Here", type: "text_short" },
    { key: "cta_label", example: "SHOP NOW", type: "text_short" },
  ],
}

describe("auditVariantCoverage", () => {
  it("aprova a variante cujos campos todos ancoram", () => {
    const l = auditVariantCoverage(OK)
    expect(l.camposCopy).toBe(2)
    expect(l.ancorados).toBe(2)
    expect(l.camposComProblema).toEqual([])
    expect(l.orfaosSuspeitos).toBe(0)
    expect(l.ok).toBe(true)
  })

  it("acha o texto do HTML que nenhum campo endereça", () => {
    // O caso real de `body 3`: o selo está escrito no HTML e não existe
    // campo para ele. É o defeito que o auditor de TAGS (`auditSchemaTags`)
    // não vê, porque "ICON 1" não é uma tag.
    const l = auditVariantCoverage({
      ...OK,
      id: "v-orfao",
      html: `<table><tr><td>Title Here</td></tr><tr><td>ICON 1</td><td>ICON 2</td></tr><tr><td>SHOP NOW</td></tr></table>`,
    })
    expect(l.ancorados).toBe(2)
    expect(l.orfaos.map((o) => o.texto)).toEqual(["ICON 1", "ICON 2"])
  })

  it("órfão de selo passou a ser suspeito (EXEMPLO_RE ampliado em 09/09) — e a lista crua continua sendo o sinal", () => {
    // Até 09/09 `pareceExemplo("ICON 1")` era false: o
    // `texto_orfao_suspeito` da telemetria subestimava o problema (6 num
    // e-mail com 27 órfãos). Texto fixo legítimo segue fora — `ok` olha a
    // lista, não só o contador.
    const l = auditVariantCoverage({
      ...OK,
      id: "v-selo",
      html: `<table><tr><td>Title Here</td></tr><tr><td>ICON 1</td></tr><tr><td>Rua das Flores, 10</td></tr><tr><td>SHOP NOW</td></tr></table>`,
    })
    expect(l.orfaos.map((o) => [o.texto, o.suspeito])).toEqual([
      ["ICON 1", true],
      ["Rua das Flores, 10", false],
    ])
    expect(l.ok).toBe(false)
  })

  it("irmãos com example IDÊNTICO ancoram os dois, por ordem", () => {
    // A regra dos irmãos: um grupo com 2 membros e 2 ocorrências distribui
    // uma para cada. Example repetido, por si, não é defeito.
    const l = auditVariantCoverage({
      id: "v-identicos",
      name: "identicos",
      html: `<table><tr><td>Lorem ipsum dolor</td></tr><tr><td>Lorem ipsum dolor</td></tr></table>`,
      schema: [
        { key: "copy_1", example: "Lorem ipsum dolor", type: "text_long" },
        { key: "copy_2", example: "Lorem ipsum dolor", type: "text_long" },
      ],
    })
    expect(l.ancorados).toBe(2)
    expect(l.ok).toBe(true)
  })

  it("example de um irmão contido no do outro tira a vaga de um", () => {
    // O defeito real de `body 3` / `produtos 4` / `produtos 7`: a arte
    // numera os parágrafos ("1 Lorem…", "2 Lorem…") e um dos campos foi
    // cadastrado SEM o número. Aí não há grupo de idênticos: o example
    // curto acha as duas ocorrências, o específico já tomou a sua, e um
    // campo fica sem lugar — na peça, um parágrafo sai repetido e a copy
    // do outro não entra.
    const l = auditVariantCoverage({
      id: "v-prefixo",
      name: "prefixo",
      html: `<table><tr><td>1 Lorem ipsum dolor</td></tr><tr><td>2 Lorem ipsum dolor</td></tr></table>`,
      schema: [
        { key: "copy_1", example: "Lorem ipsum dolor", type: "text_long" },
        { key: "copy_2", example: "2 Lorem ipsum dolor", type: "text_long" },
      ],
    })
    expect(l.camposComProblema).toHaveLength(1)
    expect(l.camposComProblema[0].key).toBe("copy_1")
    expect(l.camposComProblema[0].motivo).toBe("range_ja_tomado")
  })

  it("não conta campo de imagem como copy", () => {
    const l = auditVariantCoverage({
      ...OK,
      id: "v-img",
      schema: [
        ...OK.schema,
        { key: "hero_image", example: "", type: "image" },
        { key: "selo", example: "", type: "image", nature: "imagem_gerada" },
      ],
    })
    expect(l.camposCopy).toBe(2)
  })

  it("variante sem schema não tem campo — e o Lorem fica exposto", () => {
    // As 5 variantes ativas sem `output_schema`: zero contrato, então o
    // texto do mockup não tem por onde ser substituído.
    const l = auditVariantCoverage({
      id: "v-sem-schema",
      name: "sem schema",
      html: `<table><tr><td>Lorem ipsum dolor sit amet</td></tr></table>`,
      schema: [],
    })
    expect(l.camposCopy).toBe(0)
    expect(l.orfaosSuspeitos).toBeGreaterThan(0)
    expect(l.ok).toBe(false)
  })

  it("html vazio ou schema inválido não derruba a auditoria", () => {
    const l = auditVariantCoverage({
      id: "v-vazio",
      name: "vazio",
      html: "",
      schema: null as unknown as VarianteEntrada["schema"],
    })
    expect(l.camposCopy).toBe(0)
    expect(l.orfaos).toEqual([])
  })
})

describe("resumirBiblioteca", () => {
  it("agrega e conta os motivos", () => {
    const r = resumirBiblioteca([
      auditVariantCoverage(OK),
      auditVariantCoverage({
        id: "v2",
        name: "v2",
        html: `<table><tr><td>1 Lorem ipsum dolor</td></tr><tr><td>2 Lorem ipsum dolor</td></tr></table>`,
        schema: [
          { key: "c1", example: "Lorem ipsum dolor", type: "text_long" },
          { key: "c2", example: "2 Lorem ipsum dolor", type: "text_long" },
        ],
      }),
    ])
    expect(r.variantes).toBe(2)
    expect(r.variantesOk).toBe(1)
    expect(r.camposCopy).toBe(4)
    expect(r.camposAncorados).toBe(3)
    expect(r.camposSemLugar).toBe(1)
    expect(r.porMotivo.range_ja_tomado).toBe(1)
  })
})
