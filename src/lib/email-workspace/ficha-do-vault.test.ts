import { describe, expect, it } from "vitest"

import type { ComponentOutputField } from "@/types/email-generation"

import {
  cabecalhoDaFicha,
  fichaDaVariante,
  fichasDoLote,
  formaDaVariante,
  type VarianteParaFicha,
} from "./ficha-do-vault"
import { resumirContrato } from "@/lib/agents/shared/field-roles"

function campo(p: Partial<ComponentOutputField> & { key: string }): ComponentOutputField {
  return {
    label: p.key,
    type: "text_short",
    max_len: 60,
    required: false,
    example: "",
    guidance: "",
    ...p,
  } as ComponentOutputField
}

// A hero section 13 real (banco, 15/09): e-mail inteiro de data
// comemorativa, com cupom e quatro slots de imagem.
const HERO_13: VarianteParaFicha = {
  id: "bd4965fe-9606-49ca-bdbf-f260571acb3a",
  name: "hero section 13",
  block_type: "hero",
  dispositivo: "oferta_em_manchete",
  papel_na_peca: "peca-inteira",
  description: "E-mail inteiro de data comemorativa forte, quando a oferta é um percentual único.",
  output_schema: [
    campo({ key: "bf_offer_line_1" }),
    campo({ key: "bf_offer_value" }),
    campo({ key: "bf_coupon_code" }),
    campo({ key: "bf_cta_label" }),
    campo({ key: "bf_offer_card_image", type: "image" }),
    campo({ key: "bf_logo_image", type: "image" }),
  ],
}

describe("fichaDaVariante", () => {
  it("leva o variant_id e o nome do banco, que são o que o vault não tem", () => {
    const f = fichaDaVariante(HERO_13)
    expect(f).toContain("variant_id: bd4965fe-9606-49ca-bdbf-f260571acb3a")
    expect(f).toContain("nome_no_banco: hero section 13")
  })

  it("a forma sai da MESMA derivação que a linha do catálogo", () => {
    const c = resumirContrato(HERO_13.output_schema ?? null)
    expect(fichaDaVariante(HERO_13)).toContain(`forma: ${formaDaVariante(c)}`)
  })

  it("o dispositivo aparece marcado como fora da nota", () => {
    expect(fichaDaVariante(HERO_13)).toContain("`oferta_em_manchete` (não vai na nota)")
  })

  // O modo de falha que a ficha existe para impedir: sem dispositivo a
  // variante concorre em toda posição da seção e nunca é pedida. Escrever a
  // nota antes de classificar não conserta isso.
  it("sem dispositivo, manda classificar ANTES de escrever a nota", () => {
    const f = fichaDaVariante({ ...HERO_13, dispositivo: null })
    expect(f).toContain("classifique na aba Componentes antes de escrever a nota")
  })

  it("aliviador e profundidade vêm sempre para preencher", () => {
    const f = fichaDaVariante(HERO_13)
    expect(f).toContain("aliviador:        # preencher")
    expect(f).toContain("profundidade:     # preencher")
  })

  it("papel_na_peca conhecido entra preenchido; desconhecido pede preenchimento", () => {
    expect(fichaDaVariante(HERO_13)).toContain("papel_na_peca: [peca-inteira]")
    expect(fichaDaVariante({ ...HERO_13, papel_na_peca: null })).toContain(
      "papel_na_peca: []   # preencher",
    )
  })

  // "hero section 18 " estava no banco com espaço à direita. O casamento
  // nota↔variante faz trim, mas quem digita o nome_no_banco não tem como
  // saber disso — e um espaço invisível parece erro de outra coisa.
  it("nome com espaço nas bordas é avisado, e preservado no yaml", () => {
    const f = fichaDaVariante({ ...HERO_13, name: "hero section 18 " })
    expect(f).toContain("nome_no_banco: hero section 18 ")
    expect(f).toContain("espaço nas bordas")
    expect(f).toContain("## hero section 18\n")
  })

  it("cadastro sem descrição diz isso em vez de deixar a linha vazia", () => {
    const f = fichaDaVariante({ ...HERO_13, description: "" })
    expect(f).toContain("o cadastro não tem descrição")
  })

  it("grade só aparece quando existe família numerada", () => {
    expect(fichaDaVariante(HERO_13)).not.toContain("- grades:")
    const comGrade = fichaDaVariante({
      ...HERO_13,
      output_schema: [campo({ key: "product_1_name" }), campo({ key: "product_2_name" })],
    })
    expect(comGrade).toContain("- grades: product 2")
  })
})

describe("cabecalhoDaFicha", () => {
  it("repete as regras cujo esquecimento falha em silêncio", () => {
    const c = cabecalhoDaFicha(8, "15/09/2026")
    expect(c).toContain("status: aprovada")
    expect(c).toContain("ignorada sem nenhum aviso")
    expect(c).toContain("momento_vetado")
    expect(c).toContain("valida.py")
  })

  it("serve os vocabulários fechados dos eixos que o ranking lê", () => {
    const c = cabecalhoDaFicha(1, "15/09/2026")
    for (const eixo of ["objecao:", "aliviador:", "profundidade:", "registro:", "paleta:", "papel_na_peca:"]) {
      expect(c).toContain(eixo)
    }
  })
})

describe("fichasDoLote", () => {
  it("um cabeçalho e uma ficha por variante", () => {
    const lote = fichasDoLote([HERO_13, { ...HERO_13, id: "outro", name: "hero section 15" }], "15/09/2026")
    expect(lote.match(/^# Catalogar/gm)).toHaveLength(1)
    expect(lote.match(/^## hero section/gm)).toHaveLength(2)
  })
})
