/**
 * A régua do período do relatório mensal.
 *
 * Três decisões que erravam em silêncio e agora moram aqui, testadas:
 *
 * 1. **Campanha entra pelo dia em que foi ENVIADA.** É a semântica da
 *    Reports API da Omnisend, na letra da documentação: *"Results are
 *    grouped by the date a campaign or automation workflow message was
 *    sent. If a campaign was sent on Monday, all opens, clicks, and
 *    orders attributed to that campaign appear under Monday — regardless
 *    of when those events actually happened. This matches how Omnisend
 *    in-app reports work."* Sem esse corte, o relatório de um dia soma o
 *    histórico inteiro da conta: medido na Blessed Choice em 09/09/2026,
 *    78 campanhas gravadas para a janela de UM dia, 75 delas enviadas
 *    fora dele (a mais antiga de 15/04), somando 3.751.247 envios — o
 *    snapshot publicou 872.858 envios e 2,5% de abertura para um dia.
 *    O `delivered` de quem está fora da janela não vem da janela: vem do
 *    total histórico daquela campanha, então o número não é só "a mais",
 *    é de outro assunto.
 * 2. **Granularidade tem teto.** Com `interval: custom`, a Omnisend
 *    aceita no máximo 7 dias em `hour`, **60 em `day`**, 52 semanas em
 *    `week` e 12 meses em `month`. Pedir `day` para 90 dias devolve 400,
 *    que o chamador engolia num `catch` e virava "sem dado" — a receita
 *    por campanha simplesmente não era distribuída, sem nada na tela.
 * 3. **Período tem que fazer sentido antes de custar uma geração.**
 *    Invertido, longo demais ou inteiramente no futuro não é relatório
 *    parcial: é relatório de nada. E o dia corrente É legítimo, só
 *    incompleto — a documentação diz que apenas a última hora FECHADA
 *    está disponível —, então ele passa com aviso, nunca com recusa.
 *
 * Puro: sem I/O, sem Supabase, sem fetch.
 */

/** Uma campanha, pelo mínimo que a régua precisa saber. */
export interface CampanhaComEnvio {
  /** ISO do envio. Nomes convivem porque o cache usa snake e a API camel. */
  send_time?: string | null
  sendTime?: string | null
  campaign_status?: string | null
  status?: string | null
}

/** O envio da campanha, seja qual for o nome do campo na origem. */
export function envioDaCampanha(c: CampanhaComEnvio): string | null {
  return c.send_time ?? c.sendTime ?? null
}

/** O status da campanha, seja qual for o nome do campo na origem. */
export function statusDaCampanha(c: CampanhaComEnvio): string | null {
  return c.campaign_status ?? c.status ?? null
}

/**
 * Status de quem NUNCA chegou a enviar. Estes são o corte seguro: agendada
 * e rascunho não têm envio nenhum para atribuir a dia algum, e cancelada
 * não aconteceu.
 */
const NAO_ENVIARAM = new Set(["scheduled", "draft", "cancelled", "canceled"])

/**
 * A campanha pertence ao relatório deste período?
 *
 * Duas condições: **enviou** e **enviou dentro da janela** — a régua da
 * plataforma, que agrupa pela data de envio. Campanha sem `send_time` fica
 * FORA: sem a data não há como afirmar que ela é deste período, e assumir
 * que sim é o erro que trouxe abril para dentro de setembro.
 *
 * O corte é por "não enviou", não por "não é `sent`". Medido na Blessed
 * Choice: das três campanhas de 09/09, a das 18h estava `started` — no ar
 * naquele instante, 35 entregues até o snapshot. Exigir `sent` faria a
 * campanha do próprio dia sumir do relatório daquele dia, em silêncio, e
 * os envios dela existem e são do período. Ela entra PARCIAL, que é o que
 * ela é — e o período que inclui hoje já vem com o aviso de que o dia
 * ainda está em andamento. Status que este módulo não conhece decide pela
 * data: inventar exclusão sobre um nome que não conhecemos apaga dado
 * real, enquanto os três casos que de fato não enviaram estão nomeados.
 *
 * A janela é fechada nos dois lados em dia local (`YYYY-MM-DD`), porque é
 * assim que o usuário escolhe na tela; a hora do envio dentro do dia não
 * decide nada aqui.
 */
export function campanhaNoPeriodo(
  c: CampanhaComEnvio,
  inicio: string,
  fim: string,
): boolean {
  const status = (statusDaCampanha(c) ?? "").toLowerCase().trim()
  if (NAO_ENVIARAM.has(status)) return false
  const envio = envioDaCampanha(c)
  if (!envio) return false
  const dia = envio.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false
  return dia >= inicio.slice(0, 10) && dia <= fim.slice(0, 10)
}

/** Filtra a lista mantendo a ordem original. */
export function campanhasNoPeriodo<T extends CampanhaComEnvio>(
  campanhas: T[],
  inicio: string,
  fim: string,
): T[] {
  return campanhas.filter((c) => campanhaNoPeriodo(c, inicio, fim))
}

/** Dias inclusivos entre as duas pontas (mesmo dia = 1). */
export function diasDoPeriodo(inicio: string, fim: string): number {
  const a = Date.parse(`${inicio.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${fim.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.floor((b - a) / 86_400_000) + 1
}

export type GranularidadeOmnisend = "hour" | "day" | "week" | "month"

/**
 * A maior granularidade que a Omnisend aceita para esta janela, do mais
 * fino para o mais grosso. Acima de 12 meses nem `month` cabe — devolve
 * `month` assim mesmo e quem chama trata o 400, porque recusar aqui
 * esconderia do log qual foi o pedido.
 */
export function granularidadeParaJanela(
  inicio: string,
  fim: string,
): GranularidadeOmnisend {
  const dias = diasDoPeriodo(inicio, fim)
  if (dias <= 60) return "day"
  if (dias <= 364) return "week"
  return "month"
}

export interface PeriodoAvaliado {
  ok: boolean
  /** Motivo da recusa, pronto para a tela. Só quando `ok` é falso. */
  erro?: string
  /** Ressalvas de um período aceito (dia corrente incompleto, etc.). */
  avisos: string[]
  dias: number
}

const MAX_DIAS = 366

/**
 * O período pode virar relatório?
 *
 * `hoje` entra por parâmetro (`YYYY-MM-DD` no fuso de quem lê) para a
 * função continuar pura e testável — depender do relógio faria o teste
 * do "dia corrente" quebrar sozinho à meia-noite.
 */
export function avaliarPeriodo(
  inicio: string,
  fim: string,
  hoje: string,
): PeriodoAvaliado {
  const i = inicio.slice(0, 10)
  const f = fim.slice(0, 10)
  const formato = /^\d{4}-\d{2}-\d{2}$/
  if (!formato.test(i) || !formato.test(f)) {
    return { ok: false, erro: "Período inválido: use datas no formato AAAA-MM-DD.", avisos: [], dias: 0 }
  }
  if (i > f) {
    return {
      ok: false,
      erro: "O início do período é depois do fim. Inverta as datas.",
      avisos: [],
      dias: 0,
    }
  }
  const dias = diasDoPeriodo(i, f)
  if (i > hoje) {
    return {
      ok: false,
      erro: "O período está inteiro no futuro — não há dado para relatar.",
      avisos: [],
      dias,
    }
  }
  if (dias > MAX_DIAS) {
    return {
      ok: false,
      erro: `Período de ${dias} dias é longo demais para um relatório (máximo ${MAX_DIAS}).`,
      avisos: [],
      dias,
    }
  }

  const avisos: string[] = []
  if (f >= hoje) {
    // A documentação da Omnisend é explícita: só a última hora FECHADA
    // está disponível. O dia de hoje é legítimo e parcial ao mesmo tempo,
    // e quem lê o relatório precisa saber disso antes de comparar.
    avisos.push(
      "O período inclui hoje: o dia corrente ainda está em andamento e os números vão mudar.",
    )
  }
  if (dias === 1) {
    avisos.push(
      "Período de um dia: só entram as campanhas enviadas nesse dia — as anteriores ficam de fora, como no painel da plataforma.",
    )
  }
  return { ok: true, avisos, dias }
}
