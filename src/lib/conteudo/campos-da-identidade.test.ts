import { describe, expect, it } from "vitest"
import { camposDaIdentidade, reconciliarCampos } from "./campos-da-identidade"
import { aplicarFamilia } from "./familias"
import { novoDocumento, trocarTipoFrame } from "./documento"
import type { DocFrame, Documento } from "./types"

const frame = (o: Partial<DocFrame> = {}): DocFrame => ({
  frameId: "f1",
  tipo: "capa",
  label: "Capa",
  slotsImagem: 0,
  campos: ["titulo", "subtitulo"],
  textos: { titulo: "Afirmação", subtitulo: "o parágrafo de apoio" },
  imagens: {},
  ...o,
})

describe("camposDaIdentidade", () => {
  it("o cartão de perfil desenha título e corpo — nunca subtítulo", () => {
    expect(camposDaIdentidade(true, "capa")).toEqual(["titulo", "corpo"])
    expect(camposDaIdentidade(true, "texto")).toEqual(["titulo", "corpo"])
    expect(camposDaIdentidade(true, "cta")).toContain("botao")
  })

  it("fora dele vale o conjunto do tipo", () => {
    expect(camposDaIdentidade(false, "capa")).toEqual(["titulo", "subtitulo"])
    expect(camposDaIdentidade(false, "cta")).toEqual(["titulo", "subtitulo", "botao"])
  })
})

describe("reconciliarCampos", () => {
  it("o parágrafo MIGRA para o campo que fica em vez de sumir da tela", () => {
    const r = reconciliarCampos(frame(), camposDaIdentidade(true, "capa"))
    expect(r.campos).toEqual(["titulo", "corpo"])
    expect(r.textos.titulo).toBe("Afirmação")
    expect(r.textos.corpo).toBe("o parágrafo de apoio")
  })

  it("é simétrico: ida e volta devolve o texto ao campo de origem", () => {
    const ida = reconciliarCampos(frame(), camposDaIdentidade(true, "capa"))
    const volta = reconciliarCampos({ tipo: "capa", ...ida }, camposDaIdentidade(false, "capa"))
    expect(volta.textos.subtitulo).toBe("o parágrafo de apoio")
    expect(volta.textos.titulo).toBe("Afirmação")
  })

  it("não sobrescreve texto que já existe no campo de destino", () => {
    const f = frame({ campos: ["titulo", "subtitulo", "corpo"], textos: { titulo: "T", subtitulo: "vai sair", corpo: "já escrito" } })
    const r = reconciliarCampos(f, camposDaIdentidade(true, "capa"))
    expect(r.textos.corpo).toBe("já escrito")
  })

  it("campo vazio não migra nada", () => {
    const r = reconciliarCampos(frame({ textos: { titulo: "T", subtitulo: "   " } }), camposDaIdentidade(true, "capa"))
    expect(r.textos.corpo).toBe("")
  })

  it("gancho e anotação sobrevivem, como em toda troca", () => {
    const f = frame({ tipo: "texto", campos: ["titulo", "corpo", "gancho"], textos: { titulo: "T", corpo: "c", gancho: "a linha que prepara" } })
    const r = reconciliarCampos(f, camposDaIdentidade(true, "texto"))
    expect(r.campos).toContain("gancho")
    expect(r.textos.gancho).toBe("a linha que prepara")
  })
})

describe("trocar de identidade", () => {
  /**
   * O defeito que a reconciliação fecha: o renderer do cartão de perfil
   * desenha título e corpo, e o subtítulo escrito na capa da casa ficava no
   * documento, invisível na tela, sem erro nenhum.
   */
  it("o subtítulo da capa vira corpo ao entrar no cartão de perfil — e volta ao sair", () => {
    const base: Documento = novoDocumento("x", "canal-1", "molde-neon")
    const escrito: Documento = { ...base, frames: base.frames.map((f, i) => (i === 0 ? { ...f, textos: { titulo: "Afirmação", subtitulo: "o apoio" } } : f)) }
    const post = aplicarFamilia(escrito, "post")
    expect(post.frames[0].campos).toEqual(["titulo", "corpo"])
    expect(post.frames[0].textos.corpo).toBe("o apoio")

    const volta = aplicarFamilia(post, "neon")
    expect(volta.frames[0].campos).toEqual(["titulo", "subtitulo"])
    expect(volta.frames[0].textos.subtitulo).toBe("o apoio")
  })

  it("entre duas famílias da casa os campos não são tocados", () => {
    const base: Documento = novoDocumento("x", "canal-1", "molde-neon")
    expect(aplicarFamilia(base, "editorial").frames).toBe(base.frames)
  })

  it("trocar o TIPO dentro do cartão de perfil não cria campo invisível", () => {
    const d = aplicarFamilia(novoDocumento("x", "canal-1", "molde-post"), "post")
    const cta = d.frames.findIndex((f) => f.tipo === "cta")
    const virouTexto = trocarTipoFrame(d, 1, "prova")
    expect(virouTexto.frames[1].campos).toEqual(["titulo", "corpo"])
    expect(d.frames[cta].campos).toContain("botao")
  })
})
