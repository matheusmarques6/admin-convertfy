import { describe, it, expect } from "vitest"

import {
  resolveCopyValue,
  copyKeyCandidates,
  tagIndex,
} from "./copy-key-resolve"

// O caso REAL (Luxe Lift, 30/jul): schema no vocabulário do Taguedor
// (`hero_cta_label`), n8n devolvendo no vocabulário do tag-registry
// (`cta`). O merge lia só o primeiro e os dois botões saíram do forno como
// {{HERO_CTA_LABEL}} e {{HERO_CTA_2_LABEL}}.
describe("resolveCopyValue — os dois vocabulários", () => {
  const conteudoDoN8n = {
    headline: "Four bras for the price of one.",
    body: "That strap that slips…",
    cta: "Go back to my cart",
    url: "https://loja/produto",
  }

  it("acha pelo copyKey canônico quando a key do schema não existe", () => {
    const r = resolveCopyValue(conteudoDoN8n, {
      key: "hero_cta_label",
      tag: "{{HERO_CTA_LABEL}}",
    })
    expect(r.value).toBe("Go back to my cart")
    expect(r.source).toBe("canonical_copy_key")
    expect(r.matchedKey).toBe("cta")
  })

  it("headline e body também resolvem", () => {
    expect(
      resolveCopyValue(conteudoDoN8n, {
        key: "hero_headline",
        tag: "HERO_HEADLINE",
      }).value,
    ).toBe("Four bras for the price of one.")
    expect(
      resolveCopyValue(conteudoDoN8n, { key: "hero_body", tag: "HERO_BODY" })
        .value,
    ).toBe("That strap that slips…")
  })

  it("a key do schema tem precedência sobre o canônico", () => {
    const r = resolveCopyValue(
      { hero_cta_label: "valor do schema", cta: "valor canônico" },
      { key: "hero_cta_label", tag: "HERO_CTA_LABEL" },
    )
    expect(r.value).toBe("valor do schema")
    expect(r.source).toBe("schema_key")
  })

  // A regra que impede o pior resultado: os dois botões com o mesmo texto.
  it("CTA indexado NÃO herda o valor do primeiro", () => {
    const r = resolveCopyValue(conteudoDoN8n, {
      key: "hero_cta_2_label",
      tag: "{{HERO_CTA_2_LABEL}}",
    })
    expect(r.value).toBeNull()
    expect(r.source).toBeNull()
  })

  it("CTA indexado aceita chave indexada", () => {
    for (const content of [
      { cta_2: "Central de ajuda" },
      { cta2: "Central de ajuda" },
    ]) {
      expect(
        resolveCopyValue(content, {
          key: "hero_cta_2_label",
          tag: "HERO_CTA_2_LABEL",
        }).value,
      ).toBe("Central de ajuda")
    }
  })

  it("campo sem tag só tenta a key do schema", () => {
    expect(
      resolveCopyValue(conteudoDoN8n, { key: "hero_cta_label", tag: null })
        .value,
    ).toBeNull()
  })

  it("tag fora do vocabulário canônico não inventa chave", () => {
    expect(
      resolveCopyValue(
        { algo: "x" },
        { key: "nao_existe", tag: "TAG_INVENTADA" },
      ).value,
    ).toBeNull()
  })

  it("valor vazio ou não-escalar conta como ausente", () => {
    for (const content of [
      { cta: "   " },
      { cta: null },
      { cta: { a: 1 } },
      { cta: [] },
    ]) {
      expect(
        resolveCopyValue(content, { key: "k", tag: "HERO_CTA_LABEL" }).value,
      ).toBeNull()
    }
  })

  it("número vira string (preço, contagem)", () => {
    expect(
      resolveCopyValue({ cta: 42 }, { key: "k", tag: "HERO_CTA_LABEL" }).value,
    ).toBe("42")
  })
})

describe("copyKeyCandidates — a ordem é o contrato", () => {
  it("schema key primeiro, canônico depois", () => {
    expect(copyKeyCandidates("hero_cta_label", "HERO_CTA_LABEL")).toEqual([
      "hero_cta_label",
      "cta",
    ])
  })

  it("indexado não inclui o canônico base", () => {
    const c = copyKeyCandidates("hero_cta_2_label", "HERO_CTA_2_LABEL")
    expect(c).toContain("cta_2")
    expect(c).not.toContain("cta")
  })
})

describe("tagIndex", () => {
  it("extrai o índice", () => {
    expect(tagIndex("HERO_CTA_2_LABEL")).toBe(2)
    expect(tagIndex("PRODUCT_10_NAME")).toBe(10)
  })

  it("sem índice devolve null", () => {
    expect(tagIndex("HERO_CTA_LABEL")).toBeNull()
    expect(tagIndex(null)).toBeNull()
    expect(tagIndex("")).toBeNull()
  })
})
