import { describe, expect, it } from "vitest"
import { FAMILIAS, aplicarCorPrimaria, aplicarFamilia, familiaDe, fundoPadraoDaFamilia, ritmoDeFundos, tracoDe } from "./familias"
import { adicionarFrame, novoDocumento, trocarTemplate, trocarTipoFrame } from "./documento"
import { validarDocumento } from "@/lib/services/conteudo-documentos.service"
import { aceitaCampoOpcional, camposOpcionaisDoTipo } from "./campos"
import { getTemplate } from "./templates"
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

  it("sem alternância, o fundo vem do TIPO: capa, prova e CTA no gradiente", () => {
    for (const key of Object.keys(FAMILIAS) as FamiliaVisual[]) {
      if (FAMILIAS[key].traco.alternaFundo) continue
      expect(fundoPadraoDaFamilia(key, "capa", 0)).toBe("gradiente")
      expect(fundoPadraoDaFamilia(key, "prova", 4)).toBe("gradiente")
      expect(fundoPadraoDaFamilia(key, "cta", 6)).toBe("gradiente")
      expect(fundoPadraoDaFamilia(key, "texto", 1)).toBe(FAMILIAS[key].fundoClaro)
      expect(fundoPadraoDaFamilia(key, "texto", 3)).toBe(FAMILIAS[key].fundoEscuro)
    }
  })

  it("na Alternado o fundo vem da POSIÇÃO — é o ritmo do formato", () => {
    const f = FAMILIAS.alternado
    expect(fundoPadraoDaFamilia("alternado", "capa", 0, 9)).toBe("gradiente")
    expect(fundoPadraoDaFamilia("alternado", "texto", 1, 9)).toBe(f.fundoEscuro)
    expect(fundoPadraoDaFamilia("alternado", "texto", 2, 9)).toBe(f.fundoClaro)
    expect(fundoPadraoDaFamilia("alternado", "prova", 3, 9)).toBe(f.fundoEscuro)
    // O CTA fecha no claro: é onde a caixa da palavra tem contraste.
    expect(fundoPadraoDaFamilia("alternado", "cta", 8, 9)).toBe(f.fundoClaro)
    // O slide ANTES do CTA respira no gradiente…
    expect(fundoPadraoDaFamilia("alternado", "texto", 7, 9)).toBe("gradiente")
    // …e sem saber o total, some em vez de cair no slide errado.
    expect(fundoPadraoDaFamilia("alternado", "texto", 7)).toBe(f.fundoEscuro)
  })

  it("o ritmo se refaz ao inserir no meio, e o pintado à mão fica", () => {
    const alt = aplicarFamilia(doc(), "alternado")
    const idSegundo = alt.frames[1].frameId
    const escolhido = "#123456"
    const comMao = { ...alt, fundoPorFrame: { ...alt.fundoPorFrame, [idSegundo]: escolhido } }

    const maior = adicionarFrame(comMao, "texto")
    // O slide pintado à mão continua com a cor do usuário…
    expect(maior.fundoPorFrame[idSegundo]).toBe(escolhido)
    // …e o resto volta a alternar pela POSIÇÃO, sem dois escuros colados.
    const fundos = maior.frames.map((f, i) => [i, maior.fundoPorFrame[f.frameId]] as const)
    for (const [i, v] of fundos) {
      if (v === escolhido) continue
      expect(v).toBe(fundoPadraoDaFamilia("alternado", maior.frames[i].tipo, i, maior.frames.length))
    }
  })

  it("nas famílias sem alternância o ritmo não mexe em nada", () => {
    const base = doc()
    expect(ritmoDeFundos(base)).toBe(base)
  })

  it("a cor da marca re-deriva a paleta da Alternado e preserva o pintado à mão", () => {
    const alt = aplicarFamilia(doc(), "alternado")
    const comMao = { ...alt, cores: { ...alt.cores, hook: "#123456" } }
    const laranja = aplicarCorPrimaria(comMao, "#E2650F")

    expect(laranja.corPrimaria).toBe("#E2650F")
    expect(laranja.cores.destaque).toBe("#E2650F")
    // O off-white acompanha a temperatura da cor nova.
    expect(laranja.fundoPorFrame).not.toEqual(comMao.fundoPorFrame)
    // O que o usuário pintou fica.
    expect(laranja.cores.hook).toBe("#123456")

    // Trocar de novo parte da cor GRAVADA, não da cor da casa: sem isso a
    // segunda troca confundiria o derivado com o escolhido.
    const verde = aplicarCorPrimaria(laranja, "#0F9D58")
    expect(verde.cores.destaque).toBe("#0F9D58")
    expect(verde.cores.hook).toBe("#123456")
    expect(verde.corPrimaria).toBe("#0F9D58")
  })

  it("trocar para a Alternado recalcula os fundos padrão e preserva os escolhidos", () => {
    const base = doc()
    const escolhido = "#123456"
    const d: Documento = {
      ...base,
      frames: [
        { ...base.frames[0], frameId: "f1", tipo: "capa" },
        { ...base.frames[0], frameId: "f2", tipo: "texto" },
        { ...base.frames[0], frameId: "f3", tipo: "texto" },
        { ...base.frames[0], frameId: "f4", tipo: "cta" },
      ],
      fundoPorFrame: {
        f1: "gradiente",
        f2: FAMILIAS.padrao.fundoClaro,
        f3: escolhido,
        f4: "gradiente",
      },
    }
    const alt = aplicarFamilia(d, "alternado")
    expect(alt.fundoPorFrame.f1).toBe("gradiente")
    expect(alt.fundoPorFrame.f2).toBe(FAMILIAS.alternado.fundoEscuro)
    expect(alt.fundoPorFrame.f3).toBe(escolhido)
    expect(alt.fundoPorFrame.f4).toBe(FAMILIAS.alternado.fundoClaro)
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

describe("campos opcionais do slide", () => {
  const comOpcionais = (tipo: DocFrame["tipo"]): DocFrame => ({
    frameId: "f1",
    tipo,
    label: "Slide",
    slotsImagem: 0,
    campos: ["titulo", "corpo", "gancho", "anotacao"],
    textos: { titulo: "T", corpo: "C", gancho: "o que ninguém olha", anotacao: "é aqui que trava" },
    imagens: {},
  })

  it("só oferece o campo onde o renderer o desenha", () => {
    expect(camposOpcionaisDoTipo("texto")).toEqual(["gancho", "anotacao"])
    expect(camposOpcionaisDoTipo("capa")).toEqual(["gancho"])
    expect(camposOpcionaisDoTipo("prova")).toEqual(["gancho"])
    expect(camposOpcionaisDoTipo("cta")).toEqual([])
    expect(aceitaCampoOpcional("capa", "anotacao")).toBe(false)
  })

  it("trocar o TIPO do slide não apaga o que o operador escreveu", () => {
    const base = doc()
    const d: Documento = { ...base, frames: base.frames.map((f, i) => (i === 2 ? comOpcionais(f.tipo) : f)) }
    const trocado = trocarTipoFrame(d, 2, "lista")
    expect(trocado.frames[2].campos).toContain("gancho")
    expect(trocado.frames[2].textos.gancho).toBe("o que ninguém olha")
    expect(trocado.frames[2].textos.anotacao).toBe("é aqui que trava")
  })

  it("o campo que o tipo NOVO não desenha fica para trás em vez de virar fantasma", () => {
    const base = doc()
    const d: Documento = { ...base, frames: base.frames.map((f, i) => (i === 2 ? comOpcionais(f.tipo) : f)) }
    const trocado = trocarTipoFrame(d, 2, "prova")
    expect(trocado.frames[2].campos).toContain("gancho")
    expect(trocado.frames[2].campos).not.toContain("anotacao")
  })

  it("trocar o TEMPLATE carrega gancho e anotação junto com o texto", () => {
    const base = doc()
    const alvo = base.frames.findIndex((f) => f.tipo === "texto")
    const d: Documento = { ...base, frames: base.frames.map((f, i) => (i === alvo ? comOpcionais("texto") : f)) }
    const { doc: novo } = trocarTemplate(d, getTemplate("molde-benchmark"))
    const texto = novo.frames.find((f) => f.tipo === "texto")!
    expect(texto.campos).toContain("gancho")
    expect(texto.textos.gancho).toBe("o que ninguém olha")
  })
})

describe("frame novo herda a identidade do documento", () => {
  it("slide adicionado num carrossel Editorial nasce bege, não azul", () => {
    const d = aplicarFamilia(doc(), "editorial")
    const comNovo = adicionarFrame(d)
    const id = comNovo.frames[comNovo.frames.length - 2].frameId
    expect(comNovo.fundoPorFrame[id]).toBe(FAMILIAS.editorial.fundoClaro)
    const padrao = adicionarFrame(doc())
    expect(padrao.fundoPorFrame[padrao.frames.at(-2)!.frameId]).toBe(FAMILIAS.padrao.fundoClaro)
  })

  it("o documento inteiro sobrevive à validação da rota de salvamento", () => {
    const base = aplicarFamilia(doc(), "editorial")
    const comCampos: Documento = {
      ...base,
      frames: base.frames.map((f, i) => (i === 2 ? { ...f, campos: [...f.campos, "gancho" as const], textos: { ...f.textos, gancho: "o que ninguém olha" } } : f)),
    }
    const salvo = validarDocumento(JSON.parse(JSON.stringify(comCampos)))
    expect(salvo.familia).toBe("editorial")
    expect(salvo.frames[2].textos.gancho).toBe("o que ninguém olha")
    expect(salvo.cores.hook).toBe(FAMILIAS.editorial.cores.hook)
  })
})
