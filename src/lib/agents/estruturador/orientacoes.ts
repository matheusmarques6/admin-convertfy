/**
 * Orientações do COO ao Estruturador (migration 20261086) — módulo PURO,
 * client-safe.
 *
 * O outro lado do ciclo de calibração: o 👍/👎 por run julga UMA decisão e
 * vira rascunho de aprendizado (`aprendizado-draft.ts`); a orientação
 * instrui as PRÓXIMAS gerações e vale na hora, sem passar pelo Obsidian.
 *
 * Servida numa camada SEPARADA dos `<aprendizados>` do vault: o vault é o
 * corpus curado (decisão 7 do ADR), a orientação é diretriz viva. Misturar
 * as duas apagaria a diferença entre "material aprovado" e "o COO pediu".
 */

export type EscopoOrientacao = "email" | "flow" | "global"

export interface Orientacao {
  escopo: EscopoOrientacao
  flow_type?: string | null
  email_number?: number | null
  texto: string
}

/** Texto do bloco quando não há nenhuma — o prompt não muda de forma. */
export const SEM_ORIENTACAO = "(nenhuma orientação registrada)"

/**
 * Rótulo humano de um escopo. Usado no prompt (para o agente saber o
 * alcance do que está lendo) e na UI (para o COO saber o que está
 * escrevendo) — mesma frase nos dois lados, de propósito.
 */
export function rotuloEscopo(
  escopo: EscopoOrientacao,
  flowType?: string | null,
  emailNumber?: number | null,
): string {
  if (escopo === "global") return "Toda geração, qualquer flow"
  if (escopo === "flow") return `Todo email do flow ${flowType ?? "?"}`
  return `Todo ${flowType ?? "?"} #${emailNumber ?? "?"}, em qualquer loja`
}

/** Da mais ampla para a mais específica — a ordem em que entram no prompt. */
const ORDEM: EscopoOrientacao[] = ["global", "flow", "email"]

/**
 * Monta o conteúdo de `<orientacao_do_coo>`.
 *
 * Ordem geral → flow → email: a mais específica vem por ÚLTIMA, que é onde
 * o modelo tende a dar mais peso quando duas se contradizem — e é também a
 * que o COO escreveu sabendo mais sobre o caso.
 *
 * Filtra vazias (o COO não precisa preencher os três) e ignora escopo
 * repetido: o UNIQUE do banco já garante um por escopo, mas o módulo não
 * depende disso para não emitir bloco duplicado.
 */
export function montarBlocoOrientacoes(
  orientacoes: ReadonlyArray<Orientacao>,
): string {
  const vistos = new Set<EscopoOrientacao>()
  const linhas: string[] = []

  for (const escopo of ORDEM) {
    const o = orientacoes.find(
      (x) => x.escopo === escopo && (x.texto ?? "").trim().length > 0,
    )
    if (!o || vistos.has(escopo)) continue
    vistos.add(escopo)
    linhas.push(
      `[${rotuloEscopo(escopo, o.flow_type, o.email_number)}]\n${o.texto.trim()}`,
    )
  }

  return linhas.length > 0 ? linhas.join("\n\n") : SEM_ORIENTACAO
}

/**
 * As orientações que se aplicam a um email, a partir de uma lista solta
 * (o que a query devolve). Puro para o teste não precisar de banco.
 */
export function aplicaveis(
  todas: ReadonlyArray<Orientacao>,
  flowType: string,
  emailNumber: number,
): Orientacao[] {
  return todas.filter((o) => {
    if (o.escopo === "global") return true
    if (o.escopo === "flow") return o.flow_type === flowType
    return o.flow_type === flowType && o.email_number === emailNumber
  })
}
