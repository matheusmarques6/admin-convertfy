import { describe, expect, it } from "vitest"

import type { ContratoResumo } from "../shared/field-roles"

import { custoDeIncompatibilidade, descartesEfetivos, doDispositivoPedido, menosIncompativel, ordenarCandidatas } from "./resgate-de-posicao"

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
    tem_prazo: false,
    tem_preco_antigo: false,
    tem_nome_depoente: false,
    tem_logo: false,
    n_ctas: 0,
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
  // Medido em 11/09: a copy NÃO pôs preço em products-7 — o slot que a
  // anatomia não tem, ninguém preenche. Preço custa o mesmo que um item a
  // menos na grade (40): as duas são faltas de anatomia. O teste antigo
  // afirmava "faltar preço é mais barato que faltar item" e era ele que
  // mantinha o e-mail sem preço saindo como se estivesse certo.
  it("faltar preço custa o mesmo que faltar um item da grade — anatomia, não redação", () => {
    const semPreco = custoDeIncompatibilidade(contrato({ n_itens: 2 }), PRODUCTS_HERO_BOXERS)
    const faltaItem = custoDeIncompatibilidade(
      contrato({ tem_preco: true, n_itens: 1 }),
      PRODUCTS_HERO_BOXERS,
    )
    expect(semPreco).toBe(40)
    expect(semPreco).toBe(faltaItem)
  })

  // Avaliação segue sendo redação: entra na linha de apoio.
  it("faltar avaliação continua barato", () => {
    const semAvaliacao = custoDeIncompatibilidade(
      contrato({ tem_preco: true, n_itens: 2 }),
      { ...PRODUCTS_HERO_BOXERS, avaliacao: true },
    )
    expect(semAvaliacao).toBe(3)
  })

  // Item além do máximo some sozinho (`arbitrarCampos` → `omitir` → o merge
  // remove a linha); slot que falta ninguém cria.
  it("item a mais é mais barato que item a menos", () => {
    const aMais = custoDeIncompatibilidade(contrato({ tem_preco: true, n_itens: 4 }), PRODUCTS_HERO_BOXERS)
    const aMenos = custoDeIncompatibilidade(contrato({ tem_preco: true, n_itens: 1 }), PRODUCTS_HERO_BOXERS)
    expect(aMais).toBeLessThan(aMenos)
  })

  // O caso real da posição 3 do batch 6249aef2: body-4 (body_comparacao)
  // entrou por resgate depois de o Estruturador descartar exatamente esse
  // dispositivo com motivo. Descarte é decisão, custa Infinity.
  it("variante de dispositivo DESCARTADO custa Infinity", () => {
    const custo = custoDeIncompatibilidade(
      contrato({ dispositivo: "body_comparacao", n_itens: 3 }),
      { cupom: false, n_itens: { min: 3, max: 3 } },
      [{ dispositivo: "body_comparacao" }],
    )
    expect(custo).toBe(Infinity)
  })

  // Sem requisito nenhum na posição o descarte continua valendo: ele é da
  // DECISÃO do e-mail, não da posição.
  it("descarte vale mesmo sem requisito na posição", () => {
    expect(
      custoDeIncompatibilidade(contrato({ dispositivo: "body_comparacao" }), null, [{ dispositivo: "body_comparacao" }]),
    ).toBe(Infinity)
  })

  // A decisão de referência pede `body_garantias` na posição 2 E lista
  // `body_garantias` nos descartes. Comparar pelo requisito, ou aplicar o
  // descarte sem olhar o pedido, mataria a posição certa.
  it("descarte que nomeia o dispositivo PEDIDO pela posição é ignorado", () => {
    const r = { dispositivo: "body_garantias", cupom: false }
    expect(descartesEfetivos([{ dispositivo: "body_garantias" }, { dispositivo: "body_comparacao" }], r)).toEqual(
      new Set(["body_comparacao"]),
    )
    expect(
      custoDeIncompatibilidade(contrato({ dispositivo: "body_garantias" }), r, [{ dispositivo: "body_garantias" }]),
    ).toBe(0)
  })

  // Não saber não é violar: variante ainda não classificada (coluna NULL)
  // nunca é eliminada por descarte.
  it("variante sem dispositivo cadastrado tem custo finito mesmo com descartes", () => {
    const custo = custoDeIncompatibilidade(contrato({ dispositivo: null }), null, [{ dispositivo: "body_comparacao" }])
    expect(Number.isFinite(custo)).toBe(true)
  })

  it("descarte sem dispositivo é ignorado", () => {
    expect(custoDeIncompatibilidade(contrato({ dispositivo: "body_tese" }), null, [{ dispositivo: null }])).toBe(0)
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

  // Toda candidata descartada → null. Antes o resgate devolvia `pontuadas[0]`
  // sem olhar o custo, e foi assim que a comparação descartada entrou.
  it("com todas as candidatas de dispositivo descartado, não há resgate", () => {
    const escolha = menosIncompativel(
      [
        { variant_id: "body-4", contrato: contrato({ dispositivo: "body_comparacao", n_itens: 6 }) },
        { variant_id: "body-6", contrato: contrato({ dispositivo: "body_comparacao", n_itens: 3 }) },
      ],
      { cupom: false, n_itens: { min: 3, max: 3 } },
      "body",
      new Set(),
      [{ dispositivo: "body_comparacao" }],
    )
    expect(escolha).toBeNull()
  })

  // Uma descartada e uma viável: entra a viável e a telemetria conta a que
  // ficou de fora.
  it("descartada sai do pool e a viável entra, com a contagem", () => {
    const escolha = menosIncompativel(
      [
        { variant_id: "body-4", contrato: contrato({ dispositivo: "body_comparacao", n_itens: 3 }) },
        { variant_id: "body-2", contrato: contrato({ dispositivo: "body_tese", n_itens: 3 }) },
      ],
      { cupom: false, n_itens: { min: 3, max: 3 } },
      "body",
      new Set(),
      [{ dispositivo: "body_comparacao" }],
    )
    expect(escolha?.variant_id).toBe("body-2")
    expect(escolha?.descartadas_por_dispositivo).toBe(1)
  })

  // Duas igualmente incompatíveis não podem alternar a cada geração.
  it("empate total desempata por id, para a escolha ser estável", () => {
    const candidatas = [
      { variant_id: "zz", contrato: contrato({ n_itens: 2, tem_preco: true }) },
      { variant_id: "aa", contrato: contrato({ n_itens: 2, tem_preco: true }) },
    ]
    expect(menosIncompativel(candidatas, PRODUCTS_HERO_BOXERS, "products")?.variant_id).toBe("aa")
    expect(menosIncompativel([...candidatas].reverse(), PRODUCTS_HERO_BOXERS, "products")?.variant_id).toBe("aa")
  })
})

describe("menosIncompativel — os desempates, com a biblioteca REAL de products", () => {
  // As 9 variantes ativas de products em 11/09. Só products-4 mostra preço,
  // e ela não tem campo numerado nenhum (`product_name`, `price_new`).
  const BIBLIOTECA = [
    { variant_id: "produtos-8-9prod", contrato: contrato({ n_itens: 9, copy: 20 }) },
    { variant_id: "produto-8-4prod", contrato: contrato({ n_itens: 4, copy: 10 }) },
    { variant_id: "produtos-3", contrato: contrato({ n_itens: 4, copy: 5 }) },
    { variant_id: "produtos-9", contrato: contrato({ n_itens: 4, copy: 13 }) },
    { variant_id: "produtos-2", contrato: contrato({ n_itens: 3, copy: 5 }) },
    { variant_id: "produtos-5", contrato: contrato({ n_itens: 3, copy: 17 }) },
    { variant_id: "produtos-6", contrato: contrato({ n_itens: 2, copy: 8 }) },
    { variant_id: "produtos-7", contrato: contrato({ n_itens: 2, copy: 8 }) },
    { variant_id: "produtos-4", contrato: contrato({ n_itens: null, tem_preco: true, copy: 9 }) },
  ]

  // `n_itens: null` não é "qualquer quantidade": a anatomia sem família
  // numerada entrega UM. Sem esta leitura, products-4 sairia com custo ZERO
  // (tem preço, escapa do mínimo) e venceria — entregando um produto onde a
  // decisão pediu dois, que é justamente o que o Curador recusou.
  it("produto único não escapa do mínimo por não ter campo numerado", () => {
    const escolha = menosIncompativel(BIBLIOTECA, PRODUCTS_HERO_BOXERS, "products")
    expect(escolha?.variant_id).not.toBe("produtos-4")
  })

  // Quatro empatam em custo (entregam a grade e nenhuma mostra preço).
  // Desempata a que chega mais perto do mínimo pedido; depois, a anatomia
  // mais rica. Escolher por UUID entre elas seria sorteio numa peça que vai
  // ao cliente.
  it("entre as empatadas vence a mais perto do pedido, depois a mais rica", () => {
    const escolha = menosIncompativel(BIBLIOTECA, PRODUCTS_HERO_BOXERS, "products")
    expect(escolha?.variant_id).toBe("produtos-6")
  })

  it("sem requisito de grade, a distância não desempata nada", () => {
    const escolha = menosIncompativel(BIBLIOTECA, { cupom: false }, "products")
    expect(escolha).not.toBeNull()
  })
})

// O desempate de 15/09. Medido em 45 dias: a variante que serve a tudo
// nunca colide com requisito positivo, então chegava ao desempate com
// frequência — e `b.copy - a.copy` a fazia ganhar sempre, por escrito.
describe("desempate por menor uso", () => {
  const c = contrato({ copy: 3 })
  const rica = contrato({ copy: 12 })

  it("entre duas de mesmo custo, vence a MENOS usada nesta loja", () => {
    const r = menosIncompativel(
      [
        { variant_id: "usada", contrato: rica, usos: 40 },
        { variant_id: "nova", contrato: c, usos: 0 },
      ],
      null,
      "body",
    )
    expect(r?.variant_id).toBe("nova")
  })

  it("uso não atropela custo: a que viola continua atrás mesmo virgem", () => {
    const r = menosIncompativel(
      [
        { variant_id: "serve", contrato: contrato({ tem_preco: true }), usos: 30 },
        { variant_id: "nao-serve", contrato: contrato({ tem_preco: false }), usos: 0 },
      ],
      { preco: true },
      "products",
    )
    expect(r?.variant_id).toBe("serve")
  })

  it("empate em uso volta à anatomia mais rica — ela tem onde acomodar o que falta", () => {
    const r = menosIncompativel(
      [
        { variant_id: "magra", contrato: c, usos: 2 },
        { variant_id: "rica", contrato: rica, usos: 2 },
      ],
      null,
      "body",
    )
    expect(r?.variant_id).toBe("rica")
  })

  it("sem `usos` (chamador antigo) todas contam zero e a régua antiga decide", () => {
    const r = menosIncompativel(
      [
        { variant_id: "magra", contrato: c },
        { variant_id: "rica", contrato: rica },
      ],
      null,
      "body",
    )
    expect(r?.variant_id).toBe("rica")
  })
})

describe("variante não classificada não empata com quem acerta o dispositivo", () => {
  // Medido em 15/09, no dia em que as 8 heroes novas entraram sem
  // `dispositivo`: `hero section 9` é a hero de pergunta (25 escolhas em 45
  // dias) e `hero section 13` é um e-mail INTEIRO de Black Friday, recém
  // cadastrado e ainda sem etiqueta (0 escolhas). Sem o custo de 75 as duas
  // empatavam em 0 e o desempate por MENOR USO entregava a abertura de um
  // welcome para a peça de Black Friday.
  const PEDE_PERGUNTA = {
    dispositivo: "hero_pergunta" as const,
    cta: true,
    cupom: null,
    preco: null,
    avaliacao: null,
    n_itens: null,
  }
  const hero9 = contrato({ dispositivo: "hero_pergunta", copy: 4 })
  const hero13 = contrato({ dispositivo: null, tem_cupom: true, copy: 7 })

  it("a não classificada custa 75; a que acerta o dispositivo custa 0", () => {
    expect(custoDeIncompatibilidade(hero9, PEDE_PERGUNTA)).toBe(0)
    expect(custoDeIncompatibilidade(hero13, PEDE_PERGUNTA)).toBe(75)
  })

  it("a hero de pergunta vence, mesmo com 25 usos contra 0", () => {
    const escolha = menosIncompativel(
      [
        { variant_id: "hero-13", contrato: hero13, usos: 0 },
        { variant_id: "hero-9", contrato: hero9, usos: 25 },
      ],
      PEDE_PERGUNTA,
      "hero",
    )
    expect(escolha?.variant_id).toBe("hero-9")
  })

  it("sem dispositivo PEDIDO, a não classificada não paga nada", () => {
    const semPedido = { ...PEDE_PERGUNTA, dispositivo: undefined }
    expect(custoDeIncompatibilidade(hero13, semPedido)).toBe(0)
  })

  // O dispositivo ERRADO não tem preço desde o Passo 19 — quem o elimina é
  // `doDispositivoPedido`, antes de pontuar. Os dois casos são diferentes de
  // propósito: errado SAI do pool, ausente FICA e paga. Sem o preço, ausente
  // e certo empatavam.
  it("o errado sai pelo filtro; o ausente fica e paga", () => {
    const heroOferta = contrato({ dispositivo: "hero_oferta_cupom" })
    const { dentro, fora } = doDispositivoPedido(
      [{ contrato: heroOferta }, { contrato: hero13 }, { contrato: hero9 }],
      PEDE_PERGUNTA,
    )
    expect(fora).toBe(1)
    expect(dentro).toHaveLength(2)
    expect(custoDeIncompatibilidade(hero13, PEDE_PERGUNTA)).toBeGreaterThan(
      custoDeIncompatibilidade(hero9, PEDE_PERGUNTA),
    )
  })
})

// ── Passo 19: o dispositivo pedido é filtro, não preço ─────────────────

describe("doDispositivoPedido", () => {
  it("sem dispositivo pedido, ninguém sai", () => {
    const { dentro, fora } = doDispositivoPedido(
      [{ contrato: contrato({ dispositivo: "body_comparacao" }) }],
      { cupom: false },
    )
    expect(dentro).toHaveLength(1)
    expect(fora).toBe(0)
  })

  // Medido em 15/09: 8 das 17 variantes ativas de `hero` têm a coluna
  // `dispositivo` NULL — o backfill da B3 subiu como proposta reversível e o
  // NOT NULL ainda não existe. Um filtro literal (`=== pedido`) apagaria 47%
  // da hero, e hero vazia é FATAL desde o Passo 11: falta de CADASTRO viraria
  // falha de geração.
  it("variante sem dispositivo cadastrado FICA — não saber não é violar", () => {
    const { dentro, fora } = doDispositivoPedido(
      [
        { contrato: contrato({ dispositivo: null }) },
        { contrato: contrato({ dispositivo: "hero_pergunta" }) },
      ],
      { dispositivo: "hero_lineup" },
    )
    expect(dentro).toHaveLength(1)
    expect(dentro[0].contrato?.dispositivo).toBeNull()
    expect(fora).toBe(1)
  })

  // A comparação é a de `conflitoDeDispositivo`, a MESMA do filtro de
  // elegibilidade: um `===` local divergiria em caixa e espaço, que é o
  // engano por apelido que este repo já pagou.
  it("compara normalizado, como o filtro de elegibilidade", () => {
    const { fora } = doDispositivoPedido([{ contrato: contrato({ dispositivo: " Body_Garantias " }) }], {
      dispositivo: "body_garantias",
    })
    expect(fora).toBe(0)
  })
})

describe("menosIncompativel — dispositivo pedido (Passo 19)", () => {
  // O buraco medido: `filtrarPorRequisitos` é fail-open no CONJUNTO (zerou a
  // seção, devolve todas), então uma posição que pede `body_garantias` numa
  // seção sem nenhuma chegava aqui com o pool inteiro — e a "menos
  // incompatível" era uma `body_comparacao`, outra FORMA entregue ao cliente
  // no lugar da decidida. Agora a posição cai e a lacuna sobe com nome.
  it("nenhuma do dispositivo pedido: a posição cai, não entra outra forma", () => {
    const escolha = menosIncompativel(
      [
        { variant_id: "body-4", contrato: contrato({ dispositivo: "body_comparacao", n_itens: 3 }) },
        { variant_id: "body-2", contrato: contrato({ dispositivo: "body_tese", n_itens: 3 }) },
      ],
      { dispositivo: "body_garantias", cupom: false },
      "body",
    )
    expect(escolha).toBeNull()
  })

  it("com o dispositivo pedido presente, ele vence a mais barata de outra forma", () => {
    const escolha = menosIncompativel(
      [
        // Contrato perfeito, forma errada: antes vencia por custo 0 vs 40.
        { variant_id: "body-tese", contrato: contrato({ dispositivo: "body_tese", tem_preco: true, n_itens: 2 }) },
        { variant_id: "body-gar", contrato: contrato({ dispositivo: "body_garantias", n_itens: 2 }) },
      ],
      { ...PRODUCTS_HERO_BOXERS, dispositivo: "body_garantias" },
      "body",
    )
    expect(escolha?.variant_id).toBe("body-gar")
    expect(escolha?.fora_do_dispositivo).toBe(1)
  })

  // As duas contagens pedem ações opostas da curadoria: descarte é acerto do
  // filtro, "não existe a forma" é lacuna de biblioteca. Somá-las apagaria a
  // diferença justamente na telemetria que decide o que cadastrar.
  it("separa 'descartada pela decisão' de 'outra forma'", () => {
    const escolha = menosIncompativel(
      [
        { variant_id: "body-gar", contrato: contrato({ dispositivo: "body_garantias", n_itens: 3 }) },
        { variant_id: "body-tese", contrato: contrato({ dispositivo: "body_tese", n_itens: 3 }) },
      ],
      { dispositivo: "body_garantias", cupom: false, n_itens: { min: 3, max: 3 } },
      "body",
      new Set(),
      // Descarte de um dispositivo que nem chega a ser considerado.
      [{ dispositivo: "body_comparacao" }],
    )
    expect(escolha?.variant_id).toBe("body-gar")
    expect(escolha?.fora_do_dispositivo).toBe(1)
    expect(escolha?.descartadas_por_dispositivo).toBe(0)
  })

  // Seção ainda não classificada não pode travar: todas ficam e a régua volta
  // a ser a de contrato.
  it("seção inteira sem classificação continua resgatável", () => {
    const escolha = menosIncompativel(
      [
        { variant_id: "hero-2", contrato: contrato({ dispositivo: null }) },
        { variant_id: "hero-1", contrato: contrato({ dispositivo: null }) },
      ],
      { dispositivo: "hero_lineup", cupom: false },
      "hero",
    )
    expect(escolha?.variant_id).toBe("hero-1")
    expect(escolha?.fora_do_dispositivo).toBe(0)
  })
})

// ── A ordem, isolada (16/09) ────────────────────────────────────────────
//
// Ela decide qual peça vai ao cliente quando o Curador deixou a posição
// vazia, e viveu meses inline dentro do `menosIncompativel`, sem teste
// próprio — foi assim que o desempate por "anatomia mais rica" sobreviveu.

describe("ordenarCandidatas", () => {
  const c = (id: string, over: Record<string, unknown> = {}) => ({
    variant_id: id,
    contrato: { copy: 3, n_itens: null, dispositivo: null } as never,
    usos: 0,
    ...over,
  })

  it("é pura: não muta nem reordena o array recebido", () => {
    const entrada = [c("b"), c("a")]
    const copia = entrada.map((x) => x.variant_id)
    ordenarCandidatas(entrada, null)
    expect(entrada.map((x) => x.variant_id)).toEqual(copia)
  })

  it("custo vence tudo — inclusive a mais rica e a nunca usada", () => {
    // A que entrega MENOS itens do que o mínimo pedido custa caro; a outra
    // ganha mesmo tendo mais campos e mais usos.
    const r = ordenarCandidatas(
      [
        c("faltando", { usos: 0, contrato: { copy: 9, n_itens: 1, dispositivo: null } as never }),
        c("cabe", { usos: 9, contrato: { copy: 1, n_itens: 4, dispositivo: null } as never }),
      ],
      { n_itens: { min: 4 } } as never,
    )
    expect(r[0].variant_id).toBe("cabe")
    expect(r[0].custo).toBeLessThan(r[1].custo)
  })

  it("empatada em custo, vence a MENOS usada — nunca a de mais campos", () => {
    const r = ordenarCandidatas([c("usada", { usos: 9 }), c("nova", { usos: 0, contrato: { copy: 1, n_itens: null, dispositivo: null } as never })], null)
    expect(r[0].variant_id).toBe("nova")
  })

  it("empate total desempata por id — a escolha é estável entre execuções", () => {
    const r1 = ordenarCandidatas([c("z"), c("a")], null)
    const r2 = ordenarCandidatas([c("a"), c("z")], null)
    expect(r1.map((x) => x.variant_id)).toEqual(r2.map((x) => x.variant_id))
    expect(r1[0].variant_id).toBe("a")
  })

  it("lista vazia devolve lista vazia", () => {
    expect(ordenarCandidatas([], null)).toEqual([])
  })
})
