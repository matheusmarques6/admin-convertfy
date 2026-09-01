import { describe, it, expect } from "vitest"
import {
  classifyPath,
  isVaultHousekeeping,
  isApproved,
  normalizeSecoes,
  parseFrontmatter,
  parseVaultFile,
  resolveWikilinks,
  validateNote,
} from "./vault-parser"

// Frontmatter real do vault (avelmore-inspecao-antecipada).
const ESTRUTURA_MD = `---
tipo: estrutura
slug: avelmore-inspecao-antecipada
flow_type: welcome
emails: [1]
escopo: geral
loja:
amostra: Avelmore — calçado de couro, ticket $49,95–$69,95
procedencia: nossa
status: aprovada
secoes: [header, hero, body, body, products, cta, reviews, footer]
performance:
---

Serve a intenção [[1|welcome 1]].

# A estrutura

Ver [[prova-de-terceiro-antes-do-cta]].
`

describe("parseFrontmatter", () => {
  it("parseia o frontmatter real de uma estrutura", () => {
    const { data, body, hasFrontmatter } = parseFrontmatter(ESTRUTURA_MD)
    expect(hasFrontmatter).toBe(true)
    expect(data.tipo).toBe("estrutura")
    expect(data.slug).toBe("avelmore-inspecao-antecipada")
    expect(data.emails).toEqual([1])
    expect(data.secoes).toEqual([
      "header", "hero", "body", "body", "products", "cta", "reviews", "footer",
    ])
    expect(data.loja).toBeNull()
    expect(data.performance).toBeNull()
    expect(body).toContain("Serve a intenção")
  })

  it("CRLF do Obsidian no Windows não quebra o parse", () => {
    const crlf = ESTRUTURA_MD.replace(/\n/g, "\r\n")
    const { data, hasFrontmatter } = parseFrontmatter(crlf)
    expect(hasFrontmatter).toBe(true)
    expect(data.slug).toBe("avelmore-inspecao-antecipada")
  })

  it("documento sem frontmatter é sinalizado, não inventado", () => {
    const r = parseFrontmatter("# Só corpo\ntexto")
    expect(r.hasFrontmatter).toBe(false)
    expect(r.data).toEqual({})
  })

  it("escalares: número, boolean, aspas", () => {
    const { data } = parseFrontmatter(
      `---\nemail_number: 3\nflag: true\nnome: "Com: dois pontos"\n---\ncorpo`,
    )
    expect(data.email_number).toBe(3)
    expect(data.flag).toBe(true)
    expect(data.nome).toBe("Com: dois pontos")
  })
})

describe("classifyPath", () => {
  it("intenções: número, _flow e _progressao", () => {
    expect(classifyPath("intencoes/welcome/1.md")).toEqual({
      tipo: "intencao", flowType: "welcome", slug: "1",
    })
    expect(classifyPath("intencoes/welcome/_flow.md")).toEqual({
      tipo: "intencao", flowType: "welcome", slug: "_flow",
    })
    expect(classifyPath("intencoes/welcome/_progressao.md")?.tipo).toBe("progressao")
  })

  it("aprendizado _global tem flowType null", () => {
    expect(classifyPath("aprendizados/_global/x.md")).toEqual({
      tipo: "aprendizado", flowType: null, slug: "x",
    })
  })

  it("fora do padrão → null", () => {
    expect(classifyPath("README.md")).toBeNull()
    expect(classifyPath("estruturas/welcome/sub/x.md")).toBeNull()
    expect(classifyPath("estruturas/welcome/x.txt")).toBeNull()
  })
})

describe("isVaultHousekeeping", () => {
  // O card "Notas puladas" existe para "editei e não valeu". O índice do
  // Obsidian nunca seria nota — listá-lo lá treina a ignorar o card.
  it("arquivo na raiz da base é faxina", () => {
    expect(isVaultHousekeeping("_INDEX.md")).toBe(true)
    expect(isVaultHousekeeping("README.md")).toBe(true)
  })

  it("pasta oculta e templates são faxina", () => {
    expect(isVaultHousekeeping(".obsidian/app.json")).toBe(true)
    expect(isVaultHousekeeping("Templates/nota.md")).toBe(true)
    expect(isVaultHousekeeping("_templates/nota.md")).toBe(true)
  })

  // Estes são erro de ARQUIVAMENTO — o motivo de o card existir.
  it("caminho errado dentro das pastas de nota NÃO é faxina", () => {
    expect(isVaultHousekeeping("estruturas/x.md")).toBe(false)
    expect(isVaultHousekeeping("estruturas/welcome/sub/x.md")).toBe(false)
    expect(isVaultHousekeeping("intencao/welcome/1.md")).toBe(false)
  })

  it("nota válida nunca é faxina", () => {
    expect(isVaultHousekeeping("intencoes/welcome/1.md")).toBe(false)
    expect(isVaultHousekeeping("aprendizados/_global/x.md")).toBe(false)
  })
})

describe("resolveWikilinks", () => {
  it("slug puro fica visível; rótulo diferente mantém os dois", () => {
    expect(resolveWikilinks("Ver [[deadline-falso-queima-o-proximo]].")).toBe(
      "Ver deadline-falso-queima-o-proximo.",
    )
    expect(resolveWikilinks("Serve [[1|welcome 1]].")).toBe(
      "Serve welcome 1 (→1).",
    )
    // Rótulo idêntico ao slug não duplica ([[1|1]] é comum no vault).
    expect(resolveWikilinks("Toque [[1|1]].")).toBe("Toque 1.")
  })
})

describe("normalizeSecoes — mapa de absorção", () => {
  it("caso completo do welcome #1: header e cta somem, papéis endereçados", () => {
    const r = normalizeSecoes([
      "header", "hero", "body", "body", "products", "cta", "reviews", "footer",
    ])
    expect(r.secoes).toEqual(["hero", "body", "body", "products", "reviews", "footer"])
    expect(r.absorcoes).toEqual([
      { secao: "header", destinoIndex: 0 },          // → hero
      { secao: "cta", destinoIndex: 3 },             // → products (anterior)
    ])
  })

  it("header sem hero (3/8 do welcome) vai para a primeira posição, seja qual for", () => {
    const r = normalizeSecoes(["header", "body", "body", "products", "footer"])
    expect(r.secoes[0]).toBe("body")
    expect(r.absorcoes).toEqual([{ secao: "header", destinoIndex: 0 }])
  })

  it("o #7 (header, offer, footer): offer NÃO é absorvido — é decisão do agente", () => {
    const r = normalizeSecoes(["header", "offer", "footer"])
    expect(r.secoes).toEqual(["offer", "footer"])
  })

  it("o #8 (carta, [body]) passa intacto — 1 posição pré E pós", () => {
    expect(normalizeSecoes(["body"])).toEqual({ secoes: ["body"], absorcoes: [] })
  })
})

describe("validateNote", () => {
  it("estrutura sem secoes reprova com motivo legível", () => {
    const errs = validateNote("estrutura", { tipo: "estrutura", status: "aprovada", emails: [1] }, { slug: "x" })
    expect(errs.join(" ")).toContain("secoes")
  })

  it("slug do frontmatter divergente do arquivo é erro (identificador canônico é o arquivo)", () => {
    const errs = validateNote(
      "estrutura",
      { tipo: "estrutura", status: "aprovada", emails: [1], secoes: ["hero"], slug: "outro" },
      { slug: "x" },
    )
    expect(errs.join(" ")).toContain("difere do nome do arquivo")
  })

  it("intenção de email exige email_number; _flow não", () => {
    expect(
      validateNote("intencao", { tipo: "intencao", status: "aprovada" }, { slug: "2" }).join(" "),
    ).toContain("email_number")
    expect(
      validateNote("intencao", { tipo: "intencao", status: "aprovada", escopo: "flow" }, { slug: "_flow" }),
    ).toEqual([])
  })

  it("aprendizado cross-flow exige aplica_a", () => {
    const errs = validateNote(
      "aprendizado",
      { tipo: "aprendizado", status: "aprovada", escopo: "cross-flow" },
      { slug: "x" },
    )
    expect(errs.join(" ")).toContain("aplica_a")
  })
})

describe("parseVaultFile — ponta a ponta", () => {
  it("nota real válida vira ParsedNote com wikilinks resolvidos", () => {
    const r = parseVaultFile("estruturas/welcome/avelmore-inspecao-antecipada.md", ESTRUTURA_MD)
    expect(r.skipped).toBeNull()
    expect(r.note?.slug).toBe("avelmore-inspecao-antecipada")
    expect(r.note?.body).toContain("welcome 1 (→1)")
    expect(isApproved(r.note!.frontmatter)).toBe(true)
  })

  it("nota inválida vira skipped com motivo — nunca exceção", () => {
    const r = parseVaultFile("estruturas/welcome/quebrada.md", "---\ntipo: estrutura\n---\ncorpo")
    expect(r.note).toBeNull()
    expect(r.skipped?.motivo).toContain("status")
  })

  it("status pendente parseia mas não é aprovada", () => {
    const md = ESTRUTURA_MD.replace("status: aprovada", "status: pendente")
    const r = parseVaultFile("estruturas/welcome/avelmore-inspecao-antecipada.md", md)
    expect(r.note).not.toBeNull()
    expect(isApproved(r.note!.frontmatter)).toBe(false)
  })
})

// ── Vault de componentes (Curador, 31/08) ─────────────────────────────────

import { docVariantId, isDocActive } from "./vault-parser"

describe("classifyPath — componentes/**", () => {
  it("notas de topo têm categoria pelo nome do arquivo", () => {
    expect(classifyPath("componentes/_protocolo-de-selecao.md")).toEqual({
      tipo: "componente_doc", flowType: null, slug: "_protocolo-de-selecao", docKind: "protocolo", docGrupo: null,
    })
    expect(classifyPath("componentes/_catalogo.md")?.docKind).toBe("catalogo")
    expect(classifyPath("componentes/_parametros-da-loja.md")?.docKind).toBe("parametros")
    // Nota nova na raiz sincroniza como 'outro' em vez de sumir.
    expect(classifyPath("componentes/_nota-nova.md")?.docKind).toBe("outro")
  })

  it("secoes/requisitos/convivencia/lacunas em profundidade 3", () => {
    const secao = classifyPath("componentes/secoes/_hero.md")
    expect(secao?.docKind).toBe("secao")
    expect(secao?.docGrupo).toBe("hero")
    expect(classifyPath("componentes/requisitos/cupom-ativo.md")?.docKind).toBe("requisito")
    expect(classifyPath("componentes/convivencia/prova-social-nao-duplica-na-peca.md")?.docKind).toBe("convivencia")
    expect(classifyPath("componentes/lacunas/cta-sem-variante.md")?.docKind).toBe("lacuna")
  })

  it("variantes e eixos em profundidade 4, com grupo do caminho", () => {
    const v = classifyPath("componentes/variantes/hero/hero-3-cupom-de-captacao.md")
    expect(v?.docKind).toBe("variante")
    expect(v?.docGrupo).toBe("hero")
    const e = classifyPath("componentes/eixos/momento/welcome-1.md")
    expect(e?.docKind).toBe("eixo")
    expect(e?.docGrupo).toBe("momento")
  })

  it("fora do padrão continua null (_html não é .md; profundidade errada)", () => {
    expect(classifyPath("componentes/_html/hero-3.html")).toBeNull()
    expect(classifyPath("componentes/x/y/z/w.md")).toBeNull()
    expect(classifyPath("componentes/desconhecida/nota.md")).toBeNull()
  })
})

describe("componente_doc — parse, ativação e variant_id", () => {
  const VARIANTE_MD = `---
tipo: componente
slug: hero-3-cupom-de-captacao
secao: hero
nome_no_banco: "welcome - hero section 3"
variant_id: d9e34a1f-7bc7-47e8-9081-53600b104dd2
ativa: true
momento: [welcome-1]
exige: [cupom-ativo, foto-estudio-fundo-claro]
peso: { altura_px: 949, classe: medio, fonte: medido }
status: aprovada
---

## Descrição curta

Entrega o cupom de captação. Ver [[_protocolo-de-selecao]].
`

  it("parseia nota de variante com docKind/docGrupo e frontmatter máquina", () => {
    const r = parseVaultFile("componentes/variantes/hero/hero-3-cupom-de-captacao.md", VARIANTE_MD)
    expect(r.skipped).toBeNull()
    expect(r.note?.tipo).toBe("componente_doc")
    expect(r.note?.docKind).toBe("variante")
    expect(r.note?.docGrupo).toBe("hero")
    expect(r.note?.frontmatter.momento).toEqual(["welcome-1"])
    expect(r.note?.frontmatter.exige).toEqual(["cupom-ativo", "foto-estudio-fundo-claro"])
    expect(r.note?.body).toContain("_protocolo-de-selecao")
    expect(docVariantId(r.note!.frontmatter)).toBe("d9e34a1f-7bc7-47e8-9081-53600b104dd2")
  })

  it("variant_id fora do formato UUID vira null (nunca quebra o insert)", () => {
    expect(docVariantId({ variant_id: "não-é-uuid" })).toBeNull()
    expect(docVariantId({})).toBeNull()
  })

  it("ativação: aprovada sempre; catálogo gerado também; lacuna aberta nunca", () => {
    expect(isDocActive("variante", { status: "aprovada" })).toBe(true)
    expect(isDocActive("catalogo", { status: "gerado" })).toBe(true)
    expect(isDocActive("variante", { status: "gerado" })).toBe(false)
    expect(isDocActive("lacuna", { status: "aberta" })).toBe(false)
  })

  it("sem status → skipped (contrato mínimo vale para componentes também)", () => {
    const r = parseVaultFile("componentes/requisitos/x.md", "---\ntipo: requisito\n---\ncorpo")
    expect(r.note).toBeNull()
    expect(r.skipped?.motivo).toContain("status")
  })
})
