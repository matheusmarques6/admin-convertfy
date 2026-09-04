import { describe, expect, it } from "vitest"
import {
  contentHash,
  extractInlineTags,
  extractWikilinks,
  makeExcerpt,
  normalizeNoteName,
  parseKnowledgeNote,
} from "./knowledge-parse"
import { isKnowledgeHousekeeping } from "./knowledge-sync"

describe("isKnowledgeHousekeeping", () => {
  it("nota na raiz vale; ocultas, templates e índices não", () => {
    expect(isKnowledgeHousekeeping("Nota.md")).toBe(false)
    expect(isKnowledgeHousekeeping("Advisors/Max.md")).toBe(false)
    expect(isKnowledgeHousekeeping(".obsidian/app.json")).toBe(true)
    expect(isKnowledgeHousekeeping("Templates/base.md")).toBe(true)
    expect(isKnowledgeHousekeeping("Popups/_INDEX.md")).toBe(true)
    expect(isKnowledgeHousekeeping("README.md")).toBe(true)
  })
})

describe("normalizeNoteName / extractWikilinks", () => {
  it("normaliza por nome, sem acento e sem .md", () => {
    expect(normalizeNoteName("Popup de Saída.md")).toBe("popup de saida")
    expect(normalizeNoteName("  Copy   Longa ")).toBe("copy longa")
  })
  it("extrai alvos de [[link]], [[link|alias]], [[link#h]] e [[pasta/link]]", () => {
    const body = "Ver [[Popup de Saída]] e [[Copy/Headline|a headline]] e [[Welcome Flow#Email 1]] e [[Popup de Saída]] de novo."
    expect(extractWikilinks(body)).toEqual(["popup de saida", "headline", "welcome flow"])
  })
})

describe("extractInlineTags", () => {
  it("pega #tag fora de código, ignora números e âncoras de heading", () => {
    const body = "# Título\nTexto com #popup e #copy/headline. `#nao` e\n```\n#tambem-nao\n```\n#2024 não conta"
    expect(extractInlineTags(body)).toEqual(["popup", "copy/headline"])
  })
})

describe("parseKnowledgeNote", () => {
  const md = `---
title: Max Sutherland
tipo: advisor
status: aprovado
tags: [copy, persuasão]
aliases: [Max]
---
# Max Sutherland

Advisor de copy. Regras: [[Copy Longa]] e [[Objeções/Preço|preço]]. #headline
`
  it("monta a nota com título, kind, tags, links, aliases e ativo", () => {
    const n = parseKnowledgeNote("Advisors/Max Sutherland.md", md, { advisorsFolder: "Advisors" })
    expect(n.title).toBe("Max Sutherland")
    expect(n.folder).toBe("Advisors")
    expect(n.kind).toBe("advisor")
    expect(n.isActive).toBe(true)
    expect(n.tags).toEqual(["copy", "persuasão", "headline"])
    expect(n.links).toEqual(["copy longa", "preco"])
    expect(n.aliases).toEqual(["max"])
    expect(n.excerpt).toContain("Advisor de copy. Regras: Copy Longa e preço.")
    expect(n.wordCount).toBeGreaterThan(5)
    expect(n.contentHash).toBe(contentHash(`Max Sutherland\n${n.body}`))
  })

  it("rascunho fica inativo; advisor pela pasta mesmo sem tipo; título do H1/arquivo", () => {
    const a = parseKnowledgeNote("Advisors/Sub/Ana.md", "# Ana Advisor\n\ncorpo", { advisorsFolder: "Advisors" })
    expect(a.kind).toBe("advisor")
    expect(a.isActive).toBe(false)
    expect(a.title).toBe("Ana Advisor")
    const b = parseKnowledgeNote("Popups/Roleta.md", "---\nstatus: aprovada\n---\ncorpo", { advisorsFolder: "Advisors" })
    expect(b.kind).toBe("nota")
    expect(b.isActive).toBe(true)
    expect(b.title).toBe("Roleta")
  })
})

describe("makeExcerpt", () => {
  it("tira headings, código, imagens e marcação; corta no máximo", () => {
    const e = makeExcerpt("# T\n\n**negrito** e `code` ![img](x.png)\n```\nbloco\n```\n" + "x".repeat(500), 50)
    expect(e.startsWith("negrito e")).toBe(true)
    expect(e).toHaveLength(50)
  })
})
