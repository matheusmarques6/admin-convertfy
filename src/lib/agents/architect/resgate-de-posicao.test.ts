import { describe, expect, it } from "vitest"

import type { ContratoResumo } from "../shared/field-roles"

import { custoDeIncompatibilidade, menosIncompativel } from "./resgate-de-posicao"

function contrato(p: Partial<ContratoResumo> = {}): ContratoResumo {
  return {
    campos_obrigatorios: [],
    tem_cupom: false,
    tem_cta: true,
    tem_preco: false,
    tem_avaliacao: false,
    tem_credencial: false,
    itens: {},
    n_itens: null,
    copy: 0,
    imagens: 0,
    ...p,
  }
}

// O requisito REAL da posição 4 (products) da Hero Boxers, welcome 1,
// 11/09 — copiado da run d35b2523 do Estruturador.
const PRODUCTS_HERO_BOXERS = {
  cta: true,
  cupom: false,
  preco: true,
  avaliacao: false,
  n_itens: { min: 2, max: 3 },
}

describe("menosIncompativel — o caso que motivou o módulo", () => {
  // products-4 tem preço (e por isso sobreviveu ao filtro do código), mas é
  // grade de 1 item e obriga preço riscado + selo de prazo. products-7 tem
  // dois painéis de produto e não mostra preço. A decisão pediu DOIS
  // produtos: quem entrega dois e deixa o preço para a copy é melhor que
  // quem entrega um e força um "de/por" inventado.
  it("dois produtos sem preço vencem um produto com preço", () => {
    const escolha = menosIncompativel(
      [
        { variant_id: "products-4", contrato: contrato({ tem_preco: true, n_itens: 1 }) },
        { variant_id: "products-7", contrato: contrato({ tem_preco: false, n_itens: 2 }) },
      ],
      PRODUCTS_HERO_BOXERS,
      "products",
    )
    expect(escolha?.variant_id).toBe("products-7")
  })

  it("devolve o motivo, para a telemetria dizer o que se aceitou", () => {
    const escolha = menosIncompativel(
      [{ variant_id: "products-7", contrato: contrato({ n_itens: 2 }) }],
      PRODUCTS_HERO_BOXERS,
      "products",
    )
    expect(escolha?.motivo).toContain("preço")
  })
})

describe("custoDeIncompatibilidade", () => {
  // A regra inteira em uma frase: a copy conserta redação, não conserta
  // anatomia.
  it("faltar preço é mais barato que faltar um item da grade", () => {
    const semPreco = custoDeIncompatibilidade(contrato({ n_itens: 2 }), PRODUCTS_HERO_BOXERS)
    const faltaItem = custoDeIncompatibilidade(
      contrato({ tem_preco: true, n_itens: 1 }),
      PRODUCTS_HERO_BOXERS,
    )
    expect(semPreco).toBeLessThan(faltaItem)
  })

  // Item além do máximo some sozinho (`arbitrarCampos` → `omitir` → o merge
  // remove a linha); slot que falta ninguém cria.
  it("item a mais é mais barato que item a menos", () => {
    const aMais = custoDeIncompatibilidade(contrato({ tem_preco: true, n_itens: 4 }), PRODUCTS_HERO_BOXERS)
    const aMenos = custoDeIncompatibilidade(contrato({ tem_preco: true, n_itens: 1 }), PRODUCTS_HERO_BOXERS)
    expect(aMais).toBeLessThan(aMenos)
  })

  // O example do cupom sobrevive ao merge (`pareceExemplo` não reconhece
  // "Use code: [WELCOME-CODE]"), então a peça promete desconto inexistente.
  it("slot de cupom sem oferta é o mais caro de todos", () => {
    const comCupom = custoDeIncompatibilidade(contrato({ tem_cupom: true, tem_preco: true, n_itens: 2 }), PRODUCTS_HERO_BOXERS)
    const semItemNenhum = custoDeIncompatibilidade(contrato({ tem_preco: true, n_itens: 1 }), PRODUCTS_HERO_BOXERS)
    expect(comCupom).toBeGreaterThan(semItemNenhum)
  })

  it("contrato compatível custa zero", () => {
    expect(custoDeIncompatibilidade(contrato({ tem_preco: true, n_itens: 2 }), PRODUCTS_HERO_BOXERS)).toBe(0)
  })

  // Não saber não é o mesmo que violar: variante sem `output_schema`
  // cadastrado não pode ser descartada por falta de cadastro, senão a
  // posição fica vazia pelo defeito que este módulo existe para cobrir.
  it("sem contrato entra com custo simbólico, não excluída", () => {
    expect(custoDeIncompatibilidade(undefined, PRODUCTS_HERO_BOXERS)).toBe(1)
  })
})

describe("menosIncompativel — repetição", () => {
  // Duas heroes fazem `locateHeroRegion` recusar por ambiguidade e a peça
  // morre em `hero_failed`.
  it("hero já usada não é resgatada de novo", () => {
    const escolha = menosIncompativel(
      [{ variant_id: "hero-9", contrato: contrato() }],
      null,
      "hero",
      new Set(["hero-9"]),
    )
    expect(escolha).toBeNull()
  })

  // O feed puxa os mesmos `top_products`: a MESMA grade apareceria duas
  // vezes.
  it("products já usada não é resgatada de novo", () => {
    expect(
      menosIncompativel([{ variant_id: "p7", contrato: contrato() }], null, "products", new Set(["p7"])),
    ).toBeNull()
  })

  // Hoje `podeRepetir` responde `false` para TODA seção, e é decisão, não
  // esquecimento: "o bloco repetido é uma peça que parece defeito"
  // (repeticao.ts, depois do Luxe Lift). O resgate obedece — e é por isso
  // que ele busca OUTRA variante da seção em vez de repetir a usada. Se a
  // regra voltar a ter exceção, ela nasce lá e este teste muda junto.
  it("nenhuma seção repete hoje: com a única candidata já usada, não há resgate", () => {
    const escolha = menosIncompativel(
      [{ variant_id: "body-3", contrato: contrato() }],
      null,
      "body",
      new Set(["body-3"]),
    )
    expect(escolha).toBeNull()
  })

  // O caso real do bloco [1] da Hero Boxers: body-3 já entrou no bloco [2],
  // e body-4 tinha sido eliminada por "grade de 6 itens contra o máximo de
  // 3". Item ALÉM do máximo é o barato da régua — `arbitrarCampos` marca
  // `omitir` nos itens 4–6 e o merge remove as linhas.
  it("com a candidata usada fora, entra a outra da mesma seção", () => {
    const escolha = menosIncompativel(
      [
        { variant_id: "body-3", contrato: contrato({ n_itens: 3 }) },
        { variant_id: "body-4", contrato: contrato({ n_itens: 6 }) },
      ],
      { cupom: false, n_itens: { min: 3, max: 3 } },
      "body",
      new Set(["body-3"]),
    )
    expect(escolha?.variant_id).toBe("body-4")
  })

  it("seção sem candidata nenhuma devolve null", () => {
    expect(menosIncompativel([], PRODUCTS_HERO_BOXERS, "products")).toBeNull()
  })

  // Duas igualmente incompatíveis não podem alternar a cada geração.
  it("empate desempata por id, para a escolha ser estável", () => {
    const candidatas = [
      { variant_id: "zz", contrato: contrato({ n_itens: 2, tem_preco: true }) },
      { variant_id: "aa", contrato: contrato({ n_itens: 2, tem_preco: true }) },
    ]
    expect(menosIncompativel(candidatas, PRODUCTS_HERO_BOXERS, "products")?.variant_id).toBe("aa")
    expect(menosIncompativel([...candidatas].reverse(), PRODUCTS_HERO_BOXERS, "products")?.variant_id).toBe("aa")
  })
})
