import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import { interpolateSystem } from "./llm-invoke"
import { DEFAULT_BLUEPRINT_SYSTEM } from "./blueprint-generator.service"
import { DEFAULT_CHOOSER_SYSTEM } from "./component-assembler.service"
import { renderImageTemplate } from "../image/template-renderer"

describe("interpolateSystem", () => {
  it("substitui só as chaves passadas", () => {
    const out = interpolateSystem("A={{a}} B={{b}}", { a: "1" })
    expect(out).toBe("A=1 B={{b}}")
  })

  it("sem vars, devolve o prompt intacto", () => {
    expect(interpolateSystem("A={{a}}")).toBe("A={{a}}")
  })

  it("substitui todas as ocorrências da mesma chave", () => {
    expect(interpolateSystem("{{x}} e {{x}}", { x: "v" })).toBe("v e v")
  })

  it("valor com $ não é interpretado como grupo de captura", () => {
    // `replaceAll` com string trata `$&`/`$1` como referências — o catálogo
    // pode conter qualquer coisa, inclusive isso.
    const out = interpolateSystem("<{{c}}>", { c: "R$ 10 $& $1" })
    expect(out).toBe("<R$ 10 $& $1>")
  })

  // A razão de existir desta função em vez de reusar o renderer: story CM-1.
  it("preserva notação {{TAG}} que o renderer apagaria", () => {
    const prompt = "as tags {{TAG}} do HTML\n{{catalogo}}"
    const out = interpolateSystem(prompt, { catalogo: "CAT" })
    expect(out).toContain("{{TAG}}")
    expect(out).toContain("CAT")
    // Prova do contraste: o renderer apagaria o {{TAG}}.
    expect(renderImageTemplate(prompt, { catalogo: "CAT" })).not.toContain(
      "{{TAG}}",
    )
  })
})

// Auditoria exigida pelo AC CM-3.2: nenhum system prompt de agente do
// architect pode perder conteúdo pela interpolação. `interpolateSystem` só
// troca chaves conhecidas, então a garantia é estrutural — estes testes
// travam os casos concretos que a auditoria de 30/jul encontrou.
describe("auditoria dos system prompts do architect", () => {
  it("blueprint: a notação {{TAG}} sobrevive", () => {
    expect(DEFAULT_BLUEPRINT_SYSTEM).toContain("{{TAG}}")
    const out = interpolateSystem(DEFAULT_BLUEPRINT_SYSTEM, { catalogo: "X" })
    expect(out).toBe(DEFAULT_BLUEPRINT_SYSTEM)
  })

  it("curador: {{catalogo}} é substituído e nada mais se perde", () => {
    expect(DEFAULT_CHOOSER_SYSTEM).toContain("{{catalogo}}")
    const out = interpolateSystem(DEFAULT_CHOOSER_SYSTEM, {
      catalogo: "CATALOGO_AQUI",
    })
    expect(out).not.toContain("{{catalogo}}")
    expect(out).toContain("CATALOGO_AQUI")
    // O resto do prompt é byte a byte o mesmo.
    expect(out.replace("CATALOGO_AQUI", "{{catalogo}}")).toBe(
      DEFAULT_CHOOSER_SYSTEM,
    )
  })

  it("curador: o prompt descreve o contrato de ranking", () => {
    expect(DEFAULT_CHOOSER_SYSTEM).toContain("escolhas")
    expect(DEFAULT_CHOOSER_SYSTEM).toContain("ordem de preferência")
    expect(DEFAULT_CHOOSER_SYSTEM).toContain("motivo")
    // Ordem alfabética declarada como sem julgamento — o embaralhamento por
    // semente saiu junto com o pré-filtro (o catálogo precisa ser estável).
    expect(DEFAULT_CHOOSER_SYSTEM).toContain("alfabética")
    expect(DEFAULT_CHOOSER_SYSTEM).toContain("NÃO carrega julgamento")
    // Variedade dentro do email é decisão do Montador, não do Curador.
    expect(DEFAULT_CHOOSER_SYSTEM).toContain("quem garante variedade")
  })
})
