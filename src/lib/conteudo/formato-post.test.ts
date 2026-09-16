import { describe, expect, it } from "vitest"
import {
  FATOR_DO_PRINT,
  POST_GANCHO,
  POST_GRANDE,
  POST_PADRAO,
  camposPost,
  doPrint,
  limitePost,
  medidasPost,
  posePost,
} from "./formato-post"
import { FAMILIAS, aplicarFamilia, fundoPadraoDaFamilia } from "./familias"
import { novoDocumento } from "./documento"
import { fitFactor, limiteDe } from "./limites"
import type { Documento } from "./types"

describe("conversão do print", () => {
  it("leva a medida da referência para a base do canvas", () => {
    expect(FATOR_DO_PRINT).toBeCloseTo(1080 / 1170, 6)
    expect(doPrint(1170)).toBe(1080)
    expect(doPrint(95)).toBe(88)
  })
})

describe("posePost", () => {
  it("slide com print abre no topo; só texto fica no centro", () => {
    expect(posePost(true, undefined)).toBe("topo")
    expect(posePost(false, undefined)).toBe("centro")
  })

  it("a variante manda quando declarada", () => {
    expect(posePost(false, "b")).toBe("topo")
    expect(posePost(true, "c")).toBe("centro")
  })
})

describe("medidasPost", () => {
  it("o slide do print tem o cabeçalho maior", () => {
    expect(medidasPost("topo").avatar).toBe(POST_GRANDE.avatar)
    expect(medidasPost("centro").avatar).toBe(POST_PADRAO.avatar)
    expect(POST_GRANDE.avatar).toBeGreaterThan(POST_PADRAO.avatar)
  })

  it("o gancho (capa) tem a frase maior e mais respiro — é o slide que para o dedo", () => {
    expect(medidasPost("centro", "capa")).toBe(POST_GANCHO)
    expect(POST_GANCHO.texto).toBeGreaterThan(POST_PADRAO.texto)
    expect(POST_GANCHO.gapCabecalho).toBeGreaterThan(POST_PADRAO.gapCabecalho)
  })

  it("o tipo vence a pose: a capa com print continua sendo o gancho", () => {
    expect(medidasPost("topo", "capa")).toBe(POST_GANCHO)
  })

  it("a imagem tem margem lateral própria, maior que a do texto", () => {
    expect(POST_GRANDE.margemImagem).toBeGreaterThan(POST_GRANDE.margem)
  })
})

describe("limites do formato", () => {
  it("o texto da referência NÃO encolhe — 232 caracteres cabem inteiros", () => {
    const daReferencia =
      "The biggest option on the page will be the one that most people end up picking... Make sure that's your subscription. When the one-time option is small and buried, subscription becomes the obvious choice without changing anything about the products or pricing."
    expect(fitFactor(daReferencia.length, limiteDe("texto", "corpo", true))).toBe(1)
    // Com o limite do TIPO o mesmo texto encolheria, e a peça deixaria de
    // ser idêntica sem nada avisar.
    expect(fitFactor(daReferencia.length, limiteDe("texto", "corpo", false))).toBeLessThan(1)
  })

  it("campo sem limite declarado devolve null", () => {
    expect(limitePost("botao")).toBe(26)
    expect(limiteDe("dado", "titulo", true)).toBe(120)
  })
})

describe("camposPost", () => {
  it("o cartão desenha título e corpo; só o CTA tem botão", () => {
    expect(camposPost("texto")).toEqual(["titulo", "corpo"])
    expect(camposPost("capa")).toEqual(["titulo", "corpo"])
    expect(camposPost("cta")).toContain("botao")
  })
})

describe("família Post", () => {
  it("é o cartão de perfil e não tem contador nem filete", () => {
    const t = FAMILIAS.post.traco
    expect(t.cartaoPerfil).toBe(true)
    expect(t.barraProgresso).toBe(false)
    expect(t.barraTopo).toBe(false)
    expect(t.alternaFundo).toBe(false)
  })

  it("todo slide tem o MESMO preto — nada de gradiente na capa", () => {
    const tipos = ["capa", "texto", "prova", "cta"] as const
    for (const [i, tipo] of tipos.entries()) {
      expect(fundoPadraoDaFamilia("post", tipo, i, tipos.length)).toBe(FAMILIAS.post.fundoClaro)
    }
  })

  it("trocar para Post apaga o gradiente que a capa herdou da família anterior", () => {
    const base: Documento = novoDocumento("x", "", "molde-post")
    expect(base.fundoPorFrame[base.frames[0].frameId]).toBe("gradiente")
    const post = aplicarFamilia(base, "post")
    for (const f of post.frames) expect(post.fundoPorFrame[f.frameId]).toBe(FAMILIAS.post.fundoClaro)
  })

  it("ida e volta devolve o documento à família de origem", () => {
    const base: Documento = novoDocumento("x", "", "molde-turbo")
    const volta = aplicarFamilia(aplicarFamilia(base, "post"), "padrao")
    expect(volta.fundoPorFrame).toEqual(base.fundoPorFrame)
    expect(volta.cores).toEqual(base.cores)
  })
})
