/**
 * Heurísticas puras do chat da ConvertIA (client-safe, testadas):
 *
 * - isAnalyticalQuestion: a mensagem pede ANÁLISE DE DADOS? Alimenta o
 *   guard "consulte antes de responder" — pergunta analítica com
 *   conectores ligados e ZERO tool calls no 1º passe ganha um nudge e
 *   uma nova chance, em vez de sair resposta genérica de memória.
 * - isActionRequest / claimsImpossible / defersDecision: o mesmo guard
 *   aplicado à AUTONOMIA. Pedido de execução respondido sem tocar em
 *   nenhuma ferramenta — seja negando ("a API não expõe isso"), seja
 *   devolvendo a decisão ("qual caminho você prefere?") — é descartado
 *   e o modelo ganha um passe novo com a ordem de verificar o catálogo
 *   primeiro.
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

/**
 * Pedido que começa com verbo de criação SEGUIDO de substantivo de
 * PEÇA (email, copy, assunto…) é produção de conteúdo, não análise —
 * mesmo citando "campanha" ("escreva um email da campanha de natal").
 * O verbo sozinho não basta: "faça uma auditoria" é análise.
 */
const CREATIVE_LEAD =
  /^\s*(escrev|redij|redig|cri[ae]|ger[ae]|faç?a|faz|mont[ae]|desenh|traduz|revis[ae]|melhor[ae]|reescrev)\w*\s+(?:o |a |um |uma |esse |essa |este |esta |pra mim )*(e-?mails?|copy|copies|assuntos?|subject|textos?|artes?|banners?|imagens?|fotos?|posts?|legendas?|headlines?|peças?|slogans?|criativos?|templates?|html|páginas?|landing)/i

export function isAnalyticalQuestion(message: string): boolean {
  const m = message.trim()
  if (m.length < 8) return false
  if (CREATIVE_LEAD.test(m)) return false
  return ANALYTICAL_PATTERNS.some((re) => re.test(m))
}

/**
 * Verbos de AÇÃO sobre sistemas conectados. Alimenta o mesmo guard:
 * pedido de execução não pode virar "qual caminho você prefere?" sem o
 * modelo ter ao menos consultado o que a ferramenta oferece.
 */
const ACTION_PATTERNS: RegExp[] = [
  /\b(cri[ae]r?|cadastr[ae]|configur[ae]|conect[ae]|ativ[ae]|desativ[ae]|paus[ae]|retom[ae])\b/i,
  /\b(atualiz[ae]|edit[ae]|alter[ae]|ajust[ae]|corrij[ao]|renomei[ae]|mov[ae]|duplic[ae]|clon[ae])\b/i,
  /\b(agend[ae]|program[ae]|dispar[ae]|envi[ae]|public[ae]|sub[ae]|import[ae]|export[ae])\b/i,
  /\b(exclu[ai]|apagu?[ae]|delet[ae]|remov[ae]|arquiv[ae])\b/i,
  /\b(execut[ae]|rod[ae]|faç?a|monta?[re]?|implement[ae]|aplic[ae])\b/i,
  /\b(teste?\s*a\/?b|ab\s*test|split\s*test)\b/i,
]

/** A mensagem pede uma AÇÃO (não apenas leitura/análise)? */
export function isActionRequest(message: string): boolean {
  const m = message.trim()
  if (m.length < 6) return false
  return ACTION_PATTERNS.some((re) => re.test(m))
}

/**
 * A resposta afirma que algo é IMPOSSÍVEL / não existe / não dá.
 *
 * É o padrão que motivou o guard: a ConvertIA disse "a API pública do
 * Omnisend não expõe formulários/popups" SEM ter consultado o catálogo
 * do MCP — e, quando o usuário insistiu, ela mesma se corrigiu ("eu
 * estava errado, o catálogo tem sim os endpoints"). Negativa sobre o
 * que uma ferramenta faz precisa ser VERIFICADA antes de sair.
 */
const IMPOSSIBILITY_PATTERNS: RegExp[] = [
  /\bn[ãa]o\s+(consigo|posso|dá|da|tem como|há como|ha como)\b/i,
  /\bn[ãa]o\s+(é|e)\s+poss[íi]vel\b/i,
  /\bn[ãa]o\s+existe(m)?\b/i,
  /\bn[ãa]o\s+(exp[õo]e|suporta|permite|oferece|disponibiliza|aceita)\b/i,
  /\bn[ãa]o\s+(h[áa]|tem)\s+(endpoint|opera[çc][ãa]o|ferramenta|tool|api|m[ée]todo|recurso)\b/i,
  /\b(fora do meu alcance|al[ée]m das minhas|limita[çc][ãa]o da (api|plataforma|ferramenta))\b/i,
  /\bindispon[íi]vel (via|por) (api|mcp)\b/i,
]

export function claimsImpossible(text: string): boolean {
  if (!text || text.length < 12) return false
  return IMPOSSIBILITY_PATTERNS.some((re) => re.test(text))
}

/**
 * A resposta empurra a decisão de volta para o usuário em vez de agir
 * ("Qual caminho você prefere? (A)… (B)…"). Combinada com zero tool
 * calls num pedido de ação, é o sintoma de falta de autonomia.
 */
const DEFERRAL_PATTERNS: RegExp[] = [
  /\bqual (caminho|op[çc][ãa]o|alternativa)\s+(voc[êe]|vc)?\s*prefere\b/i,
  /\bquer que eu\b[^?]{0,120}\?/i,
  /\bposso (seguir|prosseguir|continuar|executar)\b[^?]{0,80}\?/i,
  /\bme (confirma|avisa|diz)\b[^?]{0,120}\?/i,
  /\bvoc[êe] prefere\b/i,
]

export function defersDecision(text: string): boolean {
  if (!text) return false
  return DEFERRAL_PATTERNS.some((re) => re.test(text))
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
