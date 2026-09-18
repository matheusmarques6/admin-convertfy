/**
 * O QA do funil de aplicação, percorrido pela engine de produção.
 *
 * Os caminhos são os da seção 8 da especificação. Cada um é um modo de
 * falha que não aparece em tela: a trilha global que não desvia, o corte
 * de faturamento que deixa passar, o score que não soma, a conta que cai
 * no fallback e imprime frase pela metade.
 */

import { describe, expect, it } from "vitest"
import {
  CALCULOS,
  FINAL,
  REF,
  camposDoFunil,
  rascunhoDoFunil,
  schemaDoFunil,
  TAG_RISCO,
} from "./funil-aplicacao"
import { blocosDaTela, primeiroBloco, proximoPasso } from "./engine"
import { calcular, moedaDeclarada, variaveisDasRespostas } from "./calculo"
import { aplicarRecall } from "./recall"
import { normalizarMidia, urlDeMidiaUtil } from "./midia"
import { desfechoNoCrm } from "./desfecho"
import { montarVersao } from "./publicar"
import type { FormAnswers } from "@/types/forms-conversational"

const schema = schemaDoFunil()

interface Percurso {
  telas: string[]
  ending: string | null
  variables: Record<string, string | number>
}

/** Anda pelo formulário respondendo o que foi pedido, até o fim. */
function percorrer(answers: FormAnswers): Percurso {
  const inicio = primeiroBloco(schema)
  if (inicio.tipo !== "bloco") throw new Error("o funil não começa num bloco")

  const telas: string[] = [inicio.ref]
  let variables: Record<string, string | number> = {}
  let atual = inicio.ref

  for (let i = 0; i < 60; i++) {
    const r = proximoPasso(schema, atual, { answers, variables })
    variables = r.variables
    if (r.destino.tipo === "fim") return { telas, ending: r.destino.ending, variables }
    if (r.destino.tipo === "erro") throw new Error(`${r.destino.motivo} em ${r.destino.ref}`)
    telas.push(r.destino.ref)
    atual = r.destino.ref
  }
  throw new Error("o percurso não terminou")
}

const CONTATO: FormAnswers = {
  [REF.nome]: "Ana",
  [REF.whatsapp]: "+5511999998888",
  [REF.email]: "ana@lojinha.com",
  [REF.site]: "https://lojinha.com",
}

describe("caminho 1 · Brasil, marca própria, R$500 mil–1 milhão", () => {
  const answers: FormAnswers = {
    ...CONTATO,
    [REF.operacao]: "marca",
    [REF.mercado]: "br",
    [REF.faturamento_br]: "500k_1m",
    [REF.acessos]: "1000_3000",
    [REF.ticket_br]: "200_400",
    [REF.carrinho]: "nada",
    [REF.recompra]: "quase_nenhum",
    [REF.estado_email]: "parado",
    [REF.o_que_muda]: "margem",
    [REF.ja_tentou]: "agencia",
    [REF.decisao]: "sozinho",
    [REF.compromisso]: "sim",
  }

  it("termina no final aprovado", () => {
    expect(percorrer(answers).ending).toBe(FINAL.aprovado)
  })

  it("não passa pela trilha global nem pelas telas em dólar", () => {
    const { telas } = percorrer(answers)
    for (const ref of [
      REF.faturamento_global,
      REF.ticket_global,
      REF.reducao_danos,
      REF.mensagens_entrega,
      REF.gateway,
    ]) {
      expect(telas).not.toContain(ref)
    }
  })

  it("soma o score de cada resposta que pontua", () => {
    // marca 15 + faixa 25 + carrinho 15 + recompra 15 + email 15
    // + decisão 20 + compromisso 10 = 115
    expect(percorrer(answers).variables.score).toBe(115)
  })

  it("a conta da tela 9 sai inteira, em real", () => {
    const { variables } = percorrer(answers)
    const numeros = variaveisDasRespostas(schema.blocks, answers)
    const { textos } = calcular(CALCULOS, numeros, moedaDeclarada(variables) ?? "BRL")
    const bloco = schema.blocks.find((b) => b.ref === REF.mat1)!
    const texto = aplicarRecall(bloco.description, {
      answers,
      variables: { ...variables, ...textos },
      blocks: schema.blocks,
    })
    expect(texto).not.toContain("{{")
    // 2.000 acessos, ticket 300: 200 carrinhos, 30 vendas, 170 perdidos,
    // 8 pedidos/dia, R$2.400/dia, R$72 mil/mês.
    expect(texto).toContain("200 colocam no carrinho")
    expect(texto).toContain("8 pedidos a mais por dia")
    expect(texto).toContain("R$72 mil por mês")
    expect(texto).not.toContain("US$")
  })
})

describe("caminho 2 · Brasil, até R$100 mil", () => {
  it("cai no final de faturamento sem passar pelo resto", () => {
    const r = percorrer({
      ...CONTATO,
      [REF.operacao]: "marca",
      [REF.mercado]: "br",
      [REF.faturamento_br]: "ate_100k",
    })
    expect(r.ending).toBe(FINAL.faturamento)
    expect(r.telas).not.toContain(REF.acessos)
    expect(r.telas).not.toContain(REF.preco)
  })
})

describe("caminho 3 · agência na tela 4", () => {
  it("cai no final de perfil na hora", () => {
    const r = percorrer({ ...CONTATO, [REF.operacao]: "agencia" })
    expect(r.ending).toBe(FINAL.perfil)
    expect(r.telas).not.toContain(REF.mercado)
  })
})

describe("caminho 4 · Europa, US$25–50 mil, com risco de gateway", () => {
  const answers: FormAnswers = {
    ...CONTATO,
    [REF.operacao]: "drop",
    [REF.mercado]: "eu",
    [REF.faturamento_global]: "25_50k",
    [REF.acessos]: "3000_10000",
    [REF.ticket_global]: "60_120",
    [REF.carrinho]: "email_padrao",
    [REF.recompra]: "dois_tres",
    [REF.mensagens_entrega]: "rastreio",
    [REF.gateway]: ["reserva", "abaixo_05"],
    [REF.estado_email]: "nada",
    [REF.o_que_muda]: "caixa",
    [REF.ja_tentou]: "sozinho",
    [REF.decisao]: "socio",
    [REF.compromisso]: "sim",
  }

  it("as três telas da trilha global aparecem, e as de real não", () => {
    const { telas } = percorrer(answers)
    expect(telas).toContain(REF.reducao_danos)
    expect(telas).toContain(REF.mensagens_entrega)
    expect(telas).toContain(REF.gateway)
    expect(telas).toContain(REF.ticket_global)
    expect(telas).not.toContain(REF.faturamento_br)
    expect(telas).not.toContain(REF.ticket_br)
  })

  it("a conta sai em DÓLAR", () => {
    const { variables } = percorrer(answers)
    expect(moedaDeclarada(variables)).toBe("USD")
    const { textos } = calcular(CALCULOS, variaveisDasRespostas(schema.blocks, answers), "USD")
    expect(textos.receita_mes.startsWith("US$")).toBe(true)
    expect(textos.fat_mes).toBe("US$37 mil")
  })

  it("marcar uma opção de risco soma, mesmo com uma opção sem risco junto", () => {
    // drop 15 + faixa 20 + carrinho 12 + recompra 10 + entrega 12
    // + gateway 20 + email 15 + decisão 10 + compromisso 10 = 124
    expect(percorrer(answers).variables.score).toBe(124)
  })

  it("termina aprovado", () => {
    expect(percorrer(answers).ending).toBe(FINAL.aprovado)
  })
})

describe("cortes e desvios que não podem regredir", () => {
  it("global até US$10 mil tem o final na moeda dele", () => {
    const r = percorrer({
      ...CONTATO,
      [REF.operacao]: "drop",
      [REF.mercado]: "us",
      [REF.faturamento_global]: "ate_10k",
    })
    expect(r.ending).toBe(FINAL.faturamento_global)
  })

  it('"só quero entender" não recebe o texto de quem fatura pouco', () => {
    const r = percorrer({
      ...CONTATO,
      [REF.operacao]: "marca",
      [REF.mercado]: "br",
      [REF.faturamento_br]: "1_5m",
      [REF.acessos]: "mais_10000",
      [REF.ticket_br]: "acima_800",
      [REF.carrinho]: "nada",
      [REF.recompra]: "metade",
      [REF.estado_email]: "bom",
      [REF.o_que_muda]: "verba",
      [REF.ja_tentou]: "nunca",
      [REF.decisao]: "so_entender",
    })
    expect(r.ending).toBe(FINAL.sem_intencao)
    const texto = schema.endings!.find((e) => e.ref === FINAL.sem_intencao)!.description!
    expect(texto).not.toContain("não se paga")
  })

  it("quem não garante presença ainda chega ao final aprovado, com score menor", () => {
    const base: FormAnswers = {
      ...CONTATO,
      [REF.operacao]: "marca",
      [REF.mercado]: "br",
      [REF.faturamento_br]: "200_500k",
      [REF.acessos]: "300_1000",
      [REF.ticket_br]: "100_200",
      [REF.carrinho]: "sequencia",
      [REF.recompra]: "metade",
      [REF.estado_email]: "bom",
      [REF.o_que_muda]: "time",
      [REF.ja_tentou]: "basico",
      [REF.decisao]: "time",
    }
    const sim = percorrer({ ...base, [REF.compromisso]: "sim" })
    const nao = percorrer({ ...base, [REF.compromisso]: "nao_garanto" })
    expect(sim.ending).toBe(FINAL.aprovado)
    expect(nao.ending).toBe(FINAL.aprovado)
    expect(Number(nao.variables.score)).toBeLessThan(Number(sim.variables.score))
  })
})

describe("a forma do funil", () => {
  it("a primeira tela pede nome, WhatsApp e e-mail juntos", () => {
    const inicio = primeiroBloco(schema)
    if (inicio.tipo !== "bloco") throw new Error("não começa num bloco")
    const refs = blocosDaTela(schema, inicio.ref).map((b) => b.ref)
    expect(refs).toEqual([REF.nome, REF.whatsapp, REF.email])
  })

  it("todo texto com recall resolve com as respostas de um caminho completo", () => {
    const answers: FormAnswers = {
      ...CONTATO,
      [REF.operacao]: "marca",
      [REF.mercado]: "br",
      [REF.faturamento_br]: "500k_1m",
      [REF.acessos]: "1000_3000",
      [REF.ticket_br]: "200_400",
      [REF.carrinho]: "nada",
      [REF.recompra]: "quase_nenhum",
      [REF.estado_email]: "parado",
      [REF.o_que_muda]: "margem",
      [REF.ja_tentou]: "agencia",
      [REF.decisao]: "sozinho",
      [REF.compromisso]: "sim",
    }
    const { variables, telas } = percorrer(answers)
    const { textos } = calcular(
      CALCULOS,
      variaveisDasRespostas(schema.blocks, answers),
      moedaDeclarada(variables) ?? "BRL",
    )
    const ctx = { answers, variables: { ...variables, ...textos }, blocks: schema.blocks }
    for (const ref of telas) {
      const b = schema.blocks.find((x) => x.ref === ref)!
      expect(aplicarRecall(b.label, ctx)).not.toContain("{{")
      expect(aplicarRecall(b.description, ctx)).not.toContain("{{")
    }
    const aprovado = schema.endings!.find((e) => e.ref === FINAL.aprovado)!
    expect(aplicarRecall(aprovado.title, ctx)).toContain("Ana")
  })

  it("publicar preserva a lógica, as variáveis e os finais", () => {
    const { schema: novo, regras_descartadas, finais_orfaos } = montarVersao(
      camposDoFunil(),
      schema,
      { display_mode: "conversational", version: 2 },
    )
    expect(regras_descartadas).toEqual([])
    expect(finais_orfaos).toEqual([])
    const fat = novo.blocks.find((b) => b.ref === REF.faturamento_br)!
    expect(fat.variavel).toBe("fat_val")
    expect(fat.proximo).toBe(REF.acessos)
    expect(fat.logic?.[0]?.goto).toBe(`ending:${FINAL.faturamento}`)
    expect(novo.endings?.map((e) => e.ref)).toContain(FINAL.sem_intencao)
    expect(novo.settings?.calculos?.length).toBe(CALCULOS.length)
  })

  it("o rascunho enxuto + os campos devolvem o funil inteiro", () => {
    // O `draft_schema` guarda só o que a tabela de campos não guarda. O
    // teste é a garantia de que o enxuto não perdeu nada: montado com os
    // campos, ele tem de dar exatamente o mesmo schema.
    const { schema: montado } = montarVersao(camposDoFunil(), rascunhoDoFunil(), {
      display_mode: "conversational",
      version: 1,
    })
    expect(montado).toEqual(schema)
  })

  it("nenhuma regra aponta para um destino que não existe", () => {
    const refs = new Set(schema.blocks.map((b) => b.ref))
    const finais = new Set(schema.endings!.map((e) => e.ref))
    const destinos = [
      ...schema.blocks.flatMap((b) => (b.logic ?? []).map((r) => r.goto)),
      ...schema.blocks.map((b) => b.proximo).filter(Boolean),
    ] as string[]
    for (const d of destinos) {
      if (d.startsWith("ending:")) expect(finais.has(d.slice(7))).toBe(true)
      else expect(refs.has(d)).toBe(true)
    }
  })
})

describe("as provas na tela", () => {
  const campos = camposDoFunil()
  const por = (ref: string) => campos.find((c) => c.id === ref)!

  it("a prova entra como mídia normalizada nas três telas escolhidas", () => {
    for (const ref of [REF.mat1, REF.mat2, REF.ja_tentou]) {
      const m = normalizarMidia(por(ref).media)
      expect(m, ref).not.toBeNull()
      expect(m!.tipo).toBe("imagem")
      // Sem alt, o leitor de tela anuncia o nome do arquivo de um print
      // que carrega o número que a tela inteira existe para provar.
      expect(m!.alt).toBeTruthy()
    }
  })

  it("a tela sem prova disponível fica SEM imagem, não com uma emprestada", () => {
    // A página de vendas não tem print da régua de rastreio nem da
    // cláusula em imagem. Pôr ali um painel de receita ilustraria outra
    // afirmação — enfeite numa tela que pede confiança.
    expect(por(REF.reducao_danos).media).toBeNull()
    expect(por(REF.preco).media).toBeNull()
  })

  it("toda prova aponta para endereço que abre sem login", () => {
    for (const c of campos) {
      if (!c.media) continue
      const url = (c.media as { url: string }).url
      expect(urlDeMidiaUtil(url), url).toBe(true)
      expect(url.startsWith("https://"), url).toBe(true)
    }
  })

  it("a prova sobrevive à publicação", () => {
    // `media` é coluna da tabela de campos, então ela volta pelo `base`
    // do montarVersao — mas é justamente o tipo de coisa que some numa
    // refatoração do mapeamento, e só o lead veria.
    const { schema: novo } = montarVersao(camposDoFunil(), rascunhoDoFunil(), {
      display_mode: "conversational",
      version: 1,
    })
    expect(novo.blocks.find((b) => b.ref === REF.mat1)?.midia?.url).toContain("omnisend-2")
  })
})

describe("o que cada desfecho faz no CRM", () => {
  const caminhoTodo = new Set(camposDoFunil().map((c) => c.id))

  it("aprovado vira card com a tag de qualificado", () => {
    const d = desfechoNoCrm(schema, FINAL.aprovado, {}, caminhoTodo)
    expect(d.criaNegocio).toBe(true)
    expect(d.tags).toContain("qualificado")
  })

  it("os quatro desfechos que recusam NÃO criam card", () => {
    // Um funil de aplicação recusa mais do que aprova. Se cada recusa
    // virasse card, o time abriria o Inbound e veria, no meio dos leads
    // bons, gente que acabou de ler que a conta não fecha.
    for (const ref of [
      FINAL.faturamento,
      FINAL.faturamento_global,
      FINAL.perfil,
      FINAL.sem_intencao,
    ]) {
      const d = desfechoNoCrm(schema, ref, {}, caminhoTodo)
      expect(d.criaNegocio, ref).toBe(false)
      expect(d.tags.length, ref).toBeGreaterThan(0)
    }
  })

  it("marcar risco de gateway põe a tag uma vez só", () => {
    const d = desfechoNoCrm(
      schema,
      FINAL.aprovado,
      { [REF.gateway]: ["reserva", "conta_desligada", "abaixo_05"] },
      caminhoTodo,
    )
    expect(d.tags).toEqual(["qualificado", TAG_RISCO])
  })

  it("quem vende no Brasil nunca leva a tag de risco", () => {
    // A trilha brasileira não passa pela tela de gateway. Se a pessoa
    // respondeu, voltou e trocou o mercado, a resposta fica em `answers`
    // e sai do caminho — marcar ali mandaria o time abrir uma conversa
    // sobre um problema que ela não disse ter.
    const respostas = {
      ...CONTATO,
      [REF.operacao]: "marca",
      [REF.mercado]: "br",
      [REF.faturamento_br]: "500k_1m",
      [REF.acessos]: "1000_3000",
      [REF.ticket_br]: "200_400",
      [REF.carrinho]: "nada",
      [REF.recompra]: "quase_nenhum",
      [REF.gateway]: ["reserva"],
      [REF.estado_email]: "parado",
      [REF.o_que_muda]: "margem",
      [REF.ja_tentou]: "agencia",
      [REF.decisao]: "sozinho",
      [REF.compromisso]: "sim",
    }
    const { telas } = percorrer(respostas)
    const d = desfechoNoCrm(schema, FINAL.aprovado, respostas, new Set(telas))
    expect(d.tags).toEqual(["qualificado"])
  })

  it("a frase que o closer devolve vai em destaque", () => {
    const d = desfechoNoCrm(schema, FINAL.aprovado, { [REF.o_que_muda]: "margem" }, caminhoTodo)
    expect(d.destaque?.resposta).toContain("Recupero margem")
  })
})

describe("caminho 8 · a conta em três combinações de acesso e ticket", () => {
  /**
   * O risco aqui não é errar a multiplicação — é o TEXTO ficar torto
   * depois do arredondamento. Com 8,5 pedidos a frase diria "8 pedidos"
   * e "R$2.550 por dia", e 8 × 300 não dá 2.550: quem lê confere e
   * perde a confiança na conta inteira. Por isso a asserção é sobre a
   * frase renderizada, e não sobre o número solto.
   */
  function conta(respostas: FormAnswers) {
    const { variables } = percorrer({ ...CONTATO, ...respostas })
    const numeros = variaveisDasRespostas(schema.blocks, { ...CONTATO, ...respostas })
    const { textos } = calcular(CALCULOS, numeros, moedaDeclarada(variables) ?? "BRL")
    const render = (ref: string) =>
      aplicarRecall(schema.blocks.find((b) => b.ref === ref)!.description, {
        answers: { ...CONTATO, ...respostas },
        variables: { ...variables, ...textos },
        blocks: schema.blocks,
      })
    return { textos, mat1: render(REF.mat1), mat2: render(REF.mat2) }
  }

  const base = {
    [REF.operacao]: "marca",
    [REF.mercado]: "br",
    [REF.faturamento_br]: "200_500k",
    [REF.carrinho]: "nada",
    [REF.recompra]: "quase_nenhum",
    [REF.estado_email]: "nada",
    [REF.o_que_muda]: "previsibilidade",
    [REF.ja_tentou]: "agencia",
    [REF.decisao]: "sozinho",
    [REF.compromisso]: "sim",
  }

  const combinacoes: Array<[string, string, string, string]> = [
    // acessos, ticket, pedidos/dia esperados, receita/mês esperada
    ["ate_300", "ate_100", "1 pedido", "R$2.400"],
    ["1000_3000", "200_400", "8 pedidos", "R$72 mil"],
    ["mais_10000", "acima_800", "42 pedidos", "R$1,2 milhão"],
  ]

  it.each(combinacoes)(
    "acessos=%s ticket=%s produz texto coerente",
    (acessos, ticket, pedidos, receita) => {
      const { mat1 } = conta({ ...base, [REF.acessos]: acessos, [REF.ticket_br]: ticket })
      expect(mat1, "placeholder não resolvido vira frase pela metade").not.toContain("{{")
      expect(mat1).toContain(pedidos)
      expect(mat1).toContain(receita)
    },
  )

  it("o número que a frase mostra é o mesmo que a multiplicação seguinte usa", () => {
    // 300 acessos, ticket R$80: 1 pedido/dia → R$80/dia → R$2.400/mês.
    // Sem propagar o valor EXIBIDO, a frase diria "1 pedido por dia" e
    // "R$3.480 por mês" — e 1 × 80 × 30 não dá 3.480.
    const { textos } = conta({ ...base, [REF.acessos]: "ate_300", [REF.ticket_br]: "ate_100" })
    expect(textos.pedidos_dia).toBe("1")
    expect(textos.receita_dia).toBe("R$80")
    expect(textos.receita_mes).toBe("R$2.400")
  })

  it("a segunda conta (campanha) também fecha com o que ela mesma imprime", () => {
    const { mat2, textos } = conta({
      ...base,
      [REF.acessos]: "1000_3000",
      [REF.ticket_br]: "200_400",
    })
    expect(mat2).not.toContain("{{")
    expect(mat2).toContain(textos.pedidos_campanha)
    expect(mat2).toContain(textos.receita_campanha)
  })
})

describe("o final aprovado abre a NOSSA agenda", () => {
  it("só o aprovado tem destino, e ele é a agenda", () => {
    const comDestino = (schema.endings ?? []).filter((e) => e.destino)
    expect(comDestino.map((e) => e.ref)).toEqual([FINAL.aprovado])
    expect(comDestino[0].destino?.tipo).toBe("agenda")
  })

  it("a agenda não vira link: quem desenha é a tela final", () => {
    // Um `url` aqui faria a tela tratar o desfecho como redirecionamento
    // e mandar quem foi aprovado para lugar nenhum.
    const d = (schema.endings ?? []).find((e) => e.ref === FINAL.aprovado)?.destino
    expect(d?.url).toBeNull()
    expect(d?.automatico).toBe(false)
  })

  it("nenhum desfecho de recusa oferece horário", () => {
    // Marcar call com quem acabou de ler "a conta não fecha para você" é
    // o pior uso possível da agenda.
    for (const ref of [FINAL.faturamento, FINAL.faturamento_global, FINAL.perfil, FINAL.sem_intencao]) {
      const e = (schema.endings ?? []).find((x) => x.ref === ref)
      expect(e?.destino ?? null, `${ref} não pode ter destino`).toBeNull()
    }
  })
})
