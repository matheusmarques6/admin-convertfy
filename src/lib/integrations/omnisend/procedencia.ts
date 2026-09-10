/**
 * De onde veio cada número do Omnisend — e se ele é comparável com o painel.
 *
 * ── Por que este módulo existe ────────────────────────────────────────
 *
 * Relatado em 10/09/2026: a Blue Wolf publicou US$ 51,5 mil de receita
 * atribuída em agosto enquanto o painel do Omnisend mostrava
 * $51.176,38 — e o faturamento total saiu US$ 214,1 mil contra
 * $213.193,59. Perto o bastante para parecer certo, longe o bastante
 * para não fechar com nada.
 *
 * A API foi medida antes de qualquer linha de código (conta Treuquell,
 * agosto/2026, via MCP):
 *
 *  - `month` e `day` somam IGUAL (21.844,93 nos dois) — granularidade
 *    não é a causa, ao contrário do que o comentário do sync dizia;
 *  - buckets são RECORTADOS pela janela (15/08→05/09 devolve 244
 *    pedidos em agosto, não o mês inteiro), e `week` bate com `month`
 *    na soma;
 *  - `to` é exclusivo de verdade (31/08 tira exatamente o dia 31);
 *  - offsets misturados entre `from` e `to` NÃO inflaram nada;
 *  - `interval: "custom"` é ignorado pela Statistics API.
 *
 * Ou seja: a plataforma responde de forma consistente. A divergência é
 * nossa, e nasce de duas coisas que este módulo nomeia.
 *
 * ── 1. Misturar send-date com event-date ──────────────────────────────
 *
 * A documentação da Omnisend é explícita, e nós fazíamos o oposto:
 *
 *   "Never combine attributed revenue from post_analytics_reports with
 *    total revenue from this API in the same analysis. The two APIs
 *    group data differently (send date vs. event date), which produces
 *    misleading comparisons. Always source both metrics from the same
 *    API."
 *
 * O slide do relatório divide receita atribuída (Reports, send-date)
 * por faturamento total (Statistics, event-date) e publica o resultado
 * como "% da loja que veio da Convertfy". São dois recortes de tempo
 * diferentes no mesmo quociente.
 *
 * ── 2. Degradação silenciosa ──────────────────────────────────────────
 *
 * O atribuído só bate com o painel quando é CALIBRADO pela Reports API.
 * Quando essa chamada falha, o sync cai no valor do Statistics — o
 * próprio código já dizia, num `log.warn`, que ali o número "pode estar
 * ~2x inflado" — e grava assim mesmo, sem marca nenhuma. Nada na tela,
 * nada no relatório, nada no banco distingue esse número do bom.
 *
 * E a chamada falha com facilidade: gerar UM relatório dispara três
 * fan-outs paralelos (`report`, `campaigns`, `flows`), cada um com
 * `force_refresh=true`, cada um rodando um sync completo de 3 chamadas
 * de analytics — 9 chamadas na mesma chave, contra um limite de
 * 10/min e 55/dia por brand. O singleflight que deveria deduplicar isso
 * é um `Map` em memória, e as três são invocações serverless separadas:
 * cada uma tem o seu Map, nenhuma enxerga as outras.
 *
 * A regra da casa vale aqui inteira: um número sem fonte não é um
 * número, e "a chamada foi feita" nunca é prova de que o subsistema
 * respondeu.
 */

/** Como o Omnisend agrupou o número no tempo. */
export type Agrupamento =
  /** Data do envio da mensagem. É o que o painel do Omnisend mostra. */
  | "send_date"
  /** Data do evento (o pedido). Statistics API. */
  | "event_date"

/** Por que um número saiu pior do que deveria. */
export type CausaDaDegradacao =
  /** Limite da plataforma (10/min ou 55/dia por brand). Esperar resolve. */
  | "limite_da_plataforma"
  /** A chamada falhou por outro motivo (timeout, 5xx). */
  | "falha_na_chamada"

export interface Degradacao {
  /** Qual etapa do sync ficou sem resposta. */
  etapa: string
  causa: CausaDaDegradacao
  /** Quanto tempo até liberar, quando a plataforma informou. */
  liberaEmMs?: number
}

export interface ProcedenciaDoAtribuido {
  /** Como o número foi agrupado no tempo. */
  agrupamento: Agrupamento
  /** Bate com o painel do Omnisend? Só `send_date` bate. */
  comparavelComOPainel: boolean
  /**
   * O quociente `atribuído / total` mistura dois agrupamentos?
   *
   * Não é defeito a corrigir escondendo: é fato a declarar. Quem lê
   * "24,07% da loja veio da Convertfy" precisa saber se numerador e
   * denominador falam do mesmo recorte de tempo.
   */
  percentualMisturaAgrupamentos: boolean
  /** Texto curto para a tela. `null` quando não há o que ressalvar. */
  ressalva: string | null
}

/**
 * O atribuído foi calibrado pela Reports API?
 *
 * PURA. `reportsRespondeu` é o que separa o número que bate com o
 * painel do número que só se parece com ele.
 */
export function procedenciaDoAtribuido(params: {
  reportsRespondeu: boolean
  /** Agrupamento do faturamento total. Hoje sempre Statistics. */
  agrupamentoDoTotal?: Agrupamento
}): ProcedenciaDoAtribuido {
  const agrupamento: Agrupamento = params.reportsRespondeu ? "send_date" : "event_date"
  const agrupamentoDoTotal = params.agrupamentoDoTotal ?? "event_date"
  const percentualMisturaAgrupamentos = agrupamento !== agrupamentoDoTotal

  if (!params.reportsRespondeu) {
    return {
      agrupamento,
      comparavelComOPainel: false,
      percentualMisturaAgrupamentos,
      ressalva:
        "A receita atribuída veio agrupada pela data do pedido, não pela data de envio — " +
        "não é o mesmo recorte que o painel do Omnisend mostra e tende a ficar acima dele.",
    }
  }

  return {
    agrupamento,
    comparavelComOPainel: true,
    percentualMisturaAgrupamentos,
    ressalva: percentualMisturaAgrupamentos
      ? "A porcentagem divide receita atribuída (por data de envio) por faturamento total " +
        "(por data do pedido) — os dois recortes não cobrem exatamente as mesmas vendas."
      : null,
  }
}

/**
 * Mensagem que o operador lê quando o sync degrada.
 *
 * A distinção importa porque as ações são OPOSTAS: limite da plataforma
 * pede espera (clicar de novo queima o que sobrou da cota diária e
 * atrasa a recuperação), falha de chamada pede nova tentativa. A
 * mensagem antiga — "A plataforma não respondeu às estatísticas desta
 * janela" — dizia a segunda coisa nos dois casos.
 */
export function mensagemDaDegradacao(degradacoes: readonly Degradacao[]): string | null {
  if (degradacoes.length === 0) return null

  const porLimite = degradacoes.filter((d) => d.causa === "limite_da_plataforma")
  if (porLimite.length > 0) {
    const espera = porLimite
      .map((d) => d.liberaEmMs)
      .filter((ms): ms is number => typeof ms === "number" && ms > 0)
      .sort((a, b) => b - a)[0]
    const quando = espera ? ` Libera em ${formatarEspera(espera)}.` : ""
    return (
      "Limite de consultas da Omnisend atingido para esta loja (10 por minuto, 55 por dia)." +
      quando +
      " Sincronizar de novo agora consome o que resta da cota e atrasa a liberação."
    )
  }

  const etapas = [...new Set(degradacoes.map((d) => d.etapa))].join(", ")
  return `A plataforma não respondeu em ${etapas} — a receita do sync anterior foi preservada.`
}

/** "2 min", "1 h 20 min", "45 s". Arredonda para baixo na unidade maior. */
export function formatarEspera(ms: number): string {
  const seg = Math.max(0, Math.round(ms / 1000))
  if (seg < 60) return `${seg} s`
  const min = Math.floor(seg / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto > 0 ? `${h} h ${resto} min` : `${h} h`
}
