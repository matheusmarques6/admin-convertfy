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

  it("rascunho fica inativo; advisor solto na raiz da pasta; título do H1/arquivo", () => {
    const a = parseKnowledgeNote("Advisors/Ana.md", "# Ana Advisor\n\ncorpo", { advisorsFolder: "Advisors" })
    expect(a.kind).toBe("advisor")
    expect(a.isActive).toBe(false)
    // Advisor de nota única tem o nome no arquivo, não numa subpasta —
    // aqui o H1 continua mandando.
    expect(a.title).toBe("Ana Advisor")
    const b = parseKnowledgeNote("Popups/Roleta.md", "---\nstatus: aprovada\n---\ncorpo", { advisorsFolder: "Advisors" })
    expect(b.kind).toBe("nota")
    expect(b.isActive).toBe(true)
    expect(b.title).toBe("Roleta")
  })

  it("o corpus do advisor é NOTA, não persona", () => {
    // `Advisors/Max/` tem 123 notas (doutrina, flows, copy, registro).
    // Marcar todas como advisor enchia o menu do composer com 123 entradas
    // no lugar de um "Max" — e o bloco de persona do prompt viraria sorteio.
    const corpus = parseKnowledgeNote(
      "Advisors/Max/doutrina/roubar-e-o-metodo.md",
      "---\ntipo: principio\nstatus: aprovado\n---\n# Roubar é o método\n\ncorpo",
      { advisorsFolder: "Advisors" },
    )
    expect(corpus.kind).toBe("nota")
    // Continua indexado e buscável — só não é uma persona.
    expect(corpus.isActive).toBe(true)
    expect(corpus.title).toBe("Roubar é o método")
  })

  it("a persona na subpasta vira advisor e herda o nome da PASTA", () => {
    // A persona costuma abrir com heading de orientação; sem esta regra o
    // menu mostrava "Onde esta nota entra" em vez de "Max".
    const p = parseKnowledgeNote(
      "Advisors/Max/persona.md",
      "---\ntipo: persona\nstatus: aprovado\n---\n# Onde esta nota entra\n\ncorpo",
      { advisorsFolder: "Advisors" },
    )
    expect(p.kind).toBe("advisor")
    expect(p.title).toBe("Max")

    // `title:` explícito continua vencendo a pasta.
    const comTitulo = parseKnowledgeNote(
      "Advisors/Max/persona.md",
      "---\ntipo: persona\ntitle: Max Sturtevant\n---\n# Onde esta nota entra",
      { advisorsFolder: "Advisors" },
    )
    expect(comTitulo.title).toBe("Max Sturtevant")
  })

  it("`tipo: advisor` fora da pasta de advisors continua valendo", () => {
    const n = parseKnowledgeNote("Metodo/Fulano.md", "---\ntipo: advisor\n---\n# Fulano", {
      advisorsFolder: "Advisors",
    })
    expect(n.kind).toBe("advisor")
    // Fora da pasta de advisors não há pasta de onde herdar nome.
    expect(n.title).toBe("Fulano")
  })
})

describe("makeExcerpt", () => {
  it("tira headings, código, imagens e marcação; corta no máximo", () => {
    const e = makeExcerpt("# T\n\n**negrito** e `code` ![img](x.png)\n```\nbloco\n```\n" + "x".repeat(500), 50)
    expect(e.startsWith("negrito e")).toBe(true)
    expect(e).toHaveLength(50)
  })
})
