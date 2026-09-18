/**
 * Tipo de campo que o código usa tem de estar no CHECK do banco.
 *
 * Medido em 18/09: `statement` existia em `FormBlockType`, o editor o
 * oferecia, o Zod da rota o aceitava — e o CHECK de
 * `crm_form_fields.field_type` não o tinha. O INSERT morre em 23514 na
 * última fronteira, a tela de conteúdo não nasce e nada em tela diz por
 * quê. É a mesma armadilha que o `copy_fit` e o `typography` já pagaram
 * no pipeline de e-mail; aqui ela vira falha de teste.
 *
 * A régua lê a MIGRATION mais recente que define o CHECK, não o banco:
 * o teste roda sem credencial, e a migration é o que o próximo ambiente
 * vai aplicar.
 */

import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { TIPOS_SEM_RESPOSTA } from "@/types/forms-conversational"
import type { FormBlockType } from "@/types/forms-conversational"

const DIR = join(process.cwd(), "supabase", "migrations")
const NOME_DO_CHECK = "crm_form_fields_field_type_check"

/** Os tipos aceitos pela migration mais recente que redefine o CHECK. */
function tiposNoCheck(): string[] {
  const arquivos = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse()
  for (const f of arquivos) {
    const sql = readFileSync(join(DIR, f), "utf8")
    const i = sql.indexOf(`add constraint ${NOME_DO_CHECK}`)
    if (i < 0) continue
    const trecho = sql.slice(i)
    const lista = trecho.match(/array\s*\[([\s\S]*?)\]/i)
    if (!lista) continue
    return [...lista[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  }
  throw new Error(`nenhuma migration define ${NOME_DO_CHECK}`)
}

/**
 * Os tipos que o código grava na tabela.
 *
 * `hidden` é do banco e não de `FormBlockType` — no schema ele é um
 * bloco comum com a marca `hidden: true`, e `camposDoSchema` o traduz
 * na volta.
 */
const DO_CODIGO: FormBlockType[] = [
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "select",
  "radio",
  "checkbox",
  "date",
  "url",
  "cpf",
  "cnpj",
  "cep",
  "statement",
  "multi_select",
]

describe("field_type: código e banco", () => {
  it("todo tipo do código é aceito pelo CHECK", () => {
    const aceitos = new Set(tiposNoCheck())
    const faltando = DO_CODIGO.filter((t) => !aceitos.has(t))
    expect(faltando, `acrescente ao CHECK em supabase/migrations: ${faltando.join(", ")}`).toEqual(
      [],
    )
  })

  it("o CHECK tem `hidden`, que o código grava sem estar em FormBlockType", () => {
    expect(tiposNoCheck()).toContain("hidden")
  })

  it("a tela de conteúdo é um tipo sem resposta e está no CHECK", () => {
    // Se `statement` sair do CHECK, as cinco telas de conteúdo do funil
    // de aplicação param de nascer — em silêncio, uma a uma.
    expect(TIPOS_SEM_RESPOSTA.has("statement")).toBe(true)
    expect(tiposNoCheck()).toContain("statement")
  })
})
