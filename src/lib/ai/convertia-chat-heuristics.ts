/**
 * Heurísticas puras do chat da ConvertIA (client-safe, testadas):
 *
 * - isAnalyticalQuestion: a mensagem pede ANÁLISE DE DADOS? Alimenta o
 *   guard "consulte antes de responder" — pergunta analítica com
 *   conectores ligados e ZERO tool calls no 1º passe ganha um nudge e
 *   uma nova chance, em vez de sair resposta genérica de memória.
 * - describeToolArgs: resumo humano dos argumentos de uma tool call,
 *   mostrado na UI enquanto a consulta roda ("período: 30d · status:
 *   paid") — transparência sobre O QUE está sendo buscado.
 */

/**
 * Sinais de pedido analítico em pt-BR. Não precisa ser perfeito: falso
 * negativo = comportamento antigo; falso positivo = o modelo consulta
 * dados antes de responder (inócuo). Por isso a lista é generosa.
 */
const ANALYTICAL_PATTERNS: RegExp[] = [
  // métricas e dimensões do negócio
  /\b(receita|faturamento|vendas?|pedidos?|ticket|mrr|roas|cpl|cpa)\b/i,
  /\b(open\s*rate|click|clique|ctr|convers[ãa]o|entregabilidade|bounce|unsubscribe)\b/i,
  /\b(m[ée]tricas?|kpis?|performance|resultados?|n[úu]meros?)\b/i,
  /\b(campanhas?|flows?|automa[çc][õo]es?|segmentos?|listas?)\b/i,
  // verbos/formas de pergunta analítica
  /\b(analis[ae]|análise|audit[ae]|auditoria|diagn[óo]stic|investigar?|investigue|compar[ae])\b/i,
  /\b(como (foi|est[áa]|anda|andam|est[ãa]o))\b/i,
  /\b(quant[oa]s?|qual (foi|é|era)|quais (foram|s[ãa]o))\b/i,
  /\b(queda|cresc(eu|imento)|caiu|subiu|melhor(es)?|pior(es)?|tend[êe]ncia)\b/i,
  /\b([úu]ltim[oa]s? \d+|nos [úu]ltim[oa]s|esse m[êe]s|este m[êe]s|essa semana|ontem|hoje)\b/i,
  /\b(relat[óo]rio|resumo (de|da|do)|balan[çc]o)\b/i,
]

export function isAnalyticalQuestion(message: string): boolean {
  const m = message.trim()
  if (m.length < 8) return false
  return ANALYTICAL_PATTERNS.some((re) => re.test(m))
}

const MAX_SUMMARY_LEN = 90

/**
 * Resumo humano dos args de uma tool call: só valores primitivos, no
 * máximo 4 pares, truncado. Nunca lança — args vêm do modelo.
 */
export function describeToolArgs(args: unknown): string | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) return null
  const parts: string[] = []
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (parts.length >= 4) break
    let rendered: string | null = null
    if (typeof value === "string") {
      const v = value.replace(/\s+/g, " ").trim()
      if (!v) continue
      rendered = v.length > 40 ? `${v.slice(0, 40)}…` : v
    } else if (typeof value === "number" || typeof value === "boolean") {
      rendered = String(value)
    } else if (Array.isArray(value)) {
      const prims = value.filter(
        (x) => typeof x === "string" || typeof x === "number",
      ) as Array<string | number>
      if (prims.length === 0) continue
      const joined = prims.slice(0, 3).join(", ")
      rendered = prims.length > 3 ? `${joined}…` : joined
      if (rendered.length > 40) rendered = `${rendered.slice(0, 40)}…`
    }
    if (rendered === null) continue
    parts.push(`${key}: ${rendered}`)
  }
  if (parts.length === 0) return null
  const summary = parts.join(" · ")
  return summary.length > MAX_SUMMARY_LEN ? `${summary.slice(0, MAX_SUMMARY_LEN)}…` : summary
}
