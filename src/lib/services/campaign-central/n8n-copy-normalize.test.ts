import { describe, it, expect } from "vitest"
import { sanitizeN8nCopyPayload, __internal } from "./n8n-copy-normalize"

const { coerceType, coerceColumns, coerceStatus, normalizeBlock } = __internal

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
  it("normaliza status + blocks de copy sem mutar a entrada", () => {
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
    // Blocos são colapsados num único bloco de texto com toda a copy.
    expect((out.copy as Record<string, unknown>).blocks).toEqual([
      { type: "text", value: "Comprar" },
    ])
    // não muta a entrada
    expect(input.status).toBe("completed")
    expect((input.copy.blocks[0] as Record<string, unknown>).type).toBe("cta")
  })

  it("colapsa todos os blocos num único bloco de texto com a copy inteira", () => {
    const out = sanitizeN8nCopyPayload({
      status: "success",
      copy: {
        subject: "S",
        preheader: "P",
        blocks: [
          { type: "heading", headline: "Título do email" },
          { type: "text", body: "Primeiro parágrafo." },
          { type: "products", items: [{ title: "Produto A", cost: 199 }] },
          { type: "button", cta_text: "Comprar agora" },
        ],
      },
    })
    const blocks = (out.copy as Record<string, unknown>).blocks as Array<Record<string, unknown>>
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe("text")
    expect(blocks[0].value).toBe(
      "Título do email\n\nPrimeiro parágrafo.\n\n• Produto A — 199\n\nComprar agora",
    )
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
