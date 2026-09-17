/**
 * Saúde do ciclo da Central de Campanhas — orçamento da captura,
 * rotação dos países e ciclo que morreu no meio.
 *
 * ── O que foi medido em 16/09 ─────────────────────────────────────────
 *
 * **16 ciclos, ZERO sugestões.** Quinze deles presos em `generating`
 * para sempre; o único com desfecho (#11, 10/08) fechou `failed` por
 * saldo da conta, causa já superada. E `campaign_ai_runs` não tem uma
 * única linha `kind='suggestions'` desde 10/08: o gerador de sugestões,
 * que é o produto, nunca chega a ser chamado.
 *
 * Três causas empilhadas, nenhuma visível em tela:
 *
 * 1. **A captura de tendências roda em SÉRIE, sem relógio**, dentro de um
 *    cron de `maxDuration = 300`. Medido: 81 s de média por cluster
 *    (máximo 199 s) e 7 países distintos na carteira — ~568 s em série.
 *    A função morre no meio TODA semana, por construção. Morta pelo
 *    runtime, nem o `catch` nem o `finally` rodam: o ciclo fica
 *    `generating` e o lock fica `is_running`.
 * 2. **O teto de 4.096 tokens corta a resposta** das tendências. As 20
 *    runs `invalid_output` desde 17/08 têm `tokens_output` = 4.096
 *    cravado e `raw_output` terminando no meio de uma palavra. O erro
 *    gravado — "JSON parse falhou em todos os candidatos" — descreve o
 *    sintoma e esconde a causa, que é a mesma do `copy_fit` em 15/09.
 *    Tratada por `retry-teto`, o módulo da casa, que também não tinha
 *    descido até aqui.
 * 3. **Ciclo preso não é varrido por ninguém**, então a tela mostra
 *    "gerando…" de uma execução de dois dias atrás.
 *
 * ── As decisões ──────────────────────────────────────────────────────
 *
 * Tendência é ENRIQUECIMENTO; sugestão é o produto. Então a captura tem
 * orçamento e uma reserva intocável para a geração: é melhor entregar as
 * sugestões desta semana com as tendências de quatro países do que não
 * entregar nada com as de sete.
 *
 * O que fica de fora não se perde — entra PRIMEIRO na semana seguinte
 * (`ordemDaCaptura`). É a lição do backfill de avatar: com ordem fixa e
 * lote menor que a fila, a cauda nunca é alcançada.
 */

/** Uma unidade de captura: um país e os nichos das lojas dele. */
export interface ClusterDeCaptura {
  country: string
  niches: string[]
}

/**
 * Quanto do relógio da função a captura pode gastar.
 *
 * `reservaMs` é o que fica para a geração de sugestões e para a escrita
 * final do ciclo. Sem ela, a captura consome tudo e o produto não sai —
 * que é exatamente o retrato de hoje.
 */
export function orcamentoDaCaptura(
  totalMs: number,
  reservaMs: number,
  decorridoMs = 0,
): number {
  const disponivel = totalMs - reservaMs - decorridoMs
  return disponivel > 0 ? disponivel : 0
}

/**
 * Só começa o cluster que TERMINA dentro do orçamento.
 *
 * `duracaoTipicaMs` é a maior duração já observada nesta execução (com
 * piso na média medida): a decisão é sobre o próximo cluster, e a
 * evidência mais próxima é o que acabou de acontecer aqui, não uma
 * constante escrita meses atrás.
 */
export function cabeMaisUmCluster(
  decorridoMs: number,
  orcamentoMs: number,
  duracaoTipicaMs: number,
): boolean {
  return decorridoMs + duracaoTipicaMs <= orcamentoMs
}

/** Duração típica de uma captura, em ms — medida em 16/09 sobre 12 runs. */
export const DURACAO_TIPICA_DA_CAPTURA_MS = 81_000

/**
 * A ordem em que os países são capturados.
 *
 * Quem tem a captura mais ANTIGA vai primeiro; quem nunca foi capturado
 * vem antes de todos (`null` é o topo, como no `ORDEM_DA_FILA` do
 * avatar). Sem isso, o orçamento cortaria sempre o mesmo pedaço da fila
 * e os últimos países nunca teriam tendência nenhuma.
 *
 * Empate desempata pelo país, para a ordem ser estável entre execuções.
 */
export function ordemDaCaptura<T extends ClusterDeCaptura>(
  clusters: readonly T[],
  ultimaCapturaPorPais: ReadonlyMap<string, string | null>,
): T[] {
  const chave = (c: T) => {
    const iso = ultimaCapturaPorPais.get(c.country.toUpperCase()) ?? null
    if (!iso) return -Infinity
    const t = new Date(iso).getTime()
    return Number.isFinite(t) ? t : -Infinity
  }
  return [...clusters].sort((a, b) => {
    const d = chave(a) - chave(b)
    if (d !== 0) return d
    return a.country.localeCompare(b.country)
  })
}

export interface ResumoDaCaptura {
  total: number
  feitos: number
  /** Não começaram por falta de relógio — voltam na frente da fila. */
  adiados: string[]
}

/** Frase para o log e para o `context` do ciclo. `null` quando tudo coube. */
export function avisoDeCapturaParcial(r: ResumoDaCaptura): string | null {
  if (r.adiados.length === 0) return null
  return `${r.feitos} de ${r.total} países capturados nesta rodada; ${r.adiados.join(", ")} ficaram para a próxima, que começa por eles.`
}

// ── Ciclo que morreu no meio ─────────────────────────────────────────

export interface CicloEmAndamento {
  id: string
  number: number | null
  status: string
  createdAt: string | null
}

/**
 * Passado isto, um ciclo `generating` não está gerando: ele morreu.
 *
 * O cron tem 300 s de teto, então qualquer execução viva termina dentro
 * disso. A folga é larga de propósito — fechar um ciclo que ainda
 * escreve seria pior que mostrar "gerando" por mais uns minutos.
 */
export const CICLO_INTERROMPIDO_MS = 15 * 60 * 1000

export const MOTIVO_CICLO_INTERROMPIDO =
  "a geração foi interrompida antes de terminar (o processo acabou sem fechar o ciclo)"

/**
 * PURA. Quais ciclos ficaram pendurados em `generating`.
 *
 * Sem carimbo de criação o ciclo NÃO é fechado: afirmar que morreu sem
 * ter como medir a idade é inventar desfecho — e o preço do engano aqui
 * é apagar o "gerando" de uma execução que está viva.
 */
export function ciclosInterrompidos(
  ciclos: readonly CicloEmAndamento[],
  agora: number = Date.now(),
  tetoMs: number = CICLO_INTERROMPIDO_MS,
): CicloEmAndamento[] {
  return ciclos.filter((c) => {
    if (c.status !== "generating") return false
    if (!c.createdAt) return false
    const t = new Date(c.createdAt).getTime()
    if (!Number.isFinite(t)) return false
    return agora - t >= tetoMs
  })
}
