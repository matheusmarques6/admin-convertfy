import { describe, it, expect } from "vitest"
import { renderImageTemplate } from "./template-renderer"

describe("renderImageTemplate — substituicao simples", () => {
  it("substitui {{NICHO}} pelo valor", () => {
    expect(renderImageTemplate("nicho: {{NICHO}}", { NICHO: "moda" })).toBe(
      "nicho: moda",
    )
  })

  it("multiplas vars na mesma string", () => {
    const out = renderImageTemplate("{{A}} e {{B}}", { A: "x", B: "y" })
    expect(out).toBe("x e y")
  })

  it("var indefinida vira string vazia (nunca 'undefined')", () => {
    const out = renderImageTemplate("antes [{{NAO_EXISTE}}] depois", {})
    expect(out).toBe("antes [] depois")
  })

  it("var numerica vira string", () => {
    expect(renderImageTemplate("n={{N}}", { N: 7 })).toBe("n=7")
  })

  it("var null/undefined produz vazio", () => {
    // @ts-expect-error testando tolerancia a runtime garbage
    expect(renderImageTemplate("a={{A}}|b={{B}}", { A: null, B: undefined })).toBe(
      "a=|b=",
    )
  })

  it("whitespace ao redor da var e tolerado", () => {
    expect(renderImageTemplate("{{   X   }}", { X: "ok" })).toBe("ok")
  })
})

describe("renderImageTemplate — switch {{#case}}", () => {
  const template = `{{#case email_number}}
{{#when 1}}E1{{/when}}
{{#when 2}}E2{{/when}}
{{#when 3}}E3{{/when}}
{{/case}}`

  it("resolve E1 quando email_number=1", () => {
    expect(renderImageTemplate(template, { email_number: 1 }).trim()).toBe("E1")
  })

  it("resolve E2 quando email_number=2", () => {
    expect(renderImageTemplate(template, { email_number: 2 }).trim()).toBe("E2")
  })

  it("resolve E3 quando email_number='3' (string)", () => {
    expect(renderImageTemplate(template, { email_number: "3" }).trim()).toBe("E3")
  })

  it("when 1 (numero literal) casa com email_number='1' (string)", () => {
    expect(renderImageTemplate(template, { email_number: "1" }).trim()).toBe("E1")
  })

  it("valor nao mapeado no switch -> string vazia", () => {
    expect(renderImageTemplate(template, { email_number: 99 }).trim()).toBe("")
  })

  it("var ausente -> string vazia", () => {
    expect(renderImageTemplate(template, {}).trim()).toBe("")
  })

  it("aceita rotulos com ou sem aspas", () => {
    const t = `{{#case x}}{{#when "a"}}A{{/when}}{{#when b}}B{{/when}}{{/case}}`
    expect(renderImageTemplate(t, { x: "a" })).toBe("A")
    expect(renderImageTemplate(t, { x: "b" })).toBe("B")
  })
})

describe("renderImageTemplate — switch aninhado", () => {
  const template = `{{#case flow_type}}
{{#when "welcome"}}
{{#case email_number}}
{{#when 1}}welcome-E1{{/when}}
{{#when 2}}welcome-E2{{/when}}
{{/case}}
{{/when}}
{{#when "abandoned_cart"}}cart-generic{{/when}}
{{/case}}`

  it("welcome + 1 -> welcome-E1", () => {
    const out = renderImageTemplate(template, { flow_type: "welcome", email_number: 1 })
    expect(out).toContain("welcome-E1")
    expect(out).not.toContain("welcome-E2")
  })

  it("welcome + 2 -> welcome-E2", () => {
    const out = renderImageTemplate(template, { flow_type: "welcome", email_number: 2 })
    expect(out).toContain("welcome-E2")
  })

  it("abandoned_cart -> cart-generic", () => {
    const out = renderImageTemplate(template, { flow_type: "abandoned_cart", email_number: 1 })
    expect(out).toContain("cart-generic")
  })

  it("flow nao mapeado -> tudo vazio", () => {
    const out = renderImageTemplate(template, { flow_type: "win_back", email_number: 1 })
    expect(out.trim()).toBe("")
  })
})

describe("renderImageTemplate — vars dentro de blocos resolvidos", () => {
  it("substitui var dentro de {{#when}} resolvido", () => {
    const t = `{{#case email_number}}{{#when 1}}E1 hero: {{PRODUTO_HEROI}}{{/when}}{{/case}}`
    expect(renderImageTemplate(t, { email_number: 1, PRODUTO_HEROI: "Tenis" })).toBe(
      "E1 hero: Tenis",
    )
  })

  it("vars no when nao escolhido sao descartadas (sem residuo)", () => {
    const t = `{{#case x}}{{#when 1}}A {{Y}}{{/when}}{{#when 2}}B {{Z}}{{/when}}{{/case}}`
    expect(renderImageTemplate(t, { x: 1, Y: "yes", Z: "no" })).toBe("A yes")
  })
})

describe("renderImageTemplate — condicional {{#if}}", () => {
  it("exibe quando var truthy", () => {
    expect(renderImageTemplate("{{#if X}}ok{{/if}}", { X: "yes" })).toBe("ok")
  })

  it("omite quando var vazia", () => {
    expect(renderImageTemplate("[{{#if X}}ok{{/if}}]", { X: "" })).toBe("[]")
  })

  it("omite quando var ausente", () => {
    expect(renderImageTemplate("[{{#if X}}ok{{/if}}]", {})).toBe("[]")
  })

  it("omite quando var=0", () => {
    expect(renderImageTemplate("[{{#if X}}ok{{/if}}]", { X: 0 })).toBe("[]")
  })

  it("omite quando var='false'", () => {
    expect(renderImageTemplate("[{{#if X}}ok{{/if}}]", { X: "false" })).toBe("[]")
  })

  it("substitui var dentro do bloco if exibido", () => {
    const t = "{{#if INSTRUCAO_ADICIONAL}}EXTRA: {{INSTRUCAO_ADICIONAL}}{{/if}}"
    expect(renderImageTemplate(t, { INSTRUCAO_ADICIONAL: "foco na costura" })).toBe(
      "EXTRA: foco na costura",
    )
  })
})

describe("renderImageTemplate — multi-bloco no mesmo template", () => {
  it("varios switches sequenciais no mesmo template", () => {
    const t = `{{#case a}}{{#when 1}}A1{{/when}}{{/case}}-{{#case b}}{{#when 2}}B2{{/when}}{{/case}}`
    expect(renderImageTemplate(t, { a: 1, b: 2 })).toBe("A1-B2")
  })

  it("case + if + var simples no mesmo template", () => {
    const t = `{{NICHO}} | {{#case x}}{{#when 1}}one{{/when}}{{/case}} | {{#if Y}}has-y{{/if}}`
    expect(renderImageTemplate(t, { NICHO: "moda", x: 1, Y: "y" })).toBe(
      "moda | one | has-y",
    )
  })

  // AE-11 review S1: template malformado eh tolerado (passa raw em vez de
  // throw) pra nao bloquear evolucao do seed. Documentar via teste.
  it("template malformado (case nao fechado) passa raw sem throw", () => {
    const malformed = "antes {{#case x}}sem fechar — texto livre"
    const result = renderImageTemplate(malformed, { x: "a" })
    expect(result).toBe(malformed) // regex nao casa, template volta inalterado
  })

  it("template malformado (if nao fechado) passa raw sem throw", () => {
    const malformed = "{{#if INSTRUCAO_ADICIONAL}}sem fechar"
    const result = renderImageTemplate(malformed, { INSTRUCAO_ADICIONAL: "x" })
    expect(result).toBe(malformed)
  })

  it("aceita aspas simples em when", () => {
    const t = `{{#case x}}{{#when 'a'}}found{{/when}}{{/case}}`
    expect(renderImageTemplate(t, { x: "a" })).toBe("found")
  })
})
