import { describe, expect, it } from "vitest"
import { FAMILIAS, aplicarFamilia, familiaDe, fundoPadraoDaFamilia, tracoDe } from "./familias"
import { novoDocumento } from "./documento"
import { partesDestacadas, temDestaque, textoLimpo } from "./rich"
import { camposExcedidos } from "./limites"
import { clarear } from "./brand"
import type { DocFrame, Documento, FamiliaVisual } from "./types"

const agora = new Date("2026-09-09T10:00:00-03:00")
const doc = (): Documento => novoDocumento("x", "canal-1", "molde-turbo", { agora })

describe("família visual", () => {
  it("documento sem família é o padrão, e toda família tem traço completo", () => {
    expect(familiaDe(doc())).toBe("padrao")
    expect(familiaDe({ familia: "editorial" })).toBe("editorial")
    expect(familiaDe({ familia: "inventada" as FamiliaVisual })).toBe("padrao")
    for (const key of Object.keys(FAMILIAS) as FamiliaVisual[]) {
      const t = tracoDe(key)
      expect(t.fonteTitulo).toBeTruthy()
      expect(t.fonteGancho).toBeTruthy()
      expect(t.fonteAnotacao).toBeTruthy()
      expect(t.raio).toBeGreaterThan(0)
      expect(FAMILIAS[key].cores.hook).toMatch(/^#[0-9A-F]{6}$/i)
      expect(FAMILIAS[key].cores.destaque).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it("a editorial troca a paleta, o gradiente, os fundos e o CTA", () => {
    const d = aplicarFamilia(doc(), "editorial")
    expect(d.familia).toBe("editorial")
    expect(d.cores.hook).toBe(FAMILIAS.editorial.cores.hook)
    expect(d.cores.destaque).toBe(FAMILIAS.editorial.cores.destaque)
    expect(d.gradiente.de).toBe(FAMILIAS.editorial.gradiente.de)
    expect(d.cta.fundo).toBe(FAMILIAS.editorial.cta.fundo)
    expect(Object.values(d.fundoPorFrame)).not.toContain(FAMILIAS.padrao.fundoClaro)
    expect(Object.values(d.fundoPorFrame)).toContain(FAMILIAS.editorial.fundoClaro)
  })

  it("o que o usuário mexeu à mão sobrevive à troca", () => {
    const base = doc()
    const id = base.frames[1].frameId
    const mexido: Documento = {
      ...base,
      cores: { ...base.cores, destaque: "#FF0000" },
      fundoPorFrame: { ...base.fundoPorFrame, [id]: "#123456" },
      cta: { ...base.cta, fundo: "#00FF00", cor: "#000000" },
      gradiente: { ...base.gradiente, de: "#ABCDEF" },
    }
    const d = aplicarFamilia(mexido, "editorial")
    expect(d.cores.destaque).toBe("#FF0000")
    expect(d.fundoPorFrame[id]).toBe("#123456")
    expect(d.cta.fundo).toBe("#00FF00")
    expect(d.gradiente.de).toBe("#ABCDEF")
    // o que NÃO foi mexido segue a família nova
    expect(d.cores.hook).toBe(FAMILIAS.editorial.cores.hook)
  })

  it("o ângulo do gradiente é do usuário e atravessa a troca", () => {
    const base = { ...doc(), gradiente: { ...FAMILIAS.padrao.gradiente, angulo: 45 } }
    expect(aplicarFamilia(base, "editorial").gradiente.angulo).toBe(45)
  })

  it("ida e volta devolve o documento à paleta original", () => {
    const base = doc()
    const volta = aplicarFamilia(aplicarFamilia(base, "editorial"), "padrao")
    expect(volta.cores).toEqual(base.cores)
    expect(volta.gradiente).toEqual(base.gradiente)
    expect(volta.fundoPorFrame).toEqual(base.fundoPorFrame)
    expect(volta.cta).toEqual(base.cta)
  })

  it("capa, prova e CTA usam o gradiente em qualquer família", () => {
    for (const key of Object.keys(FAMILIAS) as FamiliaVisual[]) {
      expect(fundoPadraoDaFamilia(key, "capa", 0)).toBe("gradiente")
      expect(fundoPadraoDaFamilia(key, "prova", 4)).toBe("gradiente")
      expect(fundoPadraoDaFamilia(key, "cta", 6)).toBe("gradiente")
      expect(fundoPadraoDaFamilia(key, "texto", 1)).toBe(FAMILIAS[key].fundoClaro)
      expect(fundoPadraoDaFamilia(key, "texto", 3)).toBe(FAMILIAS[key].fundoEscuro)
    }
  })
})

describe("destaque no texto", () => {
  it("separa os pedaços em ordem e preserva o texto ao redor", () => {
    expect(partesDestacadas("os **8%** que pagam a conta")).toEqual([
      { texto: "os ", destaque: false },
      { texto: "8%", destaque: true },
      { texto: " que pagam a conta", destaque: false },
    ])
    expect(partesDestacadas("**tudo em destaque**")).toEqual([{ texto: "tudo em destaque", destaque: true }])
    expect(partesDestacadas("sem marcação")).toEqual([{ texto: "sem marcação", destaque: false }])
  })

  it("asterisco solto e marcador vazio não viram destaque", () => {
    expect(temDestaque("2 * 3 = 6")).toBe(false)
    expect(temDestaque("****")).toBe(false)
    expect(partesDestacadas("2 * 3")).toEqual([{ texto: "2 * 3", destaque: false }])
  })

  it("o limite conta o texto sem os marcadores", () => {
    const texto = `**${"a".repeat(60)}**`
    expect(textoLimpo(texto)).toHaveLength(60)
    const frame: DocFrame = { frameId: "f", tipo: "texto", label: "l", slotsImagem: 0, campos: ["titulo"], textos: { titulo: texto }, imagens: {} }
    // 60 caracteres cabem no limite de 64 do título; com os `**` seriam 64+
    expect(camposExcedidos(frame)).toEqual([])
  })

  it("mais de um destaque na mesma frase", () => {
    const p = partesDestacadas("**A** vale mais que **B**")
    expect(p.filter((x) => x.destaque).map((x) => x.texto)).toEqual(["A", "B"])
  })
})

describe("cor legível no fundo escuro", () => {
  it("clarear mistura com branco, é idempotente nos extremos e ignora o que não é hex", () => {
    expect(clarear("#000000", 1)).toBe("#FFFFFF")
    expect(clarear("#8C5A2B", 0)).toBe("#8C5A2B")
    expect(clarear("#8C5A2B", 0.55)).toBe("#CBB5A0")
    expect(clarear("gradiente", 0.5)).toBe("gradiente")
    expect(clarear("#8C5A2B", 5)).toBe("#FFFFFF")
  })
})
