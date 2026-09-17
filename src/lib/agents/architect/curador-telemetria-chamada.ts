/**
 * curador-telemetria-chamada — o que cada CHAMADA do Curador guarda.
 *
 * O Curador é uma run só com N chamadas ao modelo: `shortlist` e `escolha`
 * no caminho de hoje, uma `posicao_N` por posição quando o leque está
 * ligado. A run guardava a SOMA, e `consumo_por_chamada` guardava tokens e
 * segundos — sem custo, sem prompt e sem saída. Com isso não dava para
 * responder "quantas vezes ele foi chamado e quanto gastou em cada",
 * que é a pergunta que decide se o leque fica ligado.
 *
 * Aqui mora a parte PURA disso: os tetos, o corte e o mapper que tira o
 * texto antes da escrita parcial. O preenchimento é o wrapper `medir` em
 * `curador-shadow.ts`.
 *
 * ── Por que só a CAUDA, e não o prompt ────────────────────────────────
 *
 * O prompt do Curador é prefixo cacheado + cauda por chamada: o prefixo
 * (93.231 chars medidos em 17/09) vai UMA vez em `rendered_prompt` e é
 * lido do cache a partir da segunda chamada; o que muda entre uma chamada
 * e outra é a cauda. Guardar a cauda é barato E é exatamente o que
 * diferencia as chamadas — que é o que a tela precisa mostrar.
 */

/** Teto da cauda gravada por chamada. */
export const CAUDA_TELEMETRIA_MAX = 6_000
/** Teto da saída crua gravada por chamada. */
export const SAIDA_TELEMETRIA_MAX = 4_000
/**
 * Teto SOMADO de texto na run inteira.
 *
 * Sem ele, 16 posições × 6k de cauda levam o `parsed_output` de 41 KB
 * (medido) para ~200 KB — e ele é lido INTEIRO, até 4 linhas por vez, em
 * toda retomada (`carregarEscolhasGravadas`). O orçamento é o que impede a
 * telemetria de encarecer a retomada que existe justamente para economizar.
 */
export const ORCAMENTO_TEXTO_DA_RUN = 90_000
/** O que sobra por chamada depois que o orçamento da run estoura. */
export const RESTO_APOS_ORCAMENTO = 800

/** Consumo de UMA chamada ao modelo. */
export interface ConsumoDaChamada {
  tokens_input: number
  tokens_output: number
  tokens_cache?: number
  tokens_cache_escrita?: number
  /**
   * Segundos arredondados. Fica por compatibilidade: a UI atual e o
   * `curador-shadow.leque.test.ts` leem esta chave.
   */
  seg: number
  /** O tempo exato. `seg` apaga a diferença entre 0,4 s e 1,4 s. */
  ms?: number
  /** Custo REAL do OpenRouter. Chegava em `InvokeResult` e era descartado. */
  custo_usd?: number
  modelo?: string
  teto?: number
  finish_reason?: string
  /** Endereço da chamada no leque: posição, seção, nº de candidatas. */
  chave?: { block_index?: number; section?: string; candidatas?: number }
  /** A cauda renderizada desta chamada (o prefixo está em `rendered_prompt`). */
  cauda?: string
  /** Tamanho REAL da cauda, antes de qualquer corte. */
  cauda_chars?: number
  cauda_truncada?: boolean
  /** A saída desta chamada. No leque o `raw_output` é a concatenação. */
  saida?: string
  saida_chars?: number
  saida_truncada?: boolean
  /** A chamada que LANÇOU. Antes sobrava só `seg` e zeros. */
  erro?: string
}

export type ConsumoPorChamada = Record<string, ConsumoDaChamada | null>

/** Marca do corte. Sai no meio do texto, então precisa ser inconfundível. */
function marcaDeCorte(cortados: number): string {
  return `\n\n…[${cortados} caracteres cortados pela telemetria]…\n\n`
}

/**
 * Corta NO MEIO, preservando começo e fim.
 *
 * Cortar só o fim jogaria fora justamente "com o que ele decidiu": na cauda
 * de uma posição, a cabeça é `<posicao_a_decidir>` (índice, seção, papel,
 * requisitos) e o fim é `<ja_decididas>` mais as instruções de saída. O
 * miolo é `finalistas_notas`, que já tem orçamento próprio de 18.000 chars
 * em `curador-vault-tools.ts` e é o que pesa.
 */
export function cortarNoMeio(texto: string, teto: number, fracaoDaCabeca = 0.75): string {
  if (teto <= 0) return ""
  if (texto.length <= teto) return texto
  const cabeca = Math.max(0, Math.floor(teto * fracaoDaCabeca))
  const cauda = Math.max(0, teto - cabeca)
  const cortados = texto.length - cabeca - cauda
  // Com teto minúsculo não sobra espaço para os dois lados mais a marca:
  // preserva a cabeça, que é onde está o endereço da chamada.
  if (cauda === 0) return texto.slice(0, cabeca) + marcaDeCorte(texto.length - cabeca)
  return texto.slice(0, cabeca) + marcaDeCorte(cortados) + texto.slice(texto.length - cauda)
}

/** Orçamento de texto de uma run, consumido chamada a chamada. */
export interface OrcamentoDeTexto {
  restante: number
}

export function novoOrcamentoDeTexto(total = ORCAMENTO_TEXTO_DA_RUN): OrcamentoDeTexto {
  return { restante: total }
}

export interface TextoRegistrado {
  texto: string
  chars: number
  truncado: boolean
}

/**
 * Aplica o teto da chamada E o orçamento da run, nesta ordem.
 *
 * `chars` é sempre o tamanho REAL, antes de qualquer corte — é ele que diz
 * o que foi de fato enviado ao modelo.
 */
export function registrarTexto(
  orcamento: OrcamentoDeTexto,
  texto: string | null | undefined,
  teto: number,
): TextoRegistrado | null {
  if (typeof texto !== "string" || texto.length === 0) return null
  const chars = texto.length
  const tetoEfetivo = orcamento.restante > 0 ? teto : RESTO_APOS_ORCAMENTO
  const cortado = cortarNoMeio(texto, tetoEfetivo)
  orcamento.restante -= cortado.length
  return { texto: cortado, chars, truncado: cortado.length !== chars }
}

/**
 * O consumo SEM o texto, para a escrita parcial.
 *
 * `gravarProgressoDoLeque` reescreve o `parsed_output` a cada posição
 * (é o que faz a retomada funcionar). Com as caudas dentro, seriam 16
 * reescritas de um JSONB grande — ~0,5 MB de WAL por e-mail — para um dado
 * que o fechamento da run regrava de qualquer jeito. Sem texto, cada
 * parcial fica em poucos KB e o que importa (custo, contagem, tempo por
 * chamada) sobrevive à morte do processo.
 */
export function semTexto(consumo: ConsumoPorChamada): ConsumoPorChamada {
  const saida: ConsumoPorChamada = {}
  for (const [etapa, item] of Object.entries(consumo)) {
    if (!item) {
      saida[etapa] = null
      continue
    }
    const { cauda: _cauda, saida: _saida, ...resto } = item
    saida[etapa] = resto
  }
  return saida
}
