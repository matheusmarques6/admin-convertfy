import { describe, expect, it } from "vitest"
import { FAMILIAS, FAMILIA_OPCOES, aplicarFamilia, ehFamilia, fundoPadraoDaFamilia } from "./familias"
import { novoDocumento } from "./documento"
import { camposThread, temBarraDeMetadados, THREAD_CORES, doTela } from "./formato-thread"
import { limiteDe } from "./limites"
import { getTemplate } from "./templates"
import type { Documento, FamiliaVisual } from "./types"

const T = FAMILIAS.thread

describe("identidade Thread", () => {
  it("é cartão de THREAD — não é o cartão de perfil, e os dois não convivem", () => {
    expect(T.traco.cartaoThread).toBe(true)
    expect(T.traco.cartaoPerfil).toBe(false)
    // Um slide não pode ser captura de post E peça editorial ao mesmo tempo.
    for (const f of Object.values(FAMILIAS)) expect(f.traco.cartaoPerfil && f.traco.cartaoThread).toBe(false)
  })

  it("todo cartão é o MESMO branco e só o FECHO é preto", () => {
    for (const tipo of ["capa", "texto", "prova", "lista"] as const) {
      expect(fundoPadraoDaFamilia("thread", tipo, 0, 9)).toBe(THREAD_CORES.cartao)
      expect(fundoPadraoDaFamilia("thread", tipo, 4, 9)).toBe(THREAD_CORES.cartao)
    }
    expect(fundoPadraoDaFamilia("thread", "cta", 8, 9)).toBe(THREAD_CORES.preto)
  })

  it("o FECHO nasce preto de verdade ao aplicar a identidade", () => {
    // O defeito que isto fecha: `aplicarFamilia` decidia se recalculava o
    // fundo por uma LISTA de traços, e a Thread ficou de fora dela — o
    // fecho herdava o "gradiente" da casa e saía BRANCO com texto branco.
    const doc = aplicarFamilia(novoDocumento("x", "canal-1", "molde-thread"), "thread")
    const cta = doc.frames.find((f) => f.tipo === "cta")!
    expect(doc.fundoPorFrame[cta.frameId]).toBe(THREAD_CORES.preto)
    for (const f of doc.frames) if (f.tipo !== "cta") expect(doc.fundoPorFrame[f.frameId]).toBe(THREAD_CORES.cartao)
  })

  it("fundo pintado à mão sobrevive à troca de identidade", () => {
    const base = aplicarFamilia(novoDocumento("x", "canal-1", "molde-thread"), "thread")
    const alvo = base.frames[1].frameId
    const pintado = aplicarFamilia({ ...base, fundoPorFrame: { ...base.fundoPorFrame, [alvo]: "#7C3AED" } }, "padrao")
    expect(pintado.fundoPorFrame[alvo]).toBe("#7C3AED")
  })

  it("a barra de metadados não entra no fecho — ali a marca já está na autoria", () => {
    expect(temBarraDeMetadados("texto")).toBe(true)
    expect(temBarraDeMetadados("capa")).toBe(true)
    expect(temBarraDeMetadados("cta")).toBe(false)
  })

  it("o molde tem nove slides e o fecho sem slot de imagem", () => {
    const t = getTemplate("molde-thread")
    expect(t.familia).toBe("thread")
    expect(t.frames).toHaveLength(9)
    expect(t.frames[t.frames.length - 1].slotsImagem).toBe(0)
    // Os oito primeiros têm slot: é a foto que o fio quebra no meio.
    for (const f of t.frames.slice(0, 8)) expect(f.slotsImagem).toBe(1)
  })

  it("o fio é título + corpo, e o fecho é só a frase", () => {
    expect(camposThread("texto")).toEqual(["titulo", "corpo"])
    expect(camposThread("cta")).toEqual(["titulo"])
  })

  it("o limite do fio é maior que o do tipo — o formato tem parágrafo", () => {
    expect(limiteDe("texto", "corpo", "thread")).toBeGreaterThan(limiteDe("texto", "corpo") ?? 0)
  })

  it("a identidade não some em silêncio: o guard deriva do mapa", () => {
    // `ehFamilia` era um `||` escrito à mão, e uma família nova caía no
    // padrão sem nada avisar — o documento nascia com a cara errada.
    for (const k of Object.keys(FAMILIAS) as FamiliaVisual[]) expect(ehFamilia(k)).toBe(true)
    expect(ehFamilia("inexistente")).toBe(false)
    expect(ehFamilia(undefined)).toBe(false)
  })

  it("e pode ser ESCOLHIDA: o seletor também deriva do mapa", () => {
    // A terceira lista à mão da mesma família de defeito. O preço aqui era
    // peculiar: a identidade existia inteira — tipo, mapa, molde — e não
    // aparecia em Marca → Identidade visual nem no diálogo de criação.
    const chaves = FAMILIA_OPCOES.map(([k]) => k)
    expect(chaves).toEqual(Object.keys(FAMILIAS))
    expect(chaves).toContain("thread")
    for (const [k, nome] of FAMILIA_OPCOES) expect(nome).toBe(FAMILIAS[k].nome)
  })

  it("ida e volta devolve o documento à identidade de origem", () => {
    const base: Documento = novoDocumento("x", "canal-1", "molde-post")
    const volta = aplicarFamilia(aplicarFamilia(base, "thread"), "padrao")
    expect(volta.fundoPorFrame).toEqual(base.fundoPorFrame)
    expect(volta.cores).toEqual(base.cores)
  })
})

describe("a conversão do print do construtor", () => {
  it("`doTela` converte a medida de tela para a base 1080", () => {
    // O cartão mede 459 px de tela para uma peça de 1080: escala 0,425.
    expect(doTela(459)).toBe(1080)
    expect(doTela(0)).toBe(0)
  })
})
