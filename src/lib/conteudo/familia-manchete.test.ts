import { describe, expect, it } from "vitest"
import { FAMILIAS, aplicarFamilia, fundoPadraoDaFamilia, ritmoDeFundos } from "./familias"
import { novoDocumento } from "./documento"
import { fatoresDaEscada, linhasDoTitulo, MANCHETE_CORES } from "./formato-manchete"
import { camposOpcionaisDaPeca } from "./campos"
import { limiteDe } from "./limites"
import { getTemplate } from "./templates"
import type { Documento, FamiliaVisual } from "./types"

const M = FAMILIAS.manchete

describe("identidade Manchete", () => {
  it("é peça CLARA com escuros por posição — não alternância nem cartão de perfil", () => {
    expect(M.traco.respiroEscuro).toBe(true)
    expect(M.traco.alternaFundo).toBe(false)
    expect(M.traco.cartaoPerfil).toBe(false)
    // Três cores, lidas da referência: preto puro, branco puro e o azul.
    expect(M.fundoEscuro).toBe(MANCHETE_CORES.preto)
    expect(M.fundoClaro).toBe(MANCHETE_CORES.claro)
    expect(M.cores.destaque).toBe(MANCHETE_CORES.azul)
  })

  it("a capa é escura e o segundo escuro é o slide do meio — o resto é claro", () => {
    const total = 5
    const fundos = Array.from({ length: total }, (_, i) => fundoPadraoDaFamilia("manchete", "texto", i, total))
    expect(fundos[0]).toBe(M.fundoEscuro)
    expect(fundos[Math.floor(total / 2)]).toBe(M.fundoEscuro)
    expect(fundos.filter((f) => f === M.fundoEscuro)).toHaveLength(2)
    // Nem a capa nem o CTA abrem exceção para gradiente: a peça é chapada.
    expect(fundoPadraoDaFamilia("manchete", "capa", 0, total)).toBe(M.fundoEscuro)
    expect(fundoPadraoDaFamilia("manchete", "cta", total - 1, total)).toBe(M.fundoClaro)
  })

  it("sem saber o total, só a CAPA é escura — o corte do meio não é adivinhado", () => {
    expect(fundoPadraoDaFamilia("manchete", "texto", 2)).toBe(M.fundoClaro)
    expect(fundoPadraoDaFamilia("manchete", "capa", 0)).toBe(M.fundoEscuro)
    // Peça curta: com 3 slides não há meio que renda o corte.
    expect(fundoPadraoDaFamilia("manchete", "texto", 1, 3)).toBe(M.fundoClaro)
  })

  it("inserir um slide no meio REFAZ o ritmo — o escuro acompanha", () => {
    const base = aplicarFamilia(novoDocumento("x", "", "molde-manchete"), "manchete")
    const doc = ritmoDeFundos(base)
    const escuros = (d: Documento) => d.frames.filter((f) => d.fundoPorFrame[f.frameId] === M.fundoEscuro).map((f) => f.frameId)
    expect(escuros(doc)).toHaveLength(2)
    const antes = escuros(doc)[1]

    // Dois slides inseridos logo depois da capa: o meio anda de f3 para
    // f4. Com UM só o meio cairia no mesmo frame por coincidência
    // aritmética, e o teste passaria sem medir nada.
    const extras = [1, 2].map((n) => ({ ...doc.frames[1], frameId: `novo${n}` }))
    const maior = ritmoDeFundos({
      ...doc,
      frames: [doc.frames[0], ...extras, ...doc.frames.slice(1)],
      fundoPorFrame: { ...doc.fundoPorFrame, novo1: M.fundoClaro, novo2: M.fundoClaro },
    })
    expect(escuros(maior)).toHaveLength(2)
    expect(escuros(maior)[1]).not.toBe(antes)
  })

  it("fundo pintado à mão sobrevive ao recálculo do ritmo", () => {
    const doc = ritmoDeFundos(aplicarFamilia(novoDocumento("x", "", "molde-manchete"), "manchete"))
    const alvo = doc.frames[1].frameId
    const pintado = ritmoDeFundos({ ...doc, fundoPorFrame: { ...doc.fundoPorFrame, [alvo]: "#7C3AED" } })
    expect(pintado.fundoPorFrame[alvo]).toBe("#7C3AED")
  })

  it("ida e volta devolve o documento à família de origem", () => {
    const base: Documento = novoDocumento("x", "", "molde-post")
    const volta = aplicarFamilia(aplicarFamilia(base, "manchete"), "padrao")
    expect(volta.fundoPorFrame).toEqual(base.fundoPorFrame)
    expect(volta.cores).toEqual(base.cores)
  })

  it("o fecho é caixa sólida e a marca é só o ícone no topo", () => {
    expect(M.traco.cta).toBe("bloco")
    expect(M.traco.logoNoTopo).toBe(true)
    expect(M.traco.assinaturaNoSlide).toBe(false)
    // Só a Manchete: nas outras o logo solto no topo seria enfeite.
    for (const [key, f] of Object.entries(FAMILIAS)) {
      if (key === "manchete") continue
      expect(f.traco.logoNoTopo, key).toBe(false)
      expect(f.traco.escadaNoTitulo, key).toBe(false)
      expect(f.traco.caixaDeDestaque, key).toBe(false)
      expect(f.traco.respiroEscuro, key).toBe(false)
    }
  })

  it("o molde da Manchete pressupõe a identidade e tem o problema no meio", () => {
    const t = getTemplate("molde-manchete")
    expect(t.familia).toBe("manchete")
    const meio = t.frames[Math.floor(t.frames.length / 2)]
    expect(meio.label).toBe("O problema")
  })
})

describe("a escada do título", () => {
  it("é decrescente e o último passo se repete — título longo não vira letra miúda", () => {
    expect(fatoresDaEscada(3)).toEqual([1, 0.66, 0.56])
    const seis = fatoresDaEscada(6)
    expect(seis[0]).toBe(1)
    expect(seis[5]).toBe(seis[4])
    for (let i = 1; i < seis.length; i++) expect(seis[i]).toBeLessThanOrEqual(seis[i - 1])
  })

  it("linha nenhuma devolve lista vazia", () => {
    expect(fatoresDaEscada(0)).toEqual([])
    expect(fatoresDaEscada(-2)).toEqual([])
  })

  it("a quebra é a do TEXTO — a automática não tem como receber outro corpo", () => {
    expect(linhasDoTitulo("DATAS SAZONAIS\nFORAM CRIADAS PARA\nVOCÊ VENDER MAIS")).toHaveLength(3)
    expect(linhasDoTitulo("uma linha só")).toEqual(["uma linha só"])
  })
})

describe("a caixa de destaque", () => {
  it("só é oferecida na identidade que a DESENHA — campo fantasma é o erro que isto fecha", () => {
    expect(camposOpcionaisDaPeca("texto", M.traco)).toContain("destaque")
    expect(camposOpcionaisDaPeca("texto", FAMILIAS.padrao.traco)).not.toContain("destaque")
  })

  it("não entra na capa nem no fecho: ali ela competiria com o próprio título", () => {
    expect(camposOpcionaisDaPeca("capa", M.traco)).not.toContain("destaque")
    expect(camposOpcionaisDaPeca("cta", M.traco)).not.toContain("destaque")
  })
})

describe("limites da Manchete", () => {
  it("o título passa folgado do limite da casa — ele é a massa da peça", () => {
    expect(limiteDe("capa", "titulo", "manchete")).toBeGreaterThan(limiteDe("capa", "titulo") ?? 0)
  })

  it("o corpo NÃO é afrouxado: o formato não tem parágrafo", () => {
    expect(limiteDe("texto", "corpo", "manchete")).toBe(limiteDe("texto", "corpo"))
  })

  it("a assinatura antiga (booleano) continua valendo", () => {
    expect(limiteDe("texto", "corpo", true)).toBe(limiteDe("texto", "corpo", "post"))
    expect(limiteDe("texto", "corpo", false)).toBe(limiteDe("texto", "corpo"))
  })

  it("família sem régua própria cai na do tipo", () => {
    for (const f of ["padrao", "editorial", "alternado"] as FamiliaVisual[]) {
      expect(limiteDe("texto", "titulo", f)).toBe(limiteDe("texto", "titulo"))
    }
  })
})
