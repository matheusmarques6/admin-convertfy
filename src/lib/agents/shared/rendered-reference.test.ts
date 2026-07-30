import { describe, it, expect } from "vitest"

import {
  classifyRenderedHtml,
  resolveRenderedReference,
  sourceSha,
} from "./rendered-reference"

/** Mockup real da biblioteca: casca mínima em volta de uma imagem. */
const MOCKUP = `<table><tr><td><img src="https://cdn.exemplo.com/${"x".repeat(1200)}.png"></td></tr></table>`

/**
 * Email renderizado de verdade: várias linhas, conteúdo, pouca URL. 20
 * blocos para passar dos 2,5KB — um email real fica entre 15KB e 60KB, e o
 * threshold existe justamente para separar isso de um print de ~1,7KB.
 */
const STRUCTURAL = `<table role="presentation" width="600">
${Array.from(
  { length: 20 },
  (_, i) =>
    `  <tr><td style="padding:24px 40px;font-family:Inter;font-size:16px;line-height:24px;color:#333">
     Bloco ${i} com texto de verdade, do tamanho que um email renderizado costuma ter nesta linha.
   </td></tr>`,
).join("\n")}
</table>`

const SOURCE = `<tr><td>{{HERO_HEADLINE}}</td></tr>`

describe("classifyRenderedHtml", () => {
  it("vazio → empty", () => {
    expect(classifyRenderedHtml(null).kind).toBe("empty")
    expect(classifyRenderedHtml("").kind).toBe("empty")
    expect(classifyRenderedHtml("   ").kind).toBe("empty")
  })

  it("mockup-imagem → mockup, com as razões", () => {
    const r = classifyRenderedHtml(MOCKUP)
    expect(r.kind).toBe("mockup")
    expect(r.reasons).toContain("poucas_linhas")
    expect(r.reasons).toContain("dominado_por_src")
  })

  it("HTML de email de verdade → structural", () => {
    const r = classifyRenderedHtml(STRUCTURAL, SOURCE)
    expect(r.kind).toBe("structural")
    expect(r.reasons).toEqual([])
    expect(r.rows).toBe(20)
  })

  it("curto demais → mockup mesmo com linhas", () => {
    const curto = "<table><tr><td>a</td></tr><tr><td>b</td></tr><tr><td>c</td></tr></table>"
    const r = classifyRenderedHtml(curto)
    expect(r.kind).toBe("mockup")
    expect(r.reasons).toContain("curto_demais")
  })

  it("muito menor que o html autoral → mockup", () => {
    // Fonte grande, renderizado pequeno: o exemplo não cobre a variante.
    const fonteGrande = STRUCTURAL + STRUCTURAL + STRUCTURAL
    const r = classifyRenderedHtml(STRUCTURAL, fonteGrande)
    expect(r.reasons).toContain("menor_que_a_fonte")
    expect(r.kind).toBe("mockup")
  })

  it("sem a fonte, não cobra proporção", () => {
    expect(classifyRenderedHtml(STRUCTURAL).reasons).not.toContain(
      "menor_que_a_fonte",
    )
  })
})

describe("sourceSha", () => {
  it("estável para o mesmo conteúdo", () => {
    expect(sourceSha("<tr></tr>")).toBe(sourceSha("<tr></tr>"))
  })

  it("ignora espaço nas pontas", () => {
    expect(sourceSha("  <tr></tr>  ")).toBe(sourceSha("<tr></tr>"))
  })

  it("muda quando o html muda", () => {
    expect(sourceSha("<tr>a</tr>")).not.toBe(sourceSha("<tr>b</tr>"))
  })

  it("null e vazio colidem de propósito (ambos são 'sem html')", () => {
    expect(sourceSha(null)).toBe(sourceSha(""))
  })
})

describe("resolveRenderedReference", () => {
  const variant = (over: Record<string, unknown> = {}) => ({
    html: SOURCE,
    rendered_html: STRUCTURAL,
    rendered_html_source_sha: sourceSha(SOURCE),
    ...over,
  })

  it("estrutural + hash batendo → envia", () => {
    const r = resolveRenderedReference(variant())
    expect(r.html).toBe(STRUCTURAL)
    expect(r.reason).toBeNull()
    expect(r.stale).toBe(false)
  })

  it("html mudou depois do renderizado → não envia, marca stale", () => {
    const r = resolveRenderedReference(
      variant({ html: "<tr><td>{{HERO_HEADLINE}} editado</td></tr>" }),
    )
    expect(r.html).toBeNull()
    expect(r.reason).toBe("stale")
    expect(r.stale).toBe(true)
  })

  // Backfill deixa NULL: validade desconhecida é tratada como velha.
  it("sem hash gravado → não envia, marca stale", () => {
    const r = resolveRenderedReference(
      variant({ rendered_html_source_sha: null }),
    )
    expect(r.html).toBeNull()
    expect(r.reason).toBe("unknown_sha")
    expect(r.stale).toBe(true)
  })

  it("mockup → não envia, e NÃO é stale (não é questão de idade)", () => {
    const r = resolveRenderedReference(variant({ rendered_html: MOCKUP }))
    expect(r.html).toBeNull()
    expect(r.reason).toBe("mockup")
    expect(r.stale).toBe(false)
    expect(r.kind).toBe("mockup")
  })

  it("não cadastrado → não envia, sem alarde", () => {
    const r = resolveRenderedReference(variant({ rendered_html: null }))
    expect(r.html).toBeNull()
    expect(r.reason).toBe("empty")
    expect(r.stale).toBe(false)
  })

  it("mockup com hash velho continua sendo mockup", () => {
    // A classificação vem antes do hash: não adianta regravar o exemplo se
    // ele é um print.
    const r = resolveRenderedReference(
      variant({ rendered_html: MOCKUP, rendered_html_source_sha: "outro" }),
    )
    expect(r.reason).toBe("mockup")
  })
})
