import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

import {
  CRON_MAX_DURATION_S,
  JANELA_DO_TICK_MS,
  ordemDosEmails,
  type JobEmail,
} from "./email-dispatch-queue.service"
import {
  CUSTO_TIPICO_MS,
  RESERVA_POS_ESTRUTURADOR_MS,
  cabeNaJanela,
  custoTipicoDoAgente,
  relogioParaTeto,
} from "@/lib/agents/fase1-orcamento"

const ROTA = new URL(
  "../../app/api/cron/email-dispatch-queue/route.ts",
  import.meta.url,
)
const SELETOR = new URL(
  "../agents/objecoes/seletor.service.ts",
  import.meta.url,
)

/**
 * O relógio do cron não pode ser uma afirmação em comentário.
 *
 * A conta que estava escrita — `45s + 240s ≤ maxDuration 300s` — era falsa
 * e sobreviveu meses porque nada a verificava. Estes testes são a conta.
 */
describe("o relógio do cron de dispatch", () => {
  // O Next só aceita config de rota estaticamente analisável, então o
  // `maxDuration` é um literal no arquivo da rota e a constante vive no
  // serviço. Divergir é o modo de falha: a janela seria derivada de um
  // número que a função não tem.
  it("maxDuration da rota e CRON_MAX_DURATION_S dizem o mesmo", () => {
    const fonte = readFileSync(ROTA, "utf-8")
    const m = fonte.match(/^export const maxDuration = (\d+)$/m)
    expect(m, "a rota precisa declarar `export const maxDuration = <n>`").not.toBeNull()
    expect(Number(m![1])).toBe(CRON_MAX_DURATION_S)
  })

  // A janela da fase 1 tem de caber na função, com o que sobra cobrindo o
  // dispatch (seed/reconcile + POST de 15s ao n8n + updates do job).
  it("a janela da fase 1 cabe no maxDuration com reserva para o dispatch", () => {
    const max = CRON_MAX_DURATION_S * 1000
    expect(JANELA_DO_TICK_MS).toBeLessThan(max)
    expect(max - JANELA_DO_TICK_MS).toBeGreaterThanOrEqual(30_000)
  })

  // Era isto que não fechava: um e-mail leva 363s de mediana e 681s no p90
  // (43 e-mails, 14 dias), e a função tinha 300s. A fase 1 não é retomável
  // no meio — a janela precisa comportar UM e-mail inteiro.
  it("a janela comporta um e-mail inteiro no p90 medido", () => {
    const EMAIL_P90_MS = 681_000
    expect(JANELA_DO_TICK_MS).toBeGreaterThan(EMAIL_P90_MS)
  })
})

describe("a fase 1 cabe dentro da janela do tick", () => {
  // Dentro do cron o Seletor roda no pré-passo, antes do Estruturador.
  const RESTANTE_NO_ESTRUTURADOR_MS =
    JANELA_DO_TICK_MS - CUSTO_TIPICO_MS.seletor

  it("o Estruturador cabe depois da reserva do Curador", () => {
    const r = cabeNaJanela({
      custoMs: custoTipicoDoAgente("estruturador", 32_000),
      restanteMs: RESTANTE_NO_ESTRUTURADOR_MS,
      reservaMs: RESERVA_POS_ESTRUTURADOR_MS,
    })
    expect(r.cabe).toBe(true)
  })

  // A armadilha de 11/09, na forma exata em que ela dispara: reserva maior
  // com o custo estimado ainda vindo do teto de tokens. Com 32.000 tokens a
  // conta pede 371s e a mesma janela recusa — o Estruturador seria
  // desligado de novo, em silêncio.
  it("estimar pelo teto de tokens, e não pelo medido, desligaria o Estruturador", () => {
    const r = cabeNaJanela({
      custoMs: relogioParaTeto(32_000),
      restanteMs: 742_000,
      reservaMs: RESERVA_POS_ESTRUTURADOR_MS,
    })
    expect(r.cabe).toBe(false)
  })

  // A reserva existe para o Curador, que não tem substituto: sem variante
  // nenhuma a montagem é recusada e a fase 2 morre em `hero_failed`.
  it("a reserva cobre o Curador medido mais Blueprint e Subject", () => {
    const CURADOR_MAX_MS = CUSTO_TIPICO_MS.assembler_chooser
    const BLUEPRINT_E_SUBJECT_MS = 29_000
    expect(RESERVA_POS_ESTRUTURADOR_MS).toBeGreaterThan(
      CURADOR_MAX_MS + BLUEPRINT_E_SUBJECT_MS,
    )
  })

  // Agente fora da tabela mantém o comportamento de antes dela — é o que
  // garante que nada fora da fase 1 mudou de estimativa.
  it("agente sem medição cai no teto de tokens", () => {
    expect(custoTipicoDoAgente("catalogador", 8_192)).toBe(relogioParaTeto(8_192))
    expect(custoTipicoDoAgente(null, 8_192)).toBe(relogioParaTeto(8_192))
  })
})

describe("ordemDosEmails", () => {
  const e = (flow: string, n: number): JobEmail => ({
    flow_type: flow,
    email_number: n,
    architect: "pending",
    attempts: 0,
  })

  // A ordem real gravada no job b6d89e4c (24/07): o PostgREST devolveu o
  // welcome embaralhado e o pré-passo do Seletor rodou assim.
  it("põe em ordem o array que veio embaralhado do banco", () => {
    const embaralhado = [2, 5, 8, 6, 4, 1, 3, 7].map((n) => e("welcome", n))
    expect([...embaralhado].sort(ordemDosEmails).map((x) => x.email_number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ])
  })

  // Ascendente DENTRO de cada flow é o que o `ja_atacadas` do Seletor pede;
  // entre flows a ordem só precisa ser estável.
  it("agrupa por flow e mantém a numeração ascendente dentro dele", () => {
    const misto = [e("welcome", 2), e("abandoned_cart", 3), e("welcome", 1), e("abandoned_cart", 1)]
    expect([...misto].sort(ordemDosEmails).map((x) => `${x.flow_type}:${x.email_number}`)).toEqual([
      "abandoned_cart:1",
      "abandoned_cart:3",
      "welcome:1",
      "welcome:2",
    ])
  })
})

describe("o pré-passo do Seletor dentro da janela", () => {
  // Abrir a janela no cron criou um caminho de falha NOVO: `invokeAgent`
  // LANÇA "sem orçamento" quando a janela acaba, e o laço do pré-passo não
  // tem try por e-mail — o throw abortaria o pré-passo inteiro e os e-mails
  // seguintes iriam para a fase 1 sem alvo, em silêncio. A guarda tem de
  // vir ANTES da chamada.
  it("consulta a janela antes de chamar o Seletor", () => {
    const fonte = readFileSync(SELETOR, "utf-8")
    const guarda = fonte.indexOf('custoTipicoDoAgente("seletor"')
    const chamada = fonte.indexOf("const row = await runSeletor(")
    expect(guarda, "a guarda de janela sumiu do pré-passo").toBeGreaterThan(-1)
    expect(chamada).toBeGreaterThan(-1)
    expect(guarda).toBeLessThan(chamada)
  })

  // Com a janela gasta, a resposta é "não começa" — e o pré-passo para
  // limpo, deixando os e-mails `pending` para o próximo tick.
  it("com a janela gasta, o Seletor não começa", () => {
    expect(
      cabeNaJanela({ custoMs: CUSTO_TIPICO_MS.seletor, restanteMs: 20_000 }).cabe,
    ).toBe(false)
    expect(
      cabeNaJanela({ custoMs: CUSTO_TIPICO_MS.seletor, restanteMs: JANELA_DO_TICK_MS }).cabe,
    ).toBe(true)
  })

  // Um lote de 34 e-mails (o job cee6fd24, 25/07) não cabe num tick só: são
  // ~40 min de Seletor contra uma janela de 12. A fila existe exatamente
  // para isso — e o número aqui é o que garante que a conta é sabida, não
  // descoberta em produção.
  it("um job grande não cabe num tick, e isso é esperado", () => {
    const TRINTA_E_QUATRO = 34 * CUSTO_TIPICO_MS.seletor
    expect(TRINTA_E_QUATRO).toBeGreaterThan(JANELA_DO_TICK_MS)
  })
})
