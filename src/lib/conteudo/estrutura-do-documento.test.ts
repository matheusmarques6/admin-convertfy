import { describe, expect, it } from "vitest"
import {
  chaveDeNome,
  descricaoDoFrame,
  estruturaDoDocumento,
  resumoDoTemplate,
  templateComMesmoNome,
  temFoto,
} from "./estrutura-do-documento"
import type { DocFrame, MeuTemplate } from "./types"

const frame = (p: Partial<DocFrame> & Pick<DocFrame, "tipo">): DocFrame => ({
  frameId: p.frameId ?? "f1",
  tipo: p.tipo,
  label: p.label ?? "Slide",
  slotsImagem: p.slotsImagem ?? 0,
  campos: p.campos ?? ["titulo", "corpo"],
  textos: p.textos ?? {},
  imagens: p.imagens ?? {},
  oculto: p.oculto,
  variante: p.variante,
})

describe("temFoto", () => {
  it("conta o slot que o renderer desenha", () => {
    expect(temFoto(frame({ tipo: "texto", slotsImagem: 1 }))).toBe(true)
    expect(temFoto(frame({ tipo: "capa", slotsImagem: 1 }))).toBe(true)
  })

  it("NÃO conta slot em dado nem em cta — o renderer não tem lugar para foto ali", () => {
    expect(temFoto(frame({ tipo: "dado", slotsImagem: 1 }))).toBe(false)
    expect(temFoto(frame({ tipo: "cta", slotsImagem: 1 }))).toBe(false)
  })
})

describe("descricaoDoFrame", () => {
  it("fala da forma: tipo, variação e foto", () => {
    expect(descricaoDoFrame(frame({ tipo: "capa", slotsImagem: 1, variante: "b" }))).toBe("capa · texto no centro · com foto")
  })

  it("sem variação declarada sai só o tipo", () => {
    expect(descricaoDoFrame(frame({ tipo: "prova" }))).toBe("prova")
  })

  it("não promete foto onde ela não é desenhada", () => {
    expect(descricaoDoFrame(frame({ tipo: "dado", slotsImagem: 1 }))).toBe("dado")
  })
})

describe("estruturaDoDocumento", () => {
  const doc = {
    frames: [
      frame({ frameId: "f1", tipo: "capa", slotsImagem: 1 }),
      frame({ frameId: "f2", tipo: "dado", slotsImagem: 1 }),
      frame({ frameId: "f3", tipo: "texto", oculto: true }),
      frame({ frameId: "f4", tipo: "cta", campos: ["titulo", "subtitulo", "botao"] }),
    ],
  }

  it("mantém a ordem dos slides visíveis", () => {
    expect(estruturaDoDocumento(doc).map((e) => e.tipo)).toEqual(["capa", "dado", "cta"])
  })

  it("descarta o slide oculto — ele foi tirado da peça de propósito", () => {
    expect(estruturaDoDocumento(doc)).toHaveLength(3)
  })

  it("o slot fantasma do dado não vira promessa de foto", () => {
    expect(estruturaDoDocumento(doc)[1].slotImagem).toBe(false)
    expect(estruturaDoDocumento(doc)[0].slotImagem).toBe(true)
  })
})

describe("chaveDeNome", () => {
  it("ignora acento, caixa e espaço sobrando", () => {
    expect(chaveDeNome("  Benchmark  DE   Marca ")).toBe(chaveDeNome("benchmark de marca"))
    expect(chaveDeNome("Edição Sério")).toBe("edicao serio")
    expect(chaveDeNome("Editorial Preto")).toBe("editorial preto")
  })
})

describe("templateComMesmoNome", () => {
  const lista = [{ id: "t1", nome: "Benchmark de marca" } as MeuTemplate]

  it("acha o conflito mesmo com caixa e acento diferentes", () => {
    expect(templateComMesmoNome("BENCHMARK DE MARCA", lista)?.id).toBe("t1")
  })

  it("nome novo não conflita", () => {
    expect(templateComMesmoNome("Lista prática", lista)).toBeNull()
  })

  it("nome vazio nunca conflita — não é um nome", () => {
    expect(templateComMesmoNome("   ", lista)).toBeNull()
  })
})

describe("resumoDoTemplate", () => {
  it("conta visíveis, ocultos e fotos reais", () => {
    expect(
      resumoDoTemplate({
        frames: [
          frame({ tipo: "capa", slotsImagem: 1 }),
          frame({ tipo: "dado", slotsImagem: 1 }),
          frame({ tipo: "texto", oculto: true, slotsImagem: 1 }),
        ],
      }),
    ).toEqual({ frames: 2, ocultos: 1, comFoto: 1 })
  })
})
