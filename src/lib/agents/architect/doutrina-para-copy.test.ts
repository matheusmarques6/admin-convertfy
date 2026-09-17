import { describe, expect, it } from "vitest"

import { doutrinaParaCopy } from "./doutrina-para-copy"
import { emptyCuradorVaultKnowledge, indexVaultDocs, type VaultDocRow } from "./curador-vault"

const doc = (over: Partial<VaultDocRow>): VaultDocRow => ({
  kind: "doutrina",
  grupo: null,
  slug: "x",
  variant_id: null,
  frontmatter: {},
  body_md: "",
  ...over,
})

const K = indexVaultDocs([
  doc({ slug: "hero-promessa", frontmatter: { secao: "hero", fonte: "Curso A" }, body_md: "Uma promessa por hero. O resto vira ruído." }),
  doc({ slug: "assunto-curto", frontmatter: { secao: ["assunto"], fonte: "Curso B" }, body_md: "Assunto de até 40 caracteres." }),
  doc({ slug: "tom-geral", frontmatter: { fonte: "Curso C" }, body_md: "Fala com uma pessoa, não com uma lista." }),
])

describe("doutrinaParaCopy", () => {
  it("roteia pela seção e entrega o contrato publicado", () => {
    const d = doutrinaParaCopy(K, ["hero", "assunto"])
    expect(d.map((x) => x.slug)).toEqual(["hero-promessa", "assunto-curto", "tom-geral"])
    expect(d[0]).toMatchObject({ secao: "hero", fonte: "Curso A" })
    // `primeiraFrase` é a primeira LINHA útil da nota, não a oração até o
    // ponto — é a régua que o índice do vault já usa.
    expect(d[0].resumo).toBe("Uma promessa por hero. O resto vira ruído.")
    expect(d[0].corpo).toContain("O resto vira ruído.")
  })

  // O que o teto corta é o conselho que vale para toda peça, nunca o que
  // fala desta seção.
  it("específica antes de geral", () => {
    const d = doutrinaParaCopy(K, ["hero"])
    expect(d.map((x) => x.slug)).toEqual(["hero-promessa", "tom-geral"])
    expect(d[1].secao).toBe("geral")
  })

  it("a nota geral entra UMA vez, por mais seções que a peça tenha", () => {
    const d = doutrinaParaCopy(K, ["hero", "body", "products", "footer", "assunto"])
    expect(d.filter((x) => x.slug === "tom-geral")).toHaveLength(1)
  })

  it("seção sem doutrina não inventa nota; vault vazio devolve lista vazia", () => {
    expect(doutrinaParaCopy(K, ["reviews"]).map((x) => x.slug)).toEqual(["tom-geral"])
    expect(doutrinaParaCopy(emptyCuradorVaultKnowledge(), ["hero"])).toEqual([])
    expect(doutrinaParaCopy(K, [])).toEqual([])
  })

  it("corpo é cortado no teto do contrato", () => {
    const grande = indexVaultDocs([doc({ slug: "longa", frontmatter: { secao: "hero" }, body_md: "x".repeat(5000) })])
    const c = doutrinaParaCopy(grande, ["hero"])[0].corpo
    expect(c.length).toBeLessThanOrEqual(3001)
    expect(c.endsWith("…")).toBe(true)
  })

  it("nota sem fonte declarada vem com fonte nula, não com string vazia", () => {
    const k = indexVaultDocs([doc({ slug: "sem-fonte", frontmatter: { secao: "body" }, body_md: "regra" })])
    expect(doutrinaParaCopy(k, ["body"])[0].fonte).toBeNull()
  })
})
