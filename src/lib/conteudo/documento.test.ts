import { describe, expect, it } from "vitest"
import {
  adicionarFrame,
  aplicarPerfil,
  aplicarPropostas,
  dividirFrame,
  dividirTexto,
  duplicarFrame,
  ehTextoGuia,
  excluirFrame,
  linhasDeTexto,
  novoDocumento,
  propostasDeLinhas,
  reordenarFrames,
  setTexto,
  slotsDeImagem,
  trocarTemplate,
  trocarTipoFrame,
  novaVersao,
} from "./documento"
import { getTemplate } from "./templates"
import { camposExcedidos, fitFactor } from "./limites"
import { avaliarCompliance, corrigirLegendaLocal, localizarTrecho } from "./compliance"
import { editorReducer, estadoInicial } from "./historico"
import { fundoEscuro, fundoValido, gradienteCss } from "./brand"

const agora = new Date("2026-09-05T10:00:00-03:00")

describe("novoDocumento", () => {
  it("copia a estrutura do template e abre com textos-guia", () => {
    const d = novoDocumento("Teste", "convertfy", "molde-turbo", { agora })
    expect(d.frames).toHaveLength(7)
    expect(d.frames[0].tipo).toBe("capa")
    expect(d.frames[6].tipo).toBe("cta")
    expect(ehTextoGuia(d.frames[2])).toBe(true)
    expect(d.frames[6].textos.botao).toBe("Comente PALAVRA")
    expect(d.fundoPorFrame.f1).toBe("gradiente")
    expect(d.brandKit.brandName).toBe("@convertfy")
    expect(d.historico[0].label).toContain("Turbo")
    expect(d.data).toBe("05/09")
  })

  it("perfil bruno recebe o brand kit do Bruno", () => {
    const d = novoDocumento("x", "bruno", "molde-lista", { agora })
    expect(d.brandKit.brandName).toBe("@brunoconvertfy")
    expect(d.frames).toHaveLength(9)
  })
})

describe("trocarTemplate", () => {
  it("preserva textos escritos casando por tipo, na ordem", () => {
    let d = novoDocumento("x", "convertfy", "molde-turbo", { agora })
    d = setTexto(d, "f3", "titulo", "Primeiro texto")
    d = setTexto(d, "f4", "titulo", "Segundo texto")
    d = setTexto(d, "f1", "titulo", "Capa escrita")
    const { doc, naoCoube } = trocarTemplate(d, getTemplate("molde-benchmark"))
    expect(doc.templateId).toBe("molde-benchmark")
    expect(doc.frames[0].textos.titulo).toBe("Capa escrita")
    const textos = doc.frames.filter((f) => f.tipo === "texto").map((f) => f.textos.titulo)
    expect(textos[0]).toBe("Primeiro texto")
    expect(textos[1]).toBe("Segundo texto")
    expect(naoCoube).toHaveLength(0)
  })

  it("avisa o que não coube (frame escrito sem par no novo template)", () => {
    let d = novoDocumento("x", "convertfy", "molde-turbo", { agora })
    d = setTexto(d, "f2", "titulo", "73%") // dado
    const { doc, naoCoube } = trocarTemplate(d, getTemplate("molde-mec")) // sem frame "dado"
    expect(doc.frames.some((f) => f.tipo === "dado")).toBe(false)
    expect(naoCoube.map((f) => f.textos.titulo)).toEqual(["73%"])
  })

  it("não conta texto-guia como perdido", () => {
    const d = novoDocumento("x", "convertfy", "molde-turbo", { agora })
    const { naoCoube } = trocarTemplate(d, getTemplate("molde-bastidor"))
    expect(naoCoube).toHaveLength(0)
  })

  it("imagem só segue quando o novo frame tem slot", () => {
    let d = novoDocumento("x", "convertfy", "molde-turbo", { agora })
    const img = { url: "u", zoom: 100, x: 0, y: 0, larguraSlot: 1080, alturaSlot: 1350 }
    d = { ...d, frames: d.frames.map((f) => (f.frameId === "f4" ? { ...f, imagens: { slot1: img }, textos: { titulo: "Com imagem", corpo: "c" } } : f)) }
    const { doc } = trocarTemplate(d, getTemplate("molde-mec"))
    // "texto" não existe no MEC → vai para naoCoube; nenhum slot herda a imagem
    expect(doc.frames.every((f) => !f.imagens.slot1 || f.slotsImagem > 0)).toBe(true)
  })
})

describe("estrutura de frames", () => {
  const base = novoDocumento("x", "convertfy", "molde-turbo", { agora })

  it("reordena e mantém o conjunto", () => {
    const d = reordenarFrames(base, 1, 4)
    expect(d.frames.map((f) => f.frameId)).toEqual(["f1", "f3", "f4", "f5", "f2", "f6", "f7"])
    expect(reordenarFrames(base, 2, 2)).toBe(base)
    expect(reordenarFrames(base, -1, 2)).toBe(base)
  })

  it("duplica com id novo, fundo e rótulo (cópia)", () => {
    const d = duplicarFrame(base, 2)
    expect(d.frames).toHaveLength(8)
    expect(d.frames[3].label).toBe("Slide 3 (cópia)")
    expect(d.frames[3].frameId).not.toBe(base.frames[2].frameId)
    expect(d.fundoPorFrame[d.frames[3].frameId]).toBe(base.fundoPorFrame.f3)
  })

  it("divide o corpo na fronteira de frase", () => {
    let d = setTexto(base, "f3", "corpo", "Primeira frase aqui. Segunda frase ali. Terceira frase acolá.")
    d = dividirFrame(d, 2)
    expect(d.frames).toHaveLength(8)
    expect(d.frames[2].textos.corpo).toBe("Primeira frase aqui. Segunda frase ali.")
    expect(d.frames[3].textos.corpo).toBe("Terceira frase acolá.")
    expect(d.frames[3].textos.titulo).toMatch(/\(cont\.\)$/)
    expect(d.frames[3].slotsImagem).toBe(0)
  })

  it("dividirTexto sem pontuação corta no espaço mais próximo do meio", () => {
    const [a, b] = dividirTexto("um dois três quatro")
    expect(a).toBe("um dois")
    expect(b).toBe("três quatro")
    expect(dividirTexto("")).toEqual(["", ""])
  })

  it("adiciona antes do CTA e não exclui abaixo do mínimo", () => {
    const d = adicionarFrame(base)
    expect(d.frames).toHaveLength(8)
    expect(d.frames[6].tipo).toBe("texto")
    expect(d.frames[7].tipo).toBe("cta")
    let m = base
    while (m.frames.length > 3) m = excluirFrame(m, 1)
    expect(m.frames).toHaveLength(3)
    expect(excluirFrame(m, 1)).toBe(m)
  })

  it("troca o tipo preservando texto e ajustando campos", () => {
    let d = setTexto(base, "f3", "titulo", "Meu título")
    d = trocarTipoFrame(d, 2, "dado")
    expect(d.frames[2].tipo).toBe("dado")
    expect(d.frames[2].textos.titulo).toBe("Meu título")
    expect(d.frames[2].campos).toEqual(["titulo", "corpo"])
    expect(trocarTipoFrame(d, 2, "dado")).toBe(d)
  })
})

describe("distribuir texto colado", () => {
  const base = novoDocumento("x", "convertfy", "molde-turbo", { agora })

  it("limpa marcadores e gera uma proposta por linha, ignorando capa e CTA", () => {
    expect(linhasDeTexto("- a\n• b\n1. c\n\n2) d")).toEqual(["a", "b", "c", "d"])
    const props = propostasDeLinhas(base, "- Segmentar por valor: separe a base em faixas\n- Cadência VIP. Sem cupom\n- Terceira")
    expect(props).toHaveLength(3)
    expect(props[0]).toMatchObject({ frameId: "f2", titulo: "Segmentar por valor", corpo: "separe a base em faixas" })
    expect(props[1]).toMatchObject({ frameId: "f3", titulo: "Cadência VIP", corpo: "Sem cupom" })
    expect(props[2].corpo).toBeUndefined()
  })

  it("não passa dos frames do meio", () => {
    const props = propostasDeLinhas(base, Array.from({ length: 12 }, (_, i) => `linha ${i}`).join("\n"))
    expect(props).toHaveLength(5)
  })

  it("aplica propostas e registra no histórico", () => {
    const props = propostasDeLinhas(base, "Um: dois\nTrês")
    const d = aplicarPropostas(base, props)
    expect(d.frames[1].textos.titulo).toBe("Um")
    expect(d.frames[1].textos.corpo).toBe("dois")
    expect(d.frames[2].textos.titulo).toBe("Três")
    expect(d.historico[0].label).toContain("2 slides")
  })
})

describe("perfil, slots e versão", () => {
  it("aplicarPerfil troca o brand kit inteiro", () => {
    const d = aplicarPerfil(novoDocumento("x", "convertfy", "molde-turbo", { agora }), "bruno")
    expect(d.perfil).toBe("bruno")
    expect(d.brandKit.brandName2).toBe("Bruno Marques")
  })

  it("slotsDeImagem conta total, cheios e frames sem slot", () => {
    const s = slotsDeImagem(novoDocumento("x", "convertfy", "molde-turbo", { agora }))
    expect(s).toEqual({ total: 3, cheios: 0, semSlot: [2, 3, 6, 7] })
  })

  it("novaVersao incrementa", () => {
    expect(novaVersao("v2")).toBe("v3")
    expect(novaVersao("x")).toBe("v2")
  })
})

describe("limites e auto-fit", () => {
  it("fitFactor é 1 até o limite e tem piso", () => {
    expect(fitFactor(10, 56)).toBe(1)
    expect(fitFactor(56, 56)).toBe(1)
    expect(fitFactor(112, 56)).toBeCloseTo(Math.pow(0.5, 0.75), 5)
    expect(fitFactor(10_000, 56)).toBe(0.58)
    expect(fitFactor(999, null)).toBe(1)
  })

  it("camposExcedidos aponta só o que passou", () => {
    const d = novoDocumento("x", "convertfy", "molde-turbo", { agora })
    const f = { ...d.frames[1], textos: { titulo: "123456", corpo: "ok" } } // dado: titulo 5
    expect(camposExcedidos(f)).toEqual(["titulo"])
  })
})

describe("compliance", () => {
  it("aprova legenda limpa com CTA", () => {
    const r = avaliarCompliance("Texto normal. Comente 8% que eu te mando.")
    expect(r.every((x) => x.ok)).toBe(true)
  })

  it("reprova travessão, promessa e bait com o trecho", () => {
    const r = avaliarCompliance("Resultado garantido — curte e compartilha. Comente AQUI")
    const por = Object.fromEntries(r.map((x) => [x.id, x]))
    expect(por.travessao.ok).toBe(false)
    expect(por.travessao.trecho).toBe("—")
    expect(por.promessa.trecho).toBe("garantido")
    expect(por.bait.trecho).toBe("curte e compartilha")
    expect(por.cta.ok).toBe(true)
  })

  it("corrigirLegendaLocal resolve o corrigível", () => {
    const t = corrigirLegendaLocal("Resultado garantido — curte e compartilha. Comente AQUI")
    const r = avaliarCompliance(t)
    expect(r.filter((x) => !x.ok)).toHaveLength(0)
    expect(t).not.toMatch(/—/)
  })

  it("localizarTrecho é case-insensitive no fallback", () => {
    expect(localizarTrecho("abc Garantido x", "garantido")).toEqual([4, 13])
    expect(localizarTrecho("abc", null)).toBeNull()
  })
})

describe("historico (undo/redo)", () => {
  const d0 = novoDocumento("x", "convertfy", "molde-turbo", { agora })
  const d1 = { ...d0, nome: "um" }
  const d2 = { ...d0, nome: "dois" }

  it("commit empilha, undo volta, redo avança", () => {
    let s = estadoInicial(d0)
    s = editorReducer(s, { type: "commit", doc: d1 })
    s = editorReducer(s, { type: "commit", doc: d2 })
    expect(s.past).toHaveLength(2)
    s = editorReducer(s, { type: "undo" })
    expect(s.doc.nome).toBe("um")
    expect(s.future).toHaveLength(1)
    s = editorReducer(s, { type: "redo" })
    expect(s.doc.nome).toBe("dois")
    expect(editorReducer(s, { type: "redo" })).toBe(s)
  })

  it("uma sequência de previews + commit vira UM passo de undo", () => {
    let s = estadoInicial(d0)
    s = editorReducer(s, { type: "preview", doc: { ...d0, nome: "p1" } })
    s = editorReducer(s, { type: "preview", doc: { ...d0, nome: "p2" } })
    expect(s.past).toHaveLength(0)
    s = editorReducer(s, { type: "commit", doc: { ...d0, nome: "final" } })
    expect(s.past).toHaveLength(1)
    expect(s.past[0].nome).toBe(d0.nome)
    s = editorReducer(s, { type: "undo" })
    expect(s.doc.nome).toBe(d0.nome)
  })

  it("commit limpa o futuro", () => {
    let s = estadoInicial(d0)
    s = editorReducer(s, { type: "commit", doc: d1 })
    s = editorReducer(s, { type: "undo" })
    s = editorReducer(s, { type: "commit", doc: d2 })
    expect(s.future).toHaveLength(0)
  })
})

describe("cores do slide", () => {
  it("fundoEscuro reconhece gradiente, hex e rgb", () => {
    expect(fundoEscuro("gradiente")).toBe(true)
    expect(fundoEscuro("#041366")).toBe(true)
    expect(fundoEscuro("#F6F8FE")).toBe(false)
    expect(fundoEscuro("rgb(10, 10, 10)")).toBe(true)
    expect(fundoEscuro("lilás")).toBe(false)
  })

  it("fundoValido e gradienteCss", () => {
    expect(fundoValido("#fff")).toBe(true)
    expect(fundoValido("rgba(1,2,3,0.5)")).toBe(true)
    expect(fundoValido("azul")).toBe(false)
    expect(gradienteCss({ de: "#a", meio: "#b", ate: "#c", angulo: 90 })).toBe("linear-gradient(90deg, #a 0%, #b 55%, #c 100%)")
  })
})
