/**
 * rendered-classify — o exemplo renderizado de uma variante é HTML de email
 * ou um print embrulhado? (story CM-6)
 *
 * Separado do `rendered-reference` para ser **isomórfico**: o editor de
 * variantes (componente client) precisa classificar o que está sendo colado,
 * ao vivo, e o `rendered-reference` importa `node:crypto` — que o webpack não
 * resolve no bundle do browser.
 *
 * Aqui não há nada de servidor: só medida sobre a string.
 *
 * Puro (zero I/O) — testável.
 */

// ── Classificação ──────────────────────────────────────────────────────

export type RenderedKind =
  /** HTML de email de verdade — serve de espelho de acabamento. */
  | "structural"
  /** Print/mockup embrulhado em HTML — não descreve estrutura. */
  | "mockup"
  /** Não cadastrado. */
  | "empty"

/**
 * Abaixo disso não cabe um email renderizado: os mockups encontrados na
 * biblioteca têm ~1.7KB, quase todo ele o atributo `src` de uma imagem.
 */
const MIN_STRUCTURAL_CHARS = 2_500

/**
 * Um exemplo renderizado carrega a variante inteira com conteúdo real, então
 * costuma ser MAIOR que o HTML autoral. Muito menor que a metade é sinal de
 * que não há estrutura ali.
 */
const MIN_RATIO_TO_SOURCE = 0.5

/** Um email renderizado tem várias linhas de tabela; um mockup tem uma. */
const MIN_TABLE_ROWS = 3

/**
 * Proporção máxima do documento ocupada por `src=`. Um mockup-imagem é
 * essencialmente uma URL longa (data: ou CDN) dentro de casca mínima.
 */
const MAX_SRC_RATIO = 0.5

export interface ClassifyResult {
  kind: RenderedKind
  /** Por que não é estrutural (vazio quando é). */
  reasons: string[]
  chars: number
  rows: number
}

/**
 * Classifica o `rendered_html` de uma variante. Os thresholds são
 * explícitos e nomeados de propósito: são heurística sobre dados de
 * cadastro, não uma verdade. Errar aqui não muda o que o agente recebe —
 * a classificação informa, não bloqueia.
 */
export function classifyRenderedHtml(
  html: string | null | undefined,
  sourceHtml?: string | null,
): ClassifyResult {
  const rendered = (html ?? "").trim()
  if (!rendered) {
    return { kind: "empty", reasons: [], chars: 0, rows: 0 }
  }

  const rows = (rendered.match(/<tr[\s>]/gi) ?? []).length
  const srcChars = (rendered.match(/\ssrc\s*=\s*["'][^"']*["']/gi) ?? []).join("")
    .length
  const reasons: string[] = []

  if (rendered.length < MIN_STRUCTURAL_CHARS) reasons.push("curto_demais")
  if (rows < MIN_TABLE_ROWS) reasons.push("poucas_linhas")
  if (srcChars > rendered.length * MAX_SRC_RATIO) reasons.push("dominado_por_src")

  const source = (sourceHtml ?? "").trim()
  if (source && rendered.length < source.length * MIN_RATIO_TO_SOURCE) {
    reasons.push("menor_que_a_fonte")
  }

  return {
    kind: reasons.length > 0 ? "mockup" : "structural",
    reasons,
    chars: rendered.length,
    rows,
  }
}

