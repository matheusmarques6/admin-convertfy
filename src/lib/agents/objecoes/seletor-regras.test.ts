import { describe, it, expect } from "vitest"
import { parseIntentContract } from "./intent-contract"
import { normalizarCatalogo } from "./catalogo-regras"
import { alvoSintetico, candidatasElegiveis, jaAtacadasDe, normalizarAlvo, validarAlvo } from "./seletor-regras"
import type { JaAtacada } from "./vocabulario"

const catalogo = normalizarCatalogo({
  objecoes: [
    { objecao: "Marca nova — a qualidade é boa?", tipo_de_risco: "desempenho", dimensao_confianca: "competencia", aliviador: "prova_de_terceiro", tratamento: "reviews com foto", dominante_da_categoria: true, flows_elegiveis: ["welcome"], lastro_operacional: { afirmacao: "3 reviews reais" }, severidade: 5, evidencia: "x", confianca: "alta" },
    { objecao: "Vale o que custa?", tipo_de_risco: "financeiro", dimensao_confianca: "competencia", aliviador: "comparacao_de_categoria", tratamento: "tabela nós × eles", flows_elegiveis: ["welcome", "abandoned_cart"], lastro_operacional: { afirmacao: "critérios objetivos" }, severidade: 4, evidencia: "x", confianca: "alta" },
    { objecao: "E se não servir?", tipo_de_risco: "adequacao", dimensao_confianca: "integridade", aliviador: "garantia_de_devolucao", tratamento: "troca em 30 dias", flows_elegiveis: ["welcome"], lastro_operacional: { afirmacao: "política de troca publicada" }, severidade: 3, evidencia: null, confianca: "baixa" },
    { objecao: "Já comprei e não voltei", tipo_de_risco: "psicologico", dimensao_confianca: "benevolencia", aliviador: "reputacao_da_loja", tratamento: "x", flows_elegiveis: ["win_back"], lastro_operacional: { afirmacao: "x" }, severidade: 2, evidencia: null, confianca: "baixa" },
  ],
  veiculos_de_argumento: {
    origem_da_marca: { texto: null, aplicavel: false },
    economia_do_preco: { texto: "sem loja física", aplicavel: true },
    operacao_por_pedido: { texto: null, aplicavel: true, alerta: "nada na pesquisa" },
  },
  medos_de_categoria: [{ medo: "falsificação", marca_esta_fora_porque: "fotos reais" }, { medo: "não chega", marca_esta_fora_porque: null }],
})

const w1 = parseIntentContract({ modo: "quebra_de_objecao", exige_dominante_da_categoria: true, trabalhos_fixos: ["entrega_de_incentivo"], proibicoes: ["urgência artificial"] })!
const w2 = parseIntentContract({ modo: "varredura_de_objecoes", n_objecoes: [2, 3], aliviadores_vetados: ["prova_de_terceiro"] })!
const w3 = parseIntentContract({ modo: "quebra_de_objecao", profundidade_minima: "mecanismo", permite_reataque: true, veiculos_exigidos: ["origem_da_marca", "economia_do_preco", "operacao_por_pedido"] })!
const w4 = parseIntentContract({ modo: "confirmacao_por_terceiros" })!
const w5 = parseIntentContract({ modo: "varredura_de_objecoes", n_objecoes: [4, 5] })!

/** Uma objeção por risco de `obj_N`, para montar catálogos de tamanho variável. */
function obj(objecao: string, tipo_de_risco: string, aliviador: string) {
  return { objecao, tipo_de_risco, dimensao_confianca: "competencia", aliviador, tratamento: "t",
    flows_elegiveis: ["welcome"], lastro_operacional: { afirmacao: "x" }, severidade: 3, evidencia: null, confianca: "media" }
}

/** A Hero Boxers depois dos filtros: 3 candidatas, e duas delas financeiras. */
const escasso = normalizarCatalogo({
  objecoes: [
    obj("Loja nova, dá para confiar?", "seguranca", "reputacao_da_loja"),
    obj("Caro para uma peça só", "financeiro", "comparacao_de_categoria"),
    obj("E se não servir?", "adequacao", "garantia_de_devolucao"),
    obj("Frete não compensa", "financeiro", "demonstracao_de_mecanismo"),
  ],
  veiculos_de_argumento: {}, medos_de_categoria: [],
})

const farto = normalizarCatalogo({
  objecoes: [
    obj("a", "seguranca", "reputacao_da_loja"),
    obj("b", "financeiro", "comparacao_de_categoria"),
    obj("c", "adequacao", "garantia_de_devolucao"),
    obj("d", "desempenho", "demonstracao_de_mecanismo"),
    obj("e", "tempo", "transparencia_de_politica"),
    obj("f", "psicologico", "prova_por_volume"),
  ],
  veiculos_de_argumento: {}, medos_de_categoria: [],
})

describe("normalizarAlvo", () => {
  it("modo é do contrato; objeção/tratamento/risco/aliviador saem LITERAIS do catálogo pelo id; proibições do contrato sempre entram", () => {
    const { alvo, avisos } = normalizarAlvo(
      { modo: "varredura_de_objecoes", alvos: [{ id: "obj_1", objecao: "paráfrase", tratamento: "outro", aliviador_pedido: "prova_por_volume", profundidade_de_prova: "afirmacao" }, { id: "obj_99" }], proibido_neste_toque: ["não prometer prazo"] },
      w1, catalogo, [],
    )
    expect(alvo.modo).toBe("quebra_de_objecao")
    expect(alvo.alvos).toHaveLength(1)
    expect(alvo.alvos[0]).toMatchObject({ id: "obj_1", objecao: "Marca nova — a qualidade é boa?", tratamento: "reviews com foto", aliviador_pedido: "prova_de_terceiro", primaria: true })
    expect(alvo.proibido_neste_toque).toEqual(["urgência artificial", "não prometer prazo"])
    expect(alvo.trabalhos_fixos).toContain("entrega_de_incentivo")
    expect(avisos.join(" ")).toMatch(/obj_99/)
    expect(avisos.join(" ")).toMatch(/modo devolvido/)
  })

  it("veículo aplicavel:false sai em silêncio; exigido esquecido entra por código com o insumo do catálogo", () => {
    const { alvo, avisos } = normalizarAlvo({ alvos: [{ id: "obj_2", profundidade_de_prova: "mecanismo" }], angulo_do_tratamento: [{ veiculo: "origem_da_marca", papel: "x", insumo_disponivel: true }] }, w3, catalogo, [])
    expect(alvo.angulo_do_tratamento.map((g) => g.veiculo)).toEqual(["economia_do_preco", "operacao_por_pedido"])
    expect(alvo.angulo_do_tratamento[0].insumo_disponivel).toBe(true)
    expect(alvo.angulo_do_tratamento[1].insumo_disponivel).toBe(false)
    expect(avisos.some((a) => a.includes("economia_do_preco"))).toBe(true)
  })
})

describe("validarAlvo", () => {
  it("welcome-1: a dominante tem de ser a primária", () => {
    const ok = normalizarAlvo({ alvos: [{ id: "obj_1", primaria: true, profundidade_de_prova: "afirmacao" }] }, w1, catalogo, []).alvo
    expect(validarAlvo(ok, w1, catalogo, [], "welcome")).toEqual([])
    const errado = normalizarAlvo({ alvos: [{ id: "obj_2", primaria: true }] }, w1, catalogo, []).alvo
    expect(validarAlvo(errado, w1, catalogo, [], "welcome").join("\n")).toMatch(/exige a dominante da categoria \(obj_1\)/)
  })

  it("elegibilidade dupla: flow errado e aliviador vetado reprovam; varredura exige naturezas diferentes", () => {
    const a = normalizarAlvo({ alvos: [{ id: "obj_4" }, { id: "obj_1" }] }, w2, catalogo, []).alvo
    const erros = validarAlvo(a, w2, catalogo, [], "welcome").join("\n")
    expect(erros).toMatch(/obj_4: não é elegível no flow welcome/)
    expect(erros).toMatch(/obj_1: aliviador "prova_de_terceiro" não é admissível/)
    const mesmoRisco = normalizarAlvo({ alvos: [{ id: "obj_2" }, { id: "obj_3" }] }, w2, catalogo, []).alvo
    expect(validarAlvo(mesmoRisco, w2, catalogo, [], "welcome")).toEqual([])
  })

  // Regressão da Hero Boxers (geração 7ec77a9b): o welcome-2 pede 4–5
  // objeções, e depois de tirar a já atacada no #1 a loja tinha 3
  // candidatas — o Seletor devolveu as três, o máximo possível, e foi
  // reprovado por aritmética.
  const jaObj1: JaAtacada[] = [{ id: "obj_1", email_number: 1, profundidade: "afirmacao", via: "primaria" }]

  it("piso de n_objecoes cede ao catálogo: 3 candidatas com contrato 4–5 aprovam 3 alvos", () => {
    expect(candidatasElegiveis(escasso, w5, "welcome", jaObj1)).toHaveLength(3)
    const tres = normalizarAlvo({ alvos: [{ id: "obj_2" }, { id: "obj_3" }, { id: "obj_4" }] }, w5, escasso, jaObj1).alvo
    expect(tres.alvos).toHaveLength(3)
    expect(validarAlvo(tres, w5, escasso, jaObj1, "welcome")).toEqual([])
  })

  it("com candidatas de sobra o piso do contrato vale: 3 alvos entre 6 elegíveis reprovam", () => {
    expect(candidatasElegiveis(farto, w5, "welcome", [])).toHaveLength(6)
    const tres = normalizarAlvo({ alvos: [{ id: "obj_1" }, { id: "obj_2" }, { id: "obj_3" }] }, w5, farto, []).alvo
    const erro = validarAlvo(tres, w5, farto, [], "welcome").join("\n")
    expect(erro).toMatch(/n_objecoes: 3 alvo\(s\) — o contrato pede entre 4 e 5/)
    expect(erro).not.toMatch(/piso desta loja/)
  })

  it("o teto continua sendo do contrato, com ou sem escassez", () => {
    const seis = normalizarAlvo({ alvos: [{ id: "obj_1" }, { id: "obj_2" }, { id: "obj_3" }, { id: "obj_4" }, { id: "obj_5" }, { id: "obj_6" }] }, w5, farto, []).alvo
    expect(seis.alvos).toHaveLength(6)
    expect(validarAlvo(seis, w5, farto, [], "welcome").join("\n")).toMatch(/o contrato pede entre 4 e 5/)
  })

  it("naturezas repetidas só reprovam quando havia natureza sobrando", () => {
    // 3 candidatas em 2 riscos: repetir financeiro é inevitável.
    const inevitavel = normalizarAlvo({ alvos: [{ id: "obj_2" }, { id: "obj_3" }, { id: "obj_4" }] }, w5, escasso, jaObj1).alvo
    expect(validarAlvo(inevitavel, w5, escasso, jaObj1, "welcome")).toEqual([])
    // Os dois financeiros deixando a adequação de fora: aí é escolha.
    const evitavel = normalizarAlvo({ alvos: [{ id: "obj_2" }, { id: "obj_4" }] }, w5, escasso, jaObj1).alvo
    expect(validarAlvo(evitavel, w5, escasso, jaObj1, "welcome").join("\n")).toMatch(/naturezas diferentes: obj_2 e obj_4/)
  })

  it("não repetir: sem permite_reataque reprova; com reataque a profundidade tem de subir", () => {
    const ja: JaAtacada[] = [{ id: "obj_1", email_number: 1, profundidade: "afirmacao", via: "primaria" }]
    const repete = normalizarAlvo({ alvos: [{ id: "obj_1", profundidade_de_prova: "afirmacao" }] }, w2, catalogo, ja).alvo
    expect(validarAlvo(repete, w2, catalogo, ja, "welcome").join("\n")).toMatch(/não permite reataque/)
    const sobe = normalizarAlvo({ alvos: [{ id: "obj_1", profundidade_de_prova: "mecanismo" }] }, w3, catalogo, ja).alvo
    expect(validarAlvo(sobe, w3, catalogo, ja, "welcome")).toEqual([])
    const naoSobe = normalizarAlvo({ alvos: [{ id: "obj_1", profundidade_de_prova: "afirmacao" }] }, w3, catalogo, ja).alvo
    expect(validarAlvo(naoSobe, w3, catalogo, ja, "welcome").join("\n")).toMatch(/abaixo do piso|reataque só com profundidade acima/)
  })

  it("confirmação por terceiros: só objeção já atacada, subindo para prova_de_terceiro", () => {
    const ja: JaAtacada[] = [{ id: "obj_2", email_number: 1, profundidade: "afirmacao", via: "primaria" }]
    const nova = normalizarAlvo({ alvos: [{ id: "obj_1", profundidade_de_prova: "prova_de_terceiro" }, { id: "obj_2", profundidade_de_prova: "prova_de_terceiro" }] }, w4, catalogo, ja).alvo
    const erros = validarAlvo(nova, w4, catalogo, ja, "welcome").join("\n")
    expect(erros).toMatch(/obj_1: confirmacao_por_terceiros só confirma objeção JÁ atacada/)
    expect(erros).not.toMatch(/obj_2:/)
  })

  it("lastro: garantia sem verificado exige alerta_de_lastro; lacuna vale mais que alvo vazio sem explicação", () => {
    const c = parseIntentContract({ modo: "quebra_de_objecao", profundidade_minima: "garantia", riscos_elegiveis: ["adequacao"] })!
    const semAlerta = normalizarAlvo({ alvos: [{ id: "obj_3", profundidade_de_prova: "garantia" }] }, c, catalogo, []).alvo
    expect(validarAlvo(semAlerta, c, catalogo, [], "welcome").join("\n")).toMatch(/lastro NÃO verificado/)
    const comAlerta = normalizarAlvo({ alvos: [{ id: "obj_3", profundidade_de_prova: "garantia" }], alerta_de_lastro: "política não conferida" }, c, catalogo, []).alvo
    expect(validarAlvo(comAlerta, c, catalogo, [], "welcome")).toEqual([])
    const vazio = normalizarAlvo({ alvos: [] }, c, catalogo, []).alvo
    expect(validarAlvo(vazio, c, catalogo, [], "welcome").join("\n")).toMatch(/nenhum alvo e nenhuma lacuna/)
    const lacuna = normalizarAlvo({ alvos: [], lacuna: { motivo: "sem objeção de adequação com lastro" } }, c, catalogo, []).alvo
    expect(validarAlvo(lacuna, c, catalogo, [], "welcome")).toEqual([])
  })

  it("modos sem objeção: alvos vazios; manutenção exige promessa; varredura de canal usa medos com lastro", () => {
    const m = parseIntentContract({ modo: "manutencao_de_confianca" })!
    expect(validarAlvo(normalizarAlvo({ alvos: [{ id: "obj_1" }] }, m, catalogo, []).alvo, m, catalogo, [], "shipping_stages").join("\n")).toMatch(/não ataca objeção|exige promessa_a_pagar/)
    expect(validarAlvo(normalizarAlvo({ promessa_a_pagar: "prazo do e-mail de confirmação" }, m, catalogo, []).alvo, m, catalogo, [], "shipping_stages")).toEqual([])
    const canal = parseIntentContract({ modo: "varredura_de_canal" })!
    const ok = normalizarAlvo({ medos_alvo: ["falsificação"] }, canal, catalogo, []).alvo
    expect(validarAlvo(ok, canal, catalogo, [], "welcome")).toEqual([])
    const semLastro = normalizarAlvo({ medos_alvo: ["não chega"] }, canal, catalogo, []).alvo
    expect(validarAlvo(semLastro, canal, catalogo, [], "welcome").join("\n")).toMatch(/não está no catálogo com lastro/)
  })
})

describe("candidatasElegiveis, jaAtacadasDe, alvoSintetico", () => {
  it("candidatas cruzam flow × risco × aliviador × reataque", () => {
    expect(candidatasElegiveis(catalogo, w2, "welcome", []).map((o) => o.id)).toEqual(["obj_2", "obj_3"])
    const ja: JaAtacada[] = [{ id: "obj_2", email_number: 1, profundidade: "afirmacao", via: "primaria" }]
    expect(candidatasElegiveis(catalogo, w2, "welcome", ja).map((o) => o.id)).toEqual(["obj_3"])
    expect(candidatasElegiveis(catalogo, w4, "welcome", ja).map((o) => o.id)).toEqual(["obj_2"])
  })
  it("jaAtacadasDe ordena por email e marca via primaria/varredura", () => {
    const t2 = normalizarAlvo({ alvos: [{ id: "obj_2", primaria: true }, { id: "obj_3" }] }, w2, catalogo, []).alvo
    const t1 = normalizarAlvo({ alvos: [{ id: "obj_1", primaria: true }] }, w1, catalogo, []).alvo
    expect(jaAtacadasDe([{ email_number: 2, target: t2 }, { email_number: 1, target: t1 }])).toEqual([
      { id: "obj_1", email_number: 1, profundidade: "afirmacao", via: "primaria" },
      { id: "obj_2", email_number: 2, profundidade: "afirmacao", via: "primaria" },
      { id: "obj_3", email_number: 2, profundidade: "afirmacao", via: "varredura" },
    ])
  })
  it("alvoSintetico declara lacuna e nada mais", () => {
    const s = alvoSintetico(w1, "seletor_falhou", "json ilegível")
    expect(s.alvos).toEqual([])
    expect(s.lacuna).toEqual({ motivo: "seletor_falhou", detalhe: "json ilegível" })
    expect(s.proibido_neste_toque).toEqual(["urgência artificial"])
    expect(alvoSintetico(null, "sem_contrato", null).modo).toBe("quebra_de_objecao")
  })
})

describe("incentivo, insumos permitidos, dedupe e contradições (09/09)", () => {
  it("incentivo vem do TOQUE por código (o modelo e o catálogo do Catalogador não decidem); proibições deduplicadas por chave; insumos só com origem", () => {
    // O catálogo do Catalogador diz que HÁ incentivo — e é ignorado: quem
    // decide é o outline do toque, resolvido fora daqui (14/09).
    const cat = normalizarCatalogo({
      ...catalogo,
      incentivo: { existe: true, valor: "10%", codigo: "DOCATALOGO", condicoes: null, prazo: null, campo_de_origem: null, alerta: null },
    })
    const { alvo } = normalizarAlvo(
      {
        alvos: [{ id: "obj_1", profundidade_de_prova: "afirmacao" }],
        proibido_neste_toque: ["Urgência artificial!", "não prometer prazo", "Não prometer prazo."],
        insumos_permitidos: ["checkout Shopify com SSL (pesquisa: plataforma)", "fato sem origem", "fibra de bambu (produto)", "Checkout Shopify com SSL (pesquisa: plataforma)"],
        incentivo: { existe: true, codigo: "INVENTADO" },
      },
      w1, cat, [], { existe: false, codigo: null, valor: null },
    )
    expect(alvo.incentivo).toEqual({ existe: false, codigo: null, valor: null })
    // Sem decisão informada, não se promete.
    expect(normalizarAlvo({ alvos: [{ id: "obj_1" }] }, w1, cat, []).alvo.incentivo).toEqual({ existe: false, codigo: null, valor: null })
    // Com o toque decidido, o alvo carrega o código traduzido.
    expect(normalizarAlvo({ alvos: [{ id: "obj_1" }] }, w1, cat, [], { existe: true, codigo: "WELCOME10", valor: "10%" }).alvo.incentivo)
      .toEqual({ existe: true, codigo: "WELCOME10", valor: "10%" })
    expect(alvo.proibido_neste_toque).toEqual(["urgência artificial", "não prometer prazo"])
    // O jargão de plataforma é traduzido na FONTE (17/09): a lista que segue
    // para o Curador, o Blueprint e o redator já sai na língua de quem compra.
    expect(alvo.insumos_permitidos).toEqual([
      "Pagamento protegido no checkout (pesquisa: plataforma)",
      "fibra de bambu (produto)",
    ])
  })

  // Os 11 insumos que o Seletor devolveu de verdade em 17/09 06:50 (run da
  // Hero Boxers). O oitavo é o que virou "Your checkout runs on Shopify:
  // PCI-compliant, SSL built in" no e-mail entregue.
  it("os insumos REAIS de 17/09 saem sem jargão e sem perder fato", () => {
    const reais = [
      "Bamboo fibre boxer shorts, $59.90 (produto: nome e preço)",
      "Premium Bamboo Fibre Socks, $31.98 (produto: nome e preço)",
      "Product URL https://heroboxers.com/products/box-hero-bamboo-fibre-boxer-shorts (produto: link)",
      "Brand built for men over 50 whose bodies no longer match the generic mold underwear is cut for (pesquisa: origem_da_marca — não verificado)",
      "Sizing up at a department store adds fabric in the legs but keeps the same tight waistband (pesquisa: origem_da_marca — não verificado)",
      "Bamboo fibre is softer than cotton and moisture-wicking (pesquisa: mecanismo_unico — não verificado)",
      "Waistband sits above the abdomen rather than digging into it; leg opening proportioned to avoid riding up during a full day sitting (pesquisa: mecanismo_unico — não verificado)",
      "Store runs on Shopify, PCI-compliant checkout with SSL by default (pesquisa: medos_de_categoria — plataforma)",
      "Real buyer reviews are published on the site (catálogo: lastro obj_1 — não verificado)",
      "Customer testimonials describe concrete day-to-day fit differences: waistband that doesn't dig, fabric that doesn't ride up (catálogo: lastro obj_4 — não verificado, usar sem números)",
      "Brand sells only its own proprietary bamboo boxer design, no third-party resellers (pesquisa: medos_de_categoria)",
    ]
    const { alvo, avisos } = normalizarAlvo(
      { alvos: [{ id: "obj_1" }], insumos_permitidos: reais },
      w1, normalizarCatalogo(catalogo), [],
    )
    const saida = alvo.insumos_permitidos ?? []
    // Nenhum insumo perdido: os 11 continuam 11.
    expect(saida).toHaveLength(11)
    expect(saida.join(" | ")).not.toMatch(/shopify|pci|\bssl\b/i)
    expect(saida[7]).toBe("Secure, protected checkout (pesquisa: medos_de_categoria — plataforma)")
    // O link do produto não pode ser confundido com argumento de segurança.
    expect(saida[2]).toBe(reais[2])
    // A reescrita é registrada — a run diz o que foi trocado e por quê.
    expect(avisos.some((a) => /língua de quem compra/.test(a))).toBe(true)
  })

  it("o caso da Hero Boxers: tratamento pede política de troca e a proibição a nega → contradição, alvo mantido", () => {
    const cat = normalizarCatalogo({
      ...catalogo,
      objecoes: [
        { objecao: "Nunca ouvi falar, não confio meu cartão", tipo_de_risco: "seguranca", dimensao_confianca: "integridade", aliviador: "seguranca_de_pagamento", tratamento: "secure-payment badge and plain-language return policy", dominante_da_categoria: true, flows_elegiveis: ["welcome"], lastro_operacional: { afirmacao: "x" }, severidade: 5, evidencia: "x", confianca: "alta" },
      ],
    })
    const c = parseIntentContract({ modo: "quebra_de_objecao" })!
    const { alvo } = normalizarAlvo(
      { alvos: [{ id: "obj_1", profundidade_de_prova: "afirmacao" }], proibido_neste_toque: ["não afirmar política de devolução — não encontrado na pesquisa"] },
      c, cat, [],
    )
    expect(alvo.alvos).toHaveLength(1)
    expect(alvo.contradicoes).toHaveLength(1)
    expect(alvo.contradicoes?.[0]).toMatchObject({ motivo: "tratamento_sem_insumo" })
    expect(alvo.contradicoes?.[0].detalhe).toContain("política de troca/devolução")
    expect(alvo.lacuna).toBeNull()
  })

  it("sem proibição na mesma família não há contradição; alvo sintético carrega o incentivo do toque", () => {
    const { alvo } = normalizarAlvo({ alvos: [{ id: "obj_3", profundidade_de_prova: "afirmacao" }], proibido_neste_toque: ["urgência artificial"] }, w1, catalogo, [])
    expect(alvo.contradicoes).toEqual([])
    expect(alvoSintetico(w1, "seletor_falhou", null, [], { existe: true, codigo: "HERO10", valor: "10%" }).incentivo).toEqual({ existe: true, codigo: "HERO10", valor: "10%" })
    expect(alvoSintetico(w1, "seletor_falhou", null).incentivo).toEqual({ existe: false, codigo: null, valor: null })
  })
})

// Q6 (19/09): alerta de pesquisa sai das proibições; tradução colapsa.
describe("normalizarAlvo — alertas_de_dado (Q6)", () => {
  it("separa o alerta e colapsa a tradução da canônica do contrato", () => {
    const { alvo, avisos } = normalizarAlvo(
      {
        alvos: [{ id: "obj_1", profundidade_de_prova: "afirmacao" }],
        proibido_neste_toque: [
          "No artificial urgency",
          "No support channel documented in the research. Cannot claim support quality without evidence.",
          "Do not promise delivery times",
        ],
        alertas_de_dado: ["Shipping SLA not found"],
      },
      w1,
      catalogo,
      [],
    )
    expect(alvo.proibido_neste_toque).toEqual(["urgência artificial", "Do not promise delivery times"])
    expect(alvo.alertas_de_dado).toEqual(["Shipping SLA not found", "No support channel documented in the research. Cannot claim support quality without evidence."])
    expect(avisos.some((a) => /tradução/.test(a))).toBe(true)
  })
})
