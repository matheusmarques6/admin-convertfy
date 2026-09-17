import { describe, expect, it } from "vitest"

import { avisoDeCacheOrfao, medirFrescor, type LinhaDeCache } from "./frescor"

const AGORA = new Date("2026-09-15T23:00:00Z").getTime()
const hAtras = (h: number) => new Date(AGORA - h * 3_600_000).toISOString()

const linha = (p: Partial<LinhaDeCache> & { storeId: string }): LinhaDeCache => ({
  storeName: p.storeId,
  fetchedAt: hAtras(0.1),
  syncStatus: "ok",
  ...p,
})

describe("medirFrescor", () => {
  it("a idade sai da linha renovável mais antiga", () => {
    const r = medirFrescor(
      [
        linha({ storeId: "a", fetchedAt: hAtras(0.2) }),
        linha({ storeId: "b", fetchedAt: hAtras(3) }),
      ],
      new Set(["a", "b"]),
      AGORA,
    )
    expect(r.maisAntiga).toBe(hAtras(3))
    expect(r.orfaos).toEqual([])
  })

  // O caso medido em 15/09: 54 linhas sincronizadas minutos antes e UMA de
  // 13 dias, de uma loja sem chave. Ela ancorava a idade e o dashboard
  // ficava "desatualizado" para sempre, disparando o auto-sync em toda
  // abertura — que é o "clico em sincronizar e ele não sincroniza".
  it("linha de loja que o sync não alcança NÃO envelhece o dashboard", () => {
    const r = medirFrescor(
      [
        linha({ storeId: "viva", fetchedAt: hAtras(0.2) }),
        linha({ storeId: "orfa", storeName: "Cronos Alemã", fetchedAt: hAtras(24 * 13) }),
      ],
      new Set(["viva"]),
      AGORA,
    )
    expect(r.maisAntiga).toBe(hAtras(0.2))
    expect(r.orfaos).toEqual([
      expect.objectContaining({ storeId: "orfa", storeName: "Cronos Alemã", diasParado: 13 }),
    ])
  })

  // Não é a idade que a desqualifica como âncora — é não ter como ser
  // renovada. Chave removida agora mesmo já sai da conta.
  it("órfã recente também não ancora, e não vira aviso", () => {
    const r = medirFrescor(
      [
        linha({ storeId: "viva", fetchedAt: hAtras(2) }),
        linha({ storeId: "orfa", fetchedAt: hAtras(0.1) }),
      ],
      new Set(["viva"]),
      AGORA,
    )
    expect(r.maisAntiga).toBe(hAtras(2))
    expect(r.orfaos).toEqual([])
  })

  it("linha de erro não ancora — zerada com carimbo novo diria 'fresco'", () => {
    const r = medirFrescor(
      [
        linha({ storeId: "a", fetchedAt: hAtras(5) }),
        linha({ storeId: "b", fetchedAt: hAtras(0.1), syncStatus: "error" }),
      ],
      new Set(["a", "b"]),
      AGORA,
    )
    expect(r.maisAntiga).toBe(hAtras(5))
  })

  it("sem carimbo de coleta: nunca ancora, e como órfã é DECLARADA", () => {
    const semCarimbo = medirFrescor([linha({ storeId: "x", fetchedAt: null })], new Set(["x"]), AGORA)
    expect(semCarimbo.maisAntiga).toBeNull()

    const orfaSemCarimbo = medirFrescor([linha({ storeId: "x", fetchedAt: null })], new Set(), AGORA)
    expect(orfaSemCarimbo.orfaos).toEqual([expect.objectContaining({ diasParado: null })])
  })

  it("data ilegível não vira idade negativa nem NaN", () => {
    const r = medirFrescor([linha({ storeId: "x", fetchedAt: "não é data" })], new Set(), AGORA)
    expect(r.maisAntiga).toBeNull()
    expect(r.orfaos[0]?.diasParado).toBeNull()
  })

  // Todas órfãs é o caso em que a tela DEVE dizer desatualizado: o
  // chamador trata `null` como idade desconhecida.
  it("carteira inteira órfã devolve âncora nula", () => {
    const r = medirFrescor([linha({ storeId: "a", fetchedAt: hAtras(48) })], new Set(), AGORA)
    expect(r.maisAntiga).toBeNull()
    expect(r.orfaos).toHaveLength(1)
  })

  it("lista vazia não inventa nada", () => {
    expect(medirFrescor([], new Set(), AGORA)).toEqual({ maisAntiga: null, orfaos: [] })
  })
})

describe("avisoDeCacheOrfao", () => {
  it("sem órfã, sem aviso", () => {
    expect(avisoDeCacheOrfao([])).toBeNull()
  })

  it("nomeia a loja e diz que o número continua contando", () => {
    const aviso = avisoDeCacheOrfao([
      { storeId: "a", storeName: "Cronos Alemã", fetchedAt: hAtras(300), diasParado: 13 },
    ])
    expect(aviso).toContain("Cronos Alemã")
    expect(aviso).toContain("1 loja")
    expect(aviso).toMatch(/ainda entra/)
  })

  it("acima de três, resume o resto em vez de listar tudo", () => {
    const aviso = avisoDeCacheOrfao(
      ["a", "b", "c", "d", "e"].map((s) => ({
        storeId: s,
        storeName: s.toUpperCase(),
        fetchedAt: null,
        diasParado: null,
      })),
    )
    expect(aviso).toContain("A, B, C e mais 2")
    expect(aviso).toContain("5 lojas")
  })
})
