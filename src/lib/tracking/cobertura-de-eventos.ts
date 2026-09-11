/**
 * Cobertura da fila: quantos cadastros viraram evento e quantos não.
 *
 * O defeito que este módulo existe para tornar visível: entre 06/08 e
 * 29/08 de 2026 treze cadastros do formulário "Pagina de vendas"
 * passaram, todos com lead, e NENHUM gerou linha em
 * `crm_conversion_events` — o enqueue morria em 42P10 e retornava calado.
 * O diagnóstico da tela mostrava "0 falhas" porque contava apenas as
 * linhas que existiam; o que não existe não falha.
 *
 * A contagem certa, então, não é sobre a fila: é sobre a distância entre
 * o que entrou pelo formulário e o que chegou à fila.
 */

export interface CadastroParaCobertura {
  id: string
  created_at: string
  /** Sem lead o envio nem é tentado — não conta como lacuna. */
  tem_lead: boolean
}

export interface CoberturaDeEventos {
  /** Início da janela considerada (ISO). */
  desde: string
  /** Cadastros que ficaram fora da janela e não foram cobrados. */
  fora_da_janela: number
  /** Cadastros considerados (os que têm lead, dentro da janela). */
  elegiveis: number
  /** Quantos têm ao menos uma linha na fila. */
  com_evento: number
  /** Quantos não têm nenhuma. */
  sem_evento: number
  /** Os mais recentes sem evento, para a tela apontar o dedo. */
  exemplos: Array<{ submission_id: string; created_at: string }>
  /** Data do cadastro mais recente que ficou sem evento. */
  ultimo_sem_evento: string | null
}

const MAX_EXEMPLOS = 5

/**
 * Cruza cadastros com os ids de submissão que têm linha na fila.
 *
 * Duas exclusões, cada uma por um motivo diferente:
 *
 * - **Cadastro sem lead**: o submit só tenta enfileirar quando existe
 *   `leadId`, então cobrá-lo inventaria uma lacuna que o código nunca
 *   prometeu preencher.
 * - **Cadastro anterior a `desde`**: antes de a fila existir para este
 *   formulário, a ausência de evento não é defeito — é o recurso não
 *   existindo ainda. Sem esse corte, o formulário medido em produção
 *   acusava 27 lacunas quando 14 eram cadastros de maio a julho,
 *   anteriores à integração. Alarme falso é como se aprende a ignorar o
 *   alarme verdadeiro.
 */
export function medirCobertura(
  cadastros: readonly CadastroParaCobertura[],
  submissoesComEvento: ReadonlySet<string>,
  desde: string,
): CoberturaDeEventos {
  const naJanela = cadastros.filter((c) => c.created_at >= desde)
  const elegiveis = naJanela.filter((c) => c.tem_lead)
  const sem = elegiveis.filter((c) => !submissoesComEvento.has(c.id))
  const ordenados = [...sem].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

  return {
    desde,
    fora_da_janela: cadastros.length - naJanela.length,
    elegiveis: elegiveis.length,
    com_evento: elegiveis.length - sem.length,
    sem_evento: sem.length,
    exemplos: ordenados.slice(0, MAX_EXEMPLOS).map((c) => ({
      submission_id: c.id,
      created_at: c.created_at,
    })),
    ultimo_sem_evento: ordenados[0]?.created_at ?? null,
  }
}

/**
 * Frase pronta para a tela, ou `null` quando não há lacuna.
 *
 * Devolve `null` em vez de "tudo certo" porque a ausência de lacuna não
 * é notícia — o espaço na tela é do problema.
 */
export function avisoDeCobertura(cobertura: CoberturaDeEventos): string | null {
  if (cobertura.sem_evento === 0) return null
  const n = cobertura.sem_evento
  const plural = n === 1 ? "cadastro não gerou" : "cadastros não geraram"
  return (
    `${n} ${plural} nenhum evento de conversão. ` +
    "Isso não é falha de envio: o evento nunca chegou a entrar na fila — " +
    "veja o log do servidor por `enqueue.insert_failed`."
  )
}

/** Quantos dias a janela cobre quando o formulário nunca gerou evento. */
export const DIAS_SEM_REFERENCIA = 30

/**
 * Início da janela de cobrança.
 *
 * O melhor marco é o PRIMEIRO evento já enfileirado para o formulário:
 * dali em diante a fila comprovadamente existia, e todo cadastro sem
 * evento é lacuna de verdade. Sem nenhum evento não há como saber
 * quando o recurso entrou — aí a janela vira um prazo recente, que é o
 * horizonte em que alguém ainda consegue agir.
 */
export function inicioDaJanela(
  primeiroEventoEm: string | null | undefined,
  agora: Date = new Date(),
): string {
  if (primeiroEventoEm) return primeiroEventoEm
  const d = new Date(agora.getTime() - DIAS_SEM_REFERENCIA * 24 * 60 * 60 * 1000)
  return d.toISOString()
}
