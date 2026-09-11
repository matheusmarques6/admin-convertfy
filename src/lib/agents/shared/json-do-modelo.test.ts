import { describe, expect, it } from "vitest"

import { blocosBalanceados, jsonUtilizavel } from "./json-do-modelo"

// O caso que motivou o módulo: run b49b0131 (`copy_fit`, 11/09, sonnet-4.6).
// Índice quebrado na abertura, raciocínio em prosa no meio, resposta correta
// no fim. 3.811 chars no original; aqui, o esqueleto exato.
const RESPOSTA_REAL = `\`\`\`json
{"campos":{"1.cta_label":"SEE HOW IT WORKS","2.glass_subtitle","3.section_copy"}}
\`\`\`

Let me work through each field carefully.

**1.cta_label** — 16 chars → max 14, alvo 11. "SEE HOW IT WORKS" → "SEE IT WORK" (11) ✓

**2.glass_subtitle** — 50 → max 38. → "No install. No tools. No wrong moves." (37) ✓

{"campos":{"1.cta_label":"SEE IT WORK","2.glass_subtitle":"No install. No tools. No wrong moves.","3.section_copy":"Homeowners tested InnovaBay products in real conditions."}}`

describe("jsonUtilizavel", () => {
  it("recupera a resposta do fim quando a abertura é rascunho", () => {
    const achado = jsonUtilizavel(RESPOSTA_REAL)
    expect(achado).not.toBeNull()
    const obj = JSON.parse(achado!) as { campos: Record<string, string> }
    // Os valores CORRIGIDOS, não os originais do índice.
    expect(obj.campos["1.cta_label"]).toBe("SEE IT WORK")
    expect(obj.campos["2.glass_subtitle"]).toBe("No install. No tools. No wrong moves.")
  })

  // O primeiro bloco que parseia seria a escolha errada exatamente aqui: um
  // rascunho pode ser JSON válido e ainda assim não ser a resposta.
  it("o ÚLTIMO bloco válido vence, não o primeiro", () => {
    const texto = `{"resposta":"rascunho"}\n\npensando melhor…\n\n{"resposta":"final"}`
    expect(JSON.parse(jsonUtilizavel(texto)!)).toEqual({ resposta: "final" })
  })

  it("devolve null quando não há JSON nenhum", () => {
    expect(jsonUtilizavel("não consegui responder")).toBeNull()
    expect(jsonUtilizavel("")).toBeNull()
  })

  it("nenhum bloco parseável devolve null", () => {
    expect(jsonUtilizavel('{"a","b"} e {"c","d"}')).toBeNull()
  })

  it("aceita array na raiz", () => {
    expect(JSON.parse(jsonUtilizavel('lixo [1,2,3] fim')!)).toEqual([1, 2, 3])
  })
})

describe("blocosBalanceados", () => {
  // Estes agentes escrevem COPY. Chave e colchete dentro de string são
  // rotina, e contá-los partiria o bloco no meio — o recorte sairia
  // inválido justamente na resposta boa.
  it("chave dentro de string não fecha bloco", () => {
    const texto = '{"copy":"use } para fechar","ok":true}'
    expect(blocosBalanceados(texto)).toEqual([texto])
  })

  it("aspas escapadas não abrem string", () => {
    const texto = '{"copy":"ele disse \\"oi\\" e saiu"}'
    expect(blocosBalanceados(texto)).toEqual([texto])
  })

  it("aninhamento conta como UM bloco", () => {
    const texto = '{"a":{"b":{"c":1}}}'
    expect(blocosBalanceados(texto)).toEqual([texto])
  })

  it("blocos irmãos saem separados, na ordem", () => {
    expect(blocosBalanceados('{"a":1} x {"b":2}')).toEqual(['{"a":1}', '{"b":2}'])
  })

  // Fechamento trocado é lixo. Mantê-lo na lista faria o chamador gastar um
  // parse num candidato sem chance — e, pior, poderia mascarar o bom.
  it("descarta fechamento trocado", () => {
    expect(blocosBalanceados('{"a":1]')).toEqual([])
  })

  it("fecha-sem-abrir é ignorado", () => {
    expect(blocosBalanceados('} } {"a":1}')).toEqual(['{"a":1}'])
  })
})
