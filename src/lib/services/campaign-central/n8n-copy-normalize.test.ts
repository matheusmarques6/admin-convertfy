import { describe, it, expect } from "vitest"
import {
  sanitizeN8nCopyPayload,
  deriveSubjectFromCopy,
  parseStructureSections,
  hasText,
  __internal,
} from "./n8n-copy-normalize"

const {
  coerceType,
  coerceColumns,
  coerceStatus,
  normalizeBlock,
  splitIntoSectionedTextBlocks,
  normalizeSectionLabel,
} = __internal

describe("coerceType", () => {
  it("mantém os 8 tipos canônicos", () => {
    for (const t of ["image", "heading", "text", "offer", "button", "divider", "footer", "products"]) {
      expect(coerceType(t)).toBe(t)
    }
  })

  it("normaliza caixa/espaços", () => {
    expect(coerceType("  HEADING ")).toBe("heading")
    expect(coerceType("Text")).toBe("text")
  })

  it("mapeia sinônimos comuns do LLM", () => {
    expect(coerceType("paragraph")).toBe("text")
    expect(coerceType("cta")).toBe("button")
    expect(coerceType("hero")).toBe("image")
    expect(coerceType("spacer")).toBe("divider")
    expect(coerceType("product_list")).toBe("products")
    expect(coerceType("coupon")).toBe("offer")
    expect(coerceType("title")).toBe("heading")
  })

  it("tipo desconhecido ou não-string vira text (nunca derruba o payload)", () => {
    expect(coerceType("quantum_block")).toBe("text")
    expect(coerceType(42)).toBe("text")
    expect(coerceType(undefined)).toBe("text")
    expect(coerceType(null)).toBe("text")
  })
})

describe("coerceColumns", () => {
  it("aceita number e string", () => {
    expect(coerceColumns(2)).toBe(2)
    expect(coerceColumns(3)).toBe(3)
    expect(coerceColumns("2")).toBe(2)
    expect(coerceColumns(" 3 ")).toBe(3)
  })

  it("inválido vira undefined (campo removido)", () => {
    expect(coerceColumns(1)).toBeUndefined()
    expect(coerceColumns(4)).toBeUndefined()
    expect(coerceColumns("abc")).toBeUndefined()
    expect(coerceColumns(null)).toBeUndefined()
  })
})

describe("coerceStatus", () => {
  it("reconhece variações de sucesso", () => {
    expect(coerceStatus("success")).toBe("success")
    expect(coerceStatus("completed")).toBe("success")
    expect(coerceStatus("OK")).toBe("success")
    expect(coerceStatus("done")).toBe("success")
  })

  it("reconhece variações de erro", () => {
    expect(coerceStatus("error")).toBe("error")
    expect(coerceStatus("failed")).toBe("error")
    expect(coerceStatus("erro")).toBe("error")
  })

  it("status irreconhecível é mantido (schema decide)", () => {
    expect(coerceStatus("weird")).toBe("weird")
    expect(coerceStatus(undefined)).toBeUndefined()
  })
})

describe("normalizeBlock", () => {
  it("coage type inválido, columns string e price number", () => {
    const out = normalizeBlock({
      type: "paragraph",
      value: "oi",
      columns: "3",
      items: [{ name: "Produto", price: 199 }],
    })
    expect(out.type).toBe("text")
    expect(out.columns).toBe(3)
    expect((out.items as Array<Record<string, unknown>>)[0].price).toBe("199")
  })

  it("remove columns inválido e id não-string", () => {
    const out = normalizeBlock({ type: "products", columns: 7, id: 12345 })
    expect(out.columns).toBeUndefined()
    expect("columns" in out).toBe(false)
    expect("id" in out).toBe(false)
  })

  it("coage campos de texto number/boolean → string", () => {
    const out = normalizeBlock({ type: "heading", headline: 2026, sub: true })
    expect(out.headline).toBe("2026")
    expect(out.sub).toBe("true")
  })

  it("bloco não-objeto vira bloco de texto", () => {
    expect(normalizeBlock("texto solto")).toEqual({ type: "text", value: "texto solto" })
  })

  it("mapeia nomes de campo alternativos pros canônicos (body→value, cta_text→value, title→headline)", () => {
    expect(normalizeBlock({ type: "text", body: "Corpo do email" })).toEqual({
      type: "text",
      value: "Corpo do email",
    })
    expect(normalizeBlock({ type: "button", cta_text: "Comprar agora" })).toEqual({
      type: "button",
      value: "Comprar agora",
    })
    expect(normalizeBlock({ type: "heading", title: "Título", subtitle: "Sub" })).toEqual({
      type: "heading",
      headline: "Título",
      sub: "Sub",
    })
  })

  it("campo canônico direto vence o sinônimo", () => {
    expect(normalizeBlock({ type: "text", value: "Direto", body: "Alias" })).toEqual({
      type: "text",
      value: "Direto",
    })
  })

  it("mapeia sinônimos dentro de items de products (title→name, cost→price)", () => {
    const out = normalizeBlock({
      type: "products",
      items: [{ title: "Produto X", cost: 199 }],
    })
    expect((out.items as Array<Record<string, unknown>>)[0]).toEqual({
      name: "Produto X",
      price: "199",
    })
  })
})

describe("sanitizeN8nCopyPayload", () => {
  it("normaliza status e PRESERVA bloco tipado (cta→button) sem mutar a entrada", () => {
    const input = {
      job_id: "j",
      suggestion_id: "s",
      store_id: "st",
      mode: "test",
      status: "completed",
      copy: {
        subject: "Assunto",
        preheader: "pre",
        blocks: [{ type: "cta", value: "Comprar" }],
      },
    }
    const out = sanitizeN8nCopyPayload(input)
    expect(out.status).toBe("success")
    // Bloco tipado é PRESERVADO (cta→button), não colapsado em texto.
    expect((out.copy as Record<string, unknown>).blocks).toEqual([
      { type: "button", value: "Comprar" },
    ])
    // não muta a entrada
    expect(input.status).toBe("completed")
    expect((input.copy.blocks[0] as Record<string, unknown>).type).toBe("cta")
  })

  it("PRESERVA blocos tipados (heading/text/products/button) com seus campos", () => {
    const out = sanitizeN8nCopyPayload({
      status: "success",
      copy: {
        subject: "S",
        preheader: "P",
        blocks: [
          { id: "b1", type: "heading", headline: "Novidades que combinam com você" },
          { id: "b2", type: "text", value: "Selecionamos peças pensando no seu estilo." },
          {
            id: "b3",
            type: "products",
            columns: 3,
            items: [{ name: "Vestido Lia", price: "R$ 189", image_caption: "Vestido midi off-white" }],
          },
          { id: "b4", type: "button", value: "Ver coleção" },
        ],
      },
    })
    const blocks = (out.copy as Record<string, unknown>).blocks as Array<Record<string, unknown>>
    expect(blocks).toHaveLength(4)
    expect(blocks[0]).toMatchObject({ type: "heading", headline: "Novidades que combinam com você" })
    expect(blocks[1]).toMatchObject({
      type: "text",
      value: "Selecionamos peças pensando no seu estilo.",
    })
    expect(blocks[2]).toMatchObject({ type: "products", columns: 3 })
    expect((blocks[2].items as Array<Record<string, unknown>>)[0]).toMatchObject({
      name: "Vestido Lia",
      price: "R$ 189",
      image_caption: "Vestido midi off-white",
    })
    expect(blocks[3]).toMatchObject({ type: "button", value: "Ver coleção" })
  })

  it("colapsa em texto e fatia por seção quando o n8n manda só texto (## TAG)", () => {
    const out = sanitizeN8nCopyPayload({
      status: "success",
      copy: {
        subject: "S",
        preheader: "P",
        blocks: [{ type: "text", value: "## HERO\nOlá\n\n## FOOTER\nTchau" }],
      },
    })
    const blocks = (out.copy as Record<string, unknown>).blocks
    expect(blocks).toEqual([
      { type: "text", section: "HERO", value: "Olá" },
      { type: "text", section: "FOOTER", value: "Tchau" },
    ])
  })

  it("preserva identificadores do job (não coage job_id/mode)", () => {
    const out = sanitizeN8nCopyPayload({
      job_id: "JOB-1",
      suggestion_id: "SUG-1",
      store_id: "ST-1",
      mode: "production",
      status: "error",
      error_message: "x",
    })
    expect(out.job_id).toBe("JOB-1")
    expect(out.mode).toBe("production")
    expect(out.status).toBe("error")
  })

  it("não inventa conteúdo: subject vazio permanece vazio (segue inválido no schema)", () => {
    const out = sanitizeN8nCopyPayload({
      status: "success",
      copy: { subject: "", preheader: "p", blocks: [{ type: "text", value: "x" }] },
    })
    expect((out.copy as Record<string, unknown>).subject).toBe("")
  })

  it("payload sem copy não quebra", () => {
    const out = sanitizeN8nCopyPayload({ status: "error", error_message: "falhou" })
    expect(out.status).toBe("error")
    expect(out.copy).toBeUndefined()
  })
})

describe("hasText", () => {
  it("true só para string com conteúdo (após trim)", () => {
    expect(hasText("abc")).toBe(true)
    expect(hasText("  x ")).toBe(true)
    expect(hasText("")).toBe(false)
    expect(hasText("   ")).toBe(false)
    expect(hasText(123)).toBe(false)
    expect(hasText(null)).toBe(false)
    expect(hasText(undefined)).toBe(false)
  })
})

describe("deriveSubjectFromCopy", () => {
  it("deriva o assunto da 1ª linha da copy", () => {
    const out = deriveSubjectFromCopy({
      blocks: [{ type: "text", value: "Sua oferta chegou\nveja os detalhes abaixo" }],
    })
    expect(out).toBe("Sua oferta chegou")
  })

  it("usa o conteúdo do 1º bloco quando há vários (heading vence)", () => {
    const out = deriveSubjectFromCopy({
      blocks: [
        { type: "heading", headline: "Bem-vindo de volta" },
        { type: "text", value: "Corpo do email aqui" },
      ],
    })
    expect(out).toBe("Bem-vindo de volta")
  })

  it("trunca linha longa em ~60 chars com reticências", () => {
    const long = "x".repeat(80)
    const out = deriveSubjectFromCopy({ blocks: [{ type: "text", value: long }] })
    expect(out.length).toBeLessThanOrEqual(60)
    expect(out.endsWith("…")).toBe(true)
    expect(out).toBe("x".repeat(59) + "…")
  })

  it("retorna vazio quando não há texto algum (não mascara payload vazio)", () => {
    expect(deriveSubjectFromCopy({ blocks: [] })).toBe("")
    expect(deriveSubjectFromCopy({ blocks: [{ type: "divider" }] })).toBe("")
    expect(deriveSubjectFromCopy({})).toBe("")
    expect(deriveSubjectFromCopy(null)).toBe("")
    expect(deriveSubjectFromCopy("nope")).toBe("")
  })

  it("ignora a linha do marcador ## e pega a 1ª linha de texto real", () => {
    const out = deriveSubjectFromCopy({
      blocks: [{ type: "text", value: "## HERO\nSua oferta chegou\nveja abaixo" }],
    })
    expect(out).toBe("Sua oferta chegou")
  })
})

describe("splitIntoSectionedTextBlocks (fatiamento por seção)", () => {
  it("fatia a copy por marcadores ## SEÇÃO em blocos rotulados, na ordem", () => {
    const out = splitIntoSectionedTextBlocks([
      {
        type: "text",
        value:
          "## HERO\nBem-vindo de volta!\n\n## REVIEW\n5 estrelas de clientes reais.\n\n## FOOTER\nDescadastre quando quiser.",
      },
    ])
    expect(out).toEqual([
      { type: "text", section: "HERO", value: "Bem-vindo de volta!" },
      { type: "text", section: "REVIEW", value: "5 estrelas de clientes reais." },
      { type: "text", section: "FOOTER", value: "Descadastre quando quiser." },
    ])
  })

  it("normaliza o rótulo do marcador (maiúsculas, espaços colapsados)", () => {
    const out = splitIntoSectionedTextBlocks([
      { type: "text", value: "## Hero  principal\nConteúdo." },
    ])
    expect(out).toEqual([{ type: "text", section: "HERO PRINCIPAL", value: "Conteúdo." }])
  })

  it("NÃO confunde placeholders [X] com seções (só ## em linha própria fatia)", () => {
    const out = splitIntoSectionedTextBlocks([
      {
        type: "text",
        value:
          "## HERO\n[LOGO] Olá [NOME], temos [NÚMERO]+ clientes felizes.\n\n## CTA\nAproveite [NOME]!",
      },
    ])
    expect(out).toEqual([
      {
        type: "text",
        section: "HERO",
        value: "[LOGO] Olá [NOME], temos [NÚMERO]+ clientes felizes.",
      },
      { type: "text", section: "CTA", value: "Aproveite [NOME]!" },
    ])
  })

  it("agrupa blocos já rotulados pelo n8n (campo section) — caminho 1", () => {
    const out = splitIntoSectionedTextBlocks([
      { type: "heading", section: "HERO", headline: "Título" },
      { type: "text", section: "HERO", value: "Subtítulo do hero." },
      { type: "text", section: "REVIEW", value: "Depoimento." },
    ])
    expect(out).toEqual([
      { type: "text", section: "HERO", value: "Título\n\nSubtítulo do hero." },
      { type: "text", section: "REVIEW", value: "Depoimento." },
    ])
  })

  it("preâmbulo antes do 1º ## vira bloco sem label", () => {
    const out = splitIntoSectionedTextBlocks([
      { type: "text", value: "Introdução solta.\n\n## CORPO\nMiolo do email." },
    ])
    expect(out).toEqual([
      { type: "text", value: "Introdução solta." },
      { type: "text", section: "CORPO", value: "Miolo do email." },
    ])
  })

  it("sem marcação nenhuma → 1 bloco único (fallback, sem regressão)", () => {
    const out = splitIntoSectionedTextBlocks([
      { type: "heading", headline: "Título" },
      { type: "text", value: "Corpo." },
    ])
    expect(out).toEqual([{ type: "text", value: "Título\n\nCorpo." }])
  })

  it("mantém seção rotulada mesmo sem corpo (sinaliza seção vazia)", () => {
    const out = splitIntoSectionedTextBlocks([
      { type: "text", value: "## HERO\n\n## FOOTER\nRodapé." },
    ])
    expect(out).toEqual([
      { type: "text", section: "HERO", value: "" },
      { type: "text", section: "FOOTER", value: "Rodapé." },
    ])
  })

  it("copy sem texto algum → [] (deixa o schema rejeitar; não inventa bloco vazio)", () => {
    expect(splitIntoSectionedTextBlocks([])).toEqual([])
    expect(splitIntoSectionedTextBlocks([{ type: "divider" }])).toEqual([])
  })
})

describe("sanitizeN8nCopyPayload — seções", () => {
  it("persiste blocos rotulados quando a copy do n8n traz ## SEÇÃO", () => {
    const out = sanitizeN8nCopyPayload({
      status: "success",
      copy: {
        subject: "S",
        preheader: "P",
        blocks: [{ type: "text", value: "## HERO\nOlá\n\n## FOOTER\nTchau" }],
      },
    })
    const blocks = (out.copy as Record<string, unknown>).blocks
    expect(blocks).toEqual([
      { type: "text", section: "HERO", value: "Olá" },
      { type: "text", section: "FOOTER", value: "Tchau" },
    ])
  })
})

describe("normalizeSectionLabel", () => {
  it("trim + maiúsculas + colapsa espaços", () => {
    expect(normalizeSectionLabel("  hero   principal ")).toBe("HERO PRINCIPAL")
  })

  it("trunca rótulos muito longos (~40 chars)", () => {
    expect(normalizeSectionLabel("x".repeat(60)).length).toBeLessThanOrEqual(40)
  })
})

describe("parseStructureSections", () => {
  it("extrai as seções ## da estrutura do COO (ignora o preâmbulo)", () => {
    const structure = `OBJETIVO
Vender mais.

ESTRUTURA DO EMAIL
## HERO
Gancho forte.

## CTA
Compre já.`
    expect(parseStructureSections(structure)).toEqual([
      { tag: "HERO", instructions: "Gancho forte." },
      { tag: "CTA", instructions: "Compre já." },
    ])
  })

  it("estrutura sem marcadores → lista vazia", () => {
    expect(parseStructureSections("Só texto livre, sem seções.")).toEqual([])
    expect(parseStructureSections("")).toEqual([])
    expect(parseStructureSections(null)).toEqual([])
    expect(parseStructureSections(undefined)).toEqual([])
  })
})
