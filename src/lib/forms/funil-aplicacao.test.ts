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
} from "./funil-aplicacao"
import { blocosDaTela, primeiroBloco, proximoPasso } from "./engine"
import { calcular, moedaDeclarada, variaveisDasRespostas } from "./calculo"
import { aplicarRecall } from "./recall"
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
