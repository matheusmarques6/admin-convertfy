import { describe, expect, it } from "vitest"
import { camposDaIdentidade, reconciliarCampos } from "./campos-da-identidade"
import { aplicarFamilia } from "./familias"
import { novoDocumento, trocarTipoFrame } from "./documento"
import type { DocFrame, Documento } from "./types"

/** Identidade que NÃO desenha a caixa de destaque (todas menos a Manchete). */
const CASA = { caixaDeDestaque: false }
const COM_CAIXA = { caixaDeDestaque: true }

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
    const r = reconciliarCampos(frame(), camposDaIdentidade(true, "capa"), CASA)
    expect(r.campos).toEqual(["titulo", "corpo"])
    expect(r.textos.titulo).toBe("Afirmação")
    expect(r.textos.corpo).toBe("o parágrafo de apoio")
  })

  it("é simétrico: ida e volta devolve o texto ao campo de origem", () => {
    const ida = reconciliarCampos(frame(), camposDaIdentidade(true, "capa"), CASA)
    const volta = reconciliarCampos({ tipo: "capa", ...ida }, camposDaIdentidade(false, "capa"), CASA)
    expect(volta.textos.subtitulo).toBe("o parágrafo de apoio")
    expect(volta.textos.titulo).toBe("Afirmação")
  })

  it("não sobrescreve texto que já existe no campo de destino", () => {
    const f = frame({ campos: ["titulo", "subtitulo", "corpo"], textos: { titulo: "T", subtitulo: "vai sair", corpo: "já escrito" } })
    const r = reconciliarCampos(f, camposDaIdentidade(true, "capa"), CASA)
    expect(r.textos.corpo).toBe("já escrito")
  })

  it("campo vazio não migra nada", () => {
    const r = reconciliarCampos(frame({ textos: { titulo: "T", subtitulo: "   " } }), camposDaIdentidade(true, "capa"), CASA)
    expect(r.textos.corpo).toBe("")
  })

  it("gancho e anotação sobrevivem, como em toda troca", () => {
    const f = frame({ tipo: "texto", campos: ["titulo", "corpo", "gancho"], textos: { titulo: "T", corpo: "c", gancho: "a linha que prepara" } })
    const r = reconciliarCampos(f, camposDaIdentidade(true, "texto"), CASA)
    expect(r.campos).toContain("gancho")
    expect(r.textos.gancho).toBe("a linha que prepara")
  })

  it("a caixa de destaque SAI ao entrar numa identidade que não a desenha — e o texto fica guardado", () => {
    const f = frame({ tipo: "texto", campos: ["titulo", "corpo", "destaque"], textos: { titulo: "T", corpo: "c", destaque: "a frase da caixa" } })
    const r = reconciliarCampos(f, camposDaIdentidade(false, "texto"), CASA)
    expect(r.campos).not.toContain("destaque")
    // Apagar seria perder copy na troca de identidade.
    expect(r.textos.destaque).toBe("a frase da caixa")
  })

  it("e VOLTA escrita para quem retorna à identidade que a desenha", () => {
    const f = frame({ tipo: "texto", campos: ["titulo", "corpo", "destaque"], textos: { titulo: "T", corpo: "c", destaque: "a frase da caixa" } })
    const saiu = reconciliarCampos(f, camposDaIdentidade(false, "texto"), CASA)
    const voltou = reconciliarCampos({ tipo: "texto", ...saiu }, camposDaIdentidade(false, "texto"), COM_CAIXA)
    expect(voltou.campos).toContain("destaque")
    expect(voltou.textos.destaque).toBe("a frase da caixa")
  })

  it("caixa vazia não volta: campo em branco é ruído no painel", () => {
    const f = frame({ tipo: "texto", campos: ["titulo", "corpo"], textos: { titulo: "T", corpo: "c", destaque: "   " } })
    expect(reconciliarCampos(f, camposDaIdentidade(false, "texto"), COM_CAIXA).campos).not.toContain("destaque")
  })

  it("a capa não recebe a caixa nem com texto guardado — ali ela competiria com o título", () => {
    const f = frame({ campos: ["titulo", "subtitulo"], textos: { titulo: "T", subtitulo: "s", destaque: "sobrou de um slide de texto" } })
    expect(reconciliarCampos(f, camposDaIdentidade(false, "capa"), COM_CAIXA).campos).not.toContain("destaque")
  })
})

describe("trocar de identidade", () => {
  /**
   * O defeito que a reconciliação fecha: o renderer do cartão de perfil
   * desenha título e corpo, e o subtítulo escrito na capa da casa ficava no
   * documento, invisível na tela, sem erro nenhum.
   */
  it("o subtítulo da capa vira corpo ao entrar no cartão de perfil — e volta ao sair", () => {
    const base: Documento = novoDocumento("x", "canal-1", "molde-manchete")
    const escrito: Documento = { ...base, frames: base.frames.map((f, i) => (i === 0 ? { ...f, textos: { titulo: "Afirmação", subtitulo: "o apoio" } } : f)) }
    const post = aplicarFamilia(escrito, "post")
    expect(post.frames[0].campos).toEqual(["titulo", "corpo"])
    expect(post.frames[0].textos.corpo).toBe("o apoio")

    const volta = aplicarFamilia(post, "manchete")
    expect(volta.frames[0].campos).toEqual(["titulo", "subtitulo"])
    expect(volta.frames[0].textos.subtitulo).toBe("o apoio")
  })

  it("a caixa de destaque não vira campo fantasma ao sair da Manchete", () => {
    const base = aplicarFamilia(novoDocumento("x", "canal-1", "molde-manchete"), "manchete")
    const i = base.frames.findIndex((f) => f.tipo === "texto")
    const escrito: Documento = { ...base, frames: base.frames.map((f, j) => (j === i ? { ...f, campos: [...f.campos, "destaque" as const], textos: { ...f.textos, destaque: "a frase da caixa" } } : f)) }

    // Só a Manchete DESENHA a caixa; na casa ela ficaria no documento sem
    // nada na tela — presente, invisível, sem erro nenhum.
    const casa = aplicarFamilia(escrito, "padrao")
    expect(casa.frames[i].campos).not.toContain("destaque")
    const volta = aplicarFamilia(casa, "manchete")
    expect(volta.frames[i].campos).toContain("destaque")
    expect(volta.frames[i].textos.destaque).toBe("a frase da caixa")
  })

  it("entre duas famílias da casa os campos não são tocados", () => {
    const base: Documento = novoDocumento("x", "canal-1", "molde-manchete")
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
