/**
 * Uma voz por saída (Q6, 19/09) — módulo PURO.
 *
 * Medido nas runs do Seletor de 18/09: `proibido_neste_toque` saía com 27–28
 * linhas, e elas eram TRÊS coisas misturadas:
 *
 *   1. as 5 proibições do CONTRATO, em português (repetidas por regra);
 *   2. 7–8 ALERTAS DE DADO em inglês — "No support channel … documented.
 *      Cannot claim support quality without evidence", "Verify before using
 *      in copy" — que não são regra de redação: são a lista do que falta na
 *      loja, isto é, a matéria da ficha operacional;
 *   3. 15 proibições em inglês, das quais 5 são as MESMAS do contrato
 *      traduzidas ("No artificial urgency" = "urgência artificial").
 *
 * O `dedupePorChave` não colapsa tradução, e o redator recebia a mesma
 * ordem duas vezes e um alerta de pesquisa como se fosse proibição. Este
 * módulo separa (2) em `alertas_de_dado` — que alimenta a pendência da
 * ficha (S3) — e colapsa (3) contra (1) por uma tabela FIXA das cinco
 * proibições canônicas do contrato: tradução automática seria adivinhar.
 */

import { chaveDeTexto, dedupePorChave } from "./texto"

/**
 * Sinais de que a linha é um ALERTA sobre a pesquisa, não uma proibição:
 * ela fala do que NÃO FOI ENCONTRADO / NÃO ESTÁ DOCUMENTADO ou manda
 * VERIFICAR. Uma proibição diz "não faça X"; um alerta diz "X não foi
 * confirmado". A régua é fechada de propósito — o que não casar continua
 * proibição, que é o lado seguro.
 */
const ALERTA_RE: RegExp[] = [
  /\b(not|never|no)\b[^.]{0,80}\b(found|documented|stated|confirmed|verified|available|exists?)\b/i,
  /\bcannot\s+(assert|claim|confirm|fully confirm)\b/i,
  /\b(verify|confirm)\b[^.]{0,60}\bbefore\b/i,
  /\bflag(ged)?\s+for\s+(verification|confirmation)\b/i,
  /\btreat\s+as\s+unverified\b/i,
  /\buntil\s+confirmed\b/i,
  /\bunverified\b/i,
  /\bwere\s+not\s+explicitly\s+stated\b/i,
  /\bnão\s+(foi|foram)?\s*(encontrad|confirmad|verificad|documentad)/i,
  /\bconfir(me|mar)\b[^.]{0,60}\bantes\b/i,
  /\bnão\s+(há|existe)\b[^.]{0,80}\b(na pesquisa|documentad|confirmad)/i,
]

/** "Do not …"/"não …" no INÍCIO é a assinatura de proibição — vence o alerta. */
const PROIBICAO_INICIO_RE = /^\s*(do not|don't|never|não|nunca|no\s+(long|new|artificial|parallel))\b/i

export function ehAlertaDeDado(linha: string): boolean {
  const t = linha.trim()
  if (!t) return false
  if (PROIBICAO_INICIO_RE.test(t)) return false
  return ALERTA_RE.some((re) => re.test(t))
}

/**
 * As cinco proibições canônicas do contrato (welcome-1) e as formas em
 * inglês que o modelo devolve para cada uma. A chave é a forma PT
 * normalizada por `chaveDeTexto` (prefixo — a linha do contrato tem um
 * complemento entre parênteses).
 */
const CANONICAS: Array<{ chavePt: string; en: RegExp }> = [
  { chavePt: "historia longa da fundacao", en: /\b(long\s+)?founding\s+story\b/i },
  {
    chavePt: "pedido de engajamento paralelo",
    en: /\b(parallel\s+engagement|one\s+ask\s+only|one\s+call\s+to\s+action\s+only|no\s+secondary\s+cta)\b/i,
  },
  { chavePt: "urgencia artificial", en: /\bartificial\s+urgency\b/i },
  {
    chavePt: "esgotar os argumentos",
    en: /\b(exhaust\s+the\s+arguments|pile\s+on\s+arguments|one\s+objection(\s+only)?\b[^.]{0,40}\b(attacked|do\s+not\s+stack))/i,
  },
  { chavePt: "condicao nova no incentivo", en: /\bnew\s+condition\s+on\s+(the\s+incentive|[A-Z0-9]{3,})/i },
]

function canonicaDe(linha: string): (typeof CANONICAS)[number] | null {
  const k = chaveDeTexto(linha)
  for (const c of CANONICAS) {
    if (k.startsWith(c.chavePt)) return c
    if (c.en.test(linha)) return c
  }
  return null
}

export interface ProibicoesSeparadas {
  /** O que o redator NÃO pode fazer, uma linha por regra. */
  proibicoes: string[]
  /** O que a pesquisa não confirmou — matéria da ficha, não do redator. */
  alertas_de_dado: string[]
  /** Quantas linhas eram tradução de uma canônica já presente. */
  traducoes_colapsadas: number
}

/**
 * Separa e colapsa. A PRIMEIRA forma de cada canônica fica (é a do
 * contrato, em PT); a tradução sai. Linhas que o modelo já mandou em
 * `alertas_de_dado` entram no mesmo balde, deduplicadas.
 */
export function separarAlertasDeDado(
  proibidoNesteToque: readonly string[],
  alertasDoModelo: readonly string[] = [],
): ProibicoesSeparadas {
  const proibicoes: string[] = []
  const alertas: string[] = [...alertasDoModelo.map((a) => a.trim()).filter(Boolean)]
  const canonicasVistas = new Set<string>()
  let colapsadas = 0
  for (const bruta of dedupePorChave(proibidoNesteToque)) {
    if (ehAlertaDeDado(bruta)) {
      alertas.push(bruta)
      continue
    }
    const can = canonicaDe(bruta)
    if (can) {
      if (canonicasVistas.has(can.chavePt)) {
        colapsadas++
        continue
      }
      canonicasVistas.add(can.chavePt)
    }
    proibicoes.push(bruta)
  }
  return { proibicoes, alertas_de_dado: dedupePorChave(alertas), traducoes_colapsadas: colapsadas }
}
