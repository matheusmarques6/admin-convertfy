import { describe, expect, it } from "vitest"

import {
  classificarAprendizado,
  classificarReferencia,
  filtrarPorToque,
  toqueSlug,
  vaultPorToqueLigado,
} from "./toque"

describe("toqueSlug", () => {
  it("é flow-N, o slug que o vault escreve — nunca o `momento` agrupado", () => {
    expect(toqueSlug("welcome", 1)).toBe("welcome-1")
    expect(toqueSlug("carrinho-abandonado", 3)).toBe("carrinho-abandonado-3")
  })
})

describe("classificarReferencia — `emails` da estrutura", () => {
  it("contém o número → toque; não contém → fora; vazio/ausente → global", () => {
    expect(classificarReferencia([1], 1).classe).toBe("toque")
    expect(classificarReferencia([2, 3, 4], 1).classe).toBe("fora")
    expect(classificarReferencia([], 1).classe).toBe("global")
    expect(classificarReferencia(undefined, 1).classe).toBe("global")
    expect(classificarReferencia(null, 1).classe).toBe("global")
  })
  it("aceita números como string (frontmatter escrito à mão) e ignora lixo", () => {
    expect(classificarReferencia(["1", "x"], 1).classe).toBe("toque")
    expect(classificarReferencia(["x"], 1).classe).toBe("global")
  })
  it("valor que não é lista vira global COM aviso — nunca esvazia por erro de digitação", () => {
    const r = classificarReferencia("1", 1)
    expect(r.classe).toBe("global")
    expect(r.aviso).toContain("não é lista")
  })
})

describe("classificarAprendizado — `serve_a`", () => {
  it("ausente, vazio ou `todos` → global", () => {
    expect(classificarAprendizado(undefined, "welcome", 1).classe).toBe("global")
    expect(classificarAprendizado([], "welcome", 1).classe).toBe("global")
    expect(classificarAprendizado(["todos"], "welcome", 1).classe).toBe("global")
    expect(classificarAprendizado(["Todos"], "welcome", 1).classe).toBe("global")
  })
  it("lista de toques: contém o slug → toque; não contém → fora", () => {
    expect(classificarAprendizado(["welcome-1", "welcome-2"], "welcome", 1).classe).toBe("toque")
    expect(classificarAprendizado(["welcome-2"], "welcome", 1).classe).toBe("fora")
    expect(classificarAprendizado("welcome-1", "welcome", 1).classe).toBe("toque")
  })
  it("valor fora do formato flow-N vira global com aviso", () => {
    const r = classificarAprendizado(["primeiro email"], "welcome", 1)
    expect(r.classe).toBe("global")
    expect(r.aviso).toContain("fora do formato")
    expect(classificarAprendizado(42, "welcome", 1)).toMatchObject({ classe: "global" })
  })
})

describe("filtrarPorToque", () => {
  const refs = [
    { slug: "a-w1", emails: [1] },
    { slug: "b-w234", emails: [2, 3, 4] },
    { slug: "c-global", emails: [] },
  ]
  const aprs = [
    { slug: "g", serve_a: undefined },
    { slug: "t1", serve_a: ["welcome-1"] },
    { slug: "t3", serve_a: ["welcome-3"] },
  ]
  it("separa global / do toque / fora — o welcome-1 perde a estrutura de 2-4 e o aprendizado do 3", () => {
    const r = filtrarPorToque({ referencias: refs, aprendizados: aprs, flowType: "welcome", emailNumber: 1 })
    expect(r.referencias.globais.map((x) => x.slug)).toEqual(["c-global"])
    expect(r.referencias.doToque.map((x) => x.slug)).toEqual(["a-w1"])
    expect(r.referencias.fora.map((x) => x.slug)).toEqual(["b-w234"])
    expect(r.aprendizados.globais.map((x) => x.slug)).toEqual(["g"])
    expect(r.aprendizados.doToque.map((x) => x.slug)).toEqual(["t1"])
    expect(r.aprendizados.fora.map((x) => x.slug)).toEqual(["t3"])
    expect(r.failOpen).toBe(false)
  })
  it("fail-open: sem referência global nem do toque, serve TODAS e marca — o Estruturador seria pulado", () => {
    const r = filtrarPorToque({
      referencias: [{ slug: "b-w234", emails: [2, 3, 4] }],
      aprendizados: [],
      flowType: "welcome",
      emailNumber: 1,
    })
    expect(r.failOpen).toBe(true)
    expect(r.referencias.globais.map((x) => x.slug)).toEqual(["b-w234"])
    expect(r.referencias.fora).toEqual([])
  })
  it("desligado (kill-switch): tudo global, nada descartado", () => {
    const r = filtrarPorToque({ referencias: refs, aprendizados: aprs, flowType: "welcome", emailNumber: 1, ligado: false })
    expect(r.referencias.globais).toHaveLength(3)
    expect(r.referencias.fora).toEqual([])
    expect(r.aprendizados.globais).toHaveLength(3)
    expect(r.failOpen).toBe(false)
  })
  it("avisos carregam o slug", () => {
    const r = filtrarPorToque({
      referencias: [{ slug: "x", emails: "1" }],
      aprendizados: [{ slug: "y", serve_a: ["primeiro"] }],
      flowType: "welcome",
      emailNumber: 1,
    })
    expect(r.referencias.avisos[0]).toMatch(/^x: /)
    expect(r.aprendizados.avisos[0]).toMatch(/^y: /)
  })
  it("vaultPorToqueLigado: só `off` desliga", () => {
    expect(vaultPorToqueLigado({})).toBe(true)
    expect(vaultPorToqueLigado({ VAULT_POR_TOQUE: "off" })).toBe(false)
    expect(vaultPorToqueLigado({ VAULT_POR_TOQUE: "OFF " })).toBe(false)
    expect(vaultPorToqueLigado({ VAULT_POR_TOQUE: "on" })).toBe(true)
  })
})
