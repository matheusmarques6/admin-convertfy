/**
 * O incidente de 15/09/2026: 16 mensagens para 5 clientes em 4 minutos, cinco
 * delas com `{{tutorial_link}}` literal.
 *
 * Duas causas, e os dois testes que faltavam:
 *  - `Vars` produzia `tutorial_url` e os templates pediam `tutorial_link`.
 *    Nenhum `tsc` pega isso: a chave existe, só não é a que o texto usa.
 *  - `render` devolvia o placeholder cru e seguia enviando.
 */
import { describe, it, expect } from "vitest"
import { render } from "./onboarding-whatsapp.service"
import { SEED_COLUMNS } from "./onboarding-bootstrap.service"
import {
  VARS_DO_TEMPLATE,
  varsDesconhecidas,
} from "@/lib/onboarding/preview-do-avanco"

/**
 * Todo campo que `buildVars` sabe produzir — lido da FONTE UNICA, nao
 * recopiado aqui. A copia era o terceiro lugar onde a lista vivia, e uma
 * lista repetida em tres lugares diverge no dia em que alguem toca um.
 */
const VARS_DISPONIVEIS = Object.keys(VARS_DO_TEMPLATE) as Array<
  keyof typeof VARS_DO_TEMPLATE
>

const cheio = Object.fromEntries(
  VARS_DISPONIVEIS.map((k) => [k, `valor-${k}`]),
) as unknown as Parameters<typeof render>[1]

describe("templates do seed × variáveis que existem", () => {
  it("toda {{var}} dos templates é produzida por buildVars", () => {
    const orfas: Array<{ coluna: string; variavel: string }> = []
    for (const col of SEED_COLUMNS) {
      if (!col.whatsapp_template) continue
      // `varsDesconhecidas` e o guard do editor sao a MESMA funcao: um
      // segundo detector aqui aceitaria no seed o que o salvar recusa.
      for (const v of varsDesconhecidas(col.whatsapp_template)) {
        orfas.push({ coluna: col.slug, variavel: v })
      }
    }
    // Era aqui que `tutorial_link` × `tutorial_url` apareceria.
    expect(orfas).toEqual([])
  })

  it("com todas as variáveis preenchidas, nenhum template deixa resto", () => {
    for (const col of SEED_COLUMNS) {
      if (!col.whatsapp_template) continue
      const { texto, faltando } = render(col.whatsapp_template, cheio)
      expect(faltando, `coluna ${col.slug}`).toEqual([])
      expect(texto).not.toMatch(/\{\{/)
    }
  })
})

describe("render", () => {
  it("chave que não existe é reportada e o texto fica cru", () => {
    const { texto, faltando } = render("oi {{nao_existe}}", cheio)
    expect(faltando).toEqual(["nao_existe"])
    expect(texto).toBe("oi {{nao_existe}}")
  })

  it("chave vazia também conta como faltando — era o 'Figma:' órfão", () => {
    const semFigma = { ...cheio, figma_link: "" }
    const { texto, faltando } = render("Figma: {{figma_link}}", semFigma)
    expect(faltando).toEqual(["figma_link"])
    expect(texto).toBe("Figma: ")
  })

  it("só espaço em branco é vazio", () => {
    const { faltando } = render("{{store_name}}", { ...cheio, store_name: "   " })
    expect(faltando).toEqual(["store_name"])
  })

  it("a mesma variável repetida é reportada uma vez só", () => {
    const { faltando } = render("{{x}} e {{x}}", cheio)
    expect(faltando).toEqual(["x"])
  })

  it("caso feliz não reporta nada", () => {
    const { texto, faltando } = render("Oi {{client_name}}!", cheio)
    expect(faltando).toEqual([])
    expect(texto).toBe("Oi valor-client_name!")
  })
})
