/**
 * Recall ("piping"): `{{ref}}` no texto vira a resposta daquele bloco.
 *
 * É o que faz o formulário soar como conversa — "Prazer, {{nome}}. Qual
 * o site da sua loja?". Funciona em label, descrição, opções e no texto
 * dos finais.
 *
 * Três regras que os testes travam, todas contra o mesmo estrago:
 *
 * 1. **Referência não respondida vira o fallback, nunca o texto cru.**
 *    Com salto para trás ou campo pulado por lógica, o `{{ref}}` pode
 *    chegar à tela sem resposta. Imprimir `{{f1}}` para o visitante é o
 *    defeito mais visível que este módulo pode produzir.
 * 2. **O valor entra como TEXTO, e quem escreve na tela escapa.** O
 *    renderizador usa texto, não `innerHTML` — mas o mesmo recall vai
 *    para o `title` do ending e para o corpo de email de retomada, e ali
 *    um `<script>` digitado por um visitante seria injeção. A função
 *    devolve texto puro e `escaparHtml` existe para quem monta HTML.
 * 3. **Sem laço.** `{{a}}` cuja resposta contenha `{{b}}` não é
 *    re-expandido: a substituição é de UMA passada.
 */

import type { FormAnswer, FormAnswers, FormBlock } from "@/types/forms-conversational"

/** `{{ref}}` ou `{{ref|fallback}}` — o fallback é o texto após a barra. */
const PADRAO = /\{\{\s*([^{}|]+?)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/g

/** Texto legível de uma resposta, para exibir. Lista vira "a, b e c". */
export function respostaComoTexto(v: FormAnswer | undefined): string {
  if (v === null || v === undefined) return ""
  if (Array.isArray(v)) {
    const itens = v.map((x) => String(x)).filter(Boolean)
    if (itens.length === 0) return ""
    if (itens.length === 1) return itens[0]
    return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`
  }
  if (typeof v === "boolean") return v ? "Sim" : "Não"
  return String(v)
}

export interface ContextoRecall {
  answers: FormAnswers
  /** Campos ocultos (URL, embed). Consultados quando o ref não é bloco. */
  hidden?: Record<string, string>
  /** Variáveis definidas pela lógica (score, faixa…). */
  variables?: Record<string, string | number>
  /** Para resolver `{{Nome do campo}}` além de `{{<uuid>}}`. */
  blocks?: FormBlock[]
}

/**
 * Substitui as referências. O que não resolve vira o fallback declarado,
 * ou string vazia.
 *
 * Resolve por `ref` exato primeiro; depois por LABEL do bloco, porque
 * quem escreve a pergunta no editor digita `{{Seu nome}}`, não o uuid.
 */
export function aplicarRecall(texto: string | null | undefined, ctx: ContextoRecall): string {
  if (!texto) return ""
  if (!texto.includes("{{")) return texto

  return texto.replace(PADRAO, (_todo, chaveBruta: string, fallback?: string) => {
    const chave = chaveBruta.trim()
    const alvo = resolver(chave, ctx)
    if (alvo !== undefined && alvo !== "") return alvo
    return (fallback ?? "").trim()
  })
}

function resolver(chave: string, ctx: ContextoRecall): string | undefined {
  const { answers, hidden, variables, blocks } = ctx

  if (Object.prototype.hasOwnProperty.call(answers, chave)) {
    return respostaComoTexto(answers[chave])
  }
  if (hidden && Object.prototype.hasOwnProperty.call(hidden, chave)) {
    return String(hidden[chave] ?? "")
  }
  if (variables && Object.prototype.hasOwnProperty.call(variables, chave)) {
    return String(variables[chave] ?? "")
  }
  if (blocks) {
    // Alias primeiro: é o nome que quem escreve a pergunta digita, e ele
    // é curto o bastante para colidir com um label por acidente — quem
    // escolheu o apelido tem precedência sobre a coincidência.
    const porAlias = blocks.find((b) => (b.alias ?? "").toLowerCase() === chave.toLowerCase())
    if (porAlias && Object.prototype.hasOwnProperty.call(answers, porAlias.ref)) {
      return respostaComoTexto(answers[porAlias.ref])
    }
    const porLabel = blocks.find((b) => (b.label ?? "").trim().toLowerCase() === chave.toLowerCase())
    if (porLabel && Object.prototype.hasOwnProperty.call(answers, porLabel.ref)) {
      return respostaComoTexto(answers[porLabel.ref])
    }
  }
  return undefined
}

/** Escapa para interpolar em HTML (email de retomada, embed). */
export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Qual bloco uma chave de recall endereça — a MESMA cascata do `resolver`
 * (ref exato, depois alias, depois label), sem depender de haver resposta.
 *
 * O `resolver` só devolve texto quando a resposta existe, então ele não
 * serve para a régua do editor, que roda sem ninguém ter respondido nada.
 * Duas cascatas divergiriam, e a divergência apareceria como um aviso
 * sobre `{{nome}}` que o formulário resolve bem — ou pior, o silêncio
 * sobre um que ele não resolve.
 */
export function blocoDoRecall(chave: string, blocks: FormBlock[]): FormBlock | undefined {
  const k = chave.trim().toLowerCase()
  const porRef = blocks.find((b) => b.ref === chave.trim())
  if (porRef) return porRef
  const porAlias = blocks.find((b) => (b.alias ?? "").toLowerCase() === k)
  if (porAlias) return porAlias
  return blocks.find((b) => (b.label ?? "").trim().toLowerCase() === k)
}

/** Lista os refs citados num texto — o editor usa para avisar de ref quebrado. */
export function refsCitados(texto: string | null | undefined): string[] {
  if (!texto) return []
  const out: string[] = []
  for (const m of texto.matchAll(PADRAO)) out.push(m[1].trim())
  return out
}
