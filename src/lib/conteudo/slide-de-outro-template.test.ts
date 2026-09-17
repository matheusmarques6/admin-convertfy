import { describe, expect, it } from "vitest"
import { aplicarSlideNoFrame, formatosParaOTipo, importarSlide, posicaoPadrao, slidesDeOutrosMoldes } from "./slide-de-outro-template"
import { novoDocumento } from "./documento"
import { aplicarFamilia, FAMILIAS, ritmoDeFundos } from "./familias"
import { ST_TEMPLATES } from "./templates"
import type { Documento } from "./types"

const agora = new Date("2026-09-16T10:00:00-03:00")
const doc = (id = "molde-post"): Documento => novoDocumento("x", "canal-1", id, { agora })

const capaDaManchete = () => formatosParaOTipo("molde-post", "capa").find((s) => s.templateId === "molde-manchete")!

describe("slidesDeOutrosMoldes", () => {
  it("não oferece o molde do próprio documento", () => {
    const g = slidesDeOutrosMoldes("molde-post")
    expect(g.map((x) => x.template.id)).not.toContain("molde-post")
    expect(g.length).toBe(ST_TEMPLATES.length - 1)
  })

  it("id desconhecido devolve a prateleira inteira — nada é escondido por engano", () => {
    expect(slidesDeOutrosMoldes("molde-que-nao-existe")).toHaveLength(ST_TEMPLATES.length)
  })

  it("formatosParaOTipo só traz o MESMO papel na sequência", () => {
    const capas = formatosParaOTipo("molde-post", "capa")
    expect(capas.length).toBeGreaterThan(0)
    expect(capas.every((s) => s.tipo === "capa")).toBe(true)
    expect(capas.every((s) => s.templateId !== "molde-post")).toBe(true)
  })
})

describe("importarSlide", () => {
  it("entra antes do CTA final e não depois dele", () => {
    const d = doc()
    expect(d.frames[d.frames.length - 1].tipo).toBe("cta")
    const novo = importarSlide(d, capaDaManchete())
    expect(novo.frames).toHaveLength(d.frames.length + 1)
    expect(novo.frames[novo.frames.length - 1].tipo).toBe("cta")
    expect(novo.frames[novo.frames.length - 2].label).toBe(capaDaManchete().label)
  })

  it("o frameId é NOVO — reusar o do molde sobrescreveria fundo e estilo do slide que já ocupa aquele id", () => {
    const d = doc()
    const s = capaDaManchete()
    expect(s.origemId).toBe("f1")
    expect(d.frames.some((f) => f.frameId === "f1")).toBe(true)
    const novo = importarSlide(d, s)
    const importado = novo.frames[novo.frames.length - 2]
    expect(importado.frameId).not.toBe("f1")
    expect(new Set(novo.frames.map((f) => f.frameId)).size).toBe(novo.frames.length)
    // O f1 original continua com o fundo dele.
    expect(novo.fundoPorFrame.f1).toBe(d.fundoPorFrame.f1)
  })

  it("o slide entra na identidade do DESTINO, não na do molde de origem", () => {
    const d = ritmoDeFundos(aplicarFamilia(doc(), "post"))
    const novo = importarSlide(d, capaDaManchete())
    const importado = novo.frames[novo.frames.length - 2]
    // A Manchete é preta na capa; o fundo aqui tem de ser o da família do documento.
    expect(novo.fundoPorFrame[importado.frameId]).not.toBe(FAMILIAS.manchete.fundoEscuro)
    expect([FAMILIAS.post.fundoClaro, FAMILIAS.post.fundoEscuro]).toContain(novo.fundoPorFrame[importado.frameId])
  })

  it("nasce com o texto-guia do tipo: molde é forma, não conteúdo", () => {
    const novo = importarSlide(doc(), capaDaManchete())
    const importado = novo.frames[novo.frames.length - 2]
    expect(importado.textos.titulo).toBe("Sua afirmação forte aqui")
  })

  it("slot de imagem só onde o tipo desenha foto", () => {
    const s = { ...capaDaManchete(), tipo: "dado" as const, slotsImagem: 1 as const }
    const novo = importarSlide(doc(), s)
    expect(novo.frames[novo.frames.length - 2].slotsImagem).toBe(0)
  })

  it("posicaoPadrao respeita documento que não termina em CTA", () => {
    const d = doc()
    const semCta: Documento = { ...d, frames: d.frames.slice(0, -1) }
    expect(posicaoPadrao(semCta)).toBe(semCta.frames.length)
  })
})

describe("aplicarSlideNoFrame", () => {
  it("troca o formato e PRESERVA a copy do operador", () => {
    const d0 = doc()
    const d: Documento = { ...d0, frames: d0.frames.map((f, i) => (i === 0 ? { ...f, textos: { ...f.textos, titulo: "O que ninguém te conta" } } : f)) }
    const novo = aplicarSlideNoFrame(d, 0, capaDaManchete())
    expect(novo.frames[0].textos.titulo).toBe("O que ninguém te conta")
    expect(novo.frames[0].label).toBe(capaDaManchete().label)
  })

  it("o frameId NÃO muda — ele carrega fundo, estilo e imagem", () => {
    const d = doc()
    const id = d.frames[0].frameId
    const novo = aplicarSlideNoFrame(d, 0, capaDaManchete())
    expect(novo.frames[0].frameId).toBe(id)
    expect(novo.fundoPorFrame[id]).toBe(d.fundoPorFrame[id])
  })

  it("a variação volta ao padrão: ela endereçava o desenho do molde anterior", () => {
    const d0 = doc()
    const d: Documento = { ...d0, frames: d0.frames.map((f, i) => (i === 0 ? { ...f, variante: "c" as const } : f)) }
    expect(aplicarSlideNoFrame(d, 0, capaDaManchete()).frames[0].variante).toBeUndefined()
  })

  it("a imagem FICA quando o formato novo não tem slot — apagá-la perderia o upload", () => {
    const d0 = doc()
    const img = { url: "https://x/y.png", zoom: 100, x: 0, y: 0, larguraSlot: 1080, alturaSlot: 900 }
    const d: Documento = { ...d0, frames: d0.frames.map((f, i) => (i === 0 ? { ...f, slotsImagem: 1 as const, imagens: { slot1: img } } : f)) }
    const semFoto = { ...capaDaManchete(), slotsImagem: 0 as const }
    const novo = aplicarSlideNoFrame(d, 0, semFoto)
    expect(novo.frames[0].slotsImagem).toBe(0)
    expect(novo.frames[0].imagens.slot1?.url).toBe("https://x/y.png")
  })

  it("índice fora da lista devolve o MESMO documento", () => {
    const d = doc()
    expect(aplicarSlideNoFrame(d, 99, capaDaManchete())).toBe(d)
  })

  it("o molde do documento não muda: um slide emprestado não reescreve a origem da peça", () => {
    const d = doc()
    expect(aplicarSlideNoFrame(d, 0, capaDaManchete()).templateId).toBe("molde-post")
    expect(importarSlide(d, capaDaManchete()).templateId).toBe("molde-post")
  })
})
