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

/**
 * Que tipo de orientação é. No escopo `flow` são DUAS coisas independentes,
 * e o pipeline já as trata separado: o Estruturador recebe `intencao_flow` e
 * `progressao` como variáveis de prompt distintas. O vocabulário é o mesmo
 * de `email_intents.kind` de propósito — o vault guarda o curado, isto é o
 * editável. `geral` nos escopos que não se dividem (global e por e-mail).
 */
export type KindOrientacao = "geral" | "intencao" | "progressao"

export interface Orientacao {
  escopo: EscopoOrientacao
  kind?: KindOrientacao
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
  kind: KindOrientacao = "geral",
): string {
  if (escopo === "global") return "Toda geração, qualquer flow"
  if (escopo === "flow") {
    const alcance = `todo email do flow ${flowType ?? "?"}`
    if (kind === "intencao") return `Intenção do flow — ${alcance}`
    if (kind === "progressao") return `Progressão do flow — ${alcance}`
    return `Todo email do flow ${flowType ?? "?"}`
  }
  return `Todo ${flowType ?? "?"} #${emailNumber ?? "?"}, em qualquer loja`
}

/**
 * Da mais ampla para a mais específica — a ordem em que entram no prompt.
 * O flow entra em duas passagens (intenção e progressão) porque são dois
 * textos distintos, e a intenção vem antes: ela é o contrato, a progressão
 * é como ele se desdobra.
 */
const ORDEM: Array<{ escopo: EscopoOrientacao; kind: KindOrientacao }> = [
  { escopo: "global", kind: "geral" },
  { escopo: "flow", kind: "geral" },
  { escopo: "flow", kind: "intencao" },
  { escopo: "flow", kind: "progressao" },
  { escopo: "email", kind: "geral" },
]

/**
 * Monta o conteúdo de `<orientacao_do_coo>`.
 *
 * Ordem geral → flow → email: a mais específica vem por ÚLTIMA, que é onde
 * o modelo tende a dar mais peso quando duas se contradizem — e é também a
 * que o COO escreveu sabendo mais sobre o caso.
 *
 * Filtra vazias (o COO não precisa preencher todas) e ignora o par
 * escopo+kind repetido: o UNIQUE do banco já garante um de cada, mas o
 * módulo não depende disso para não emitir bloco duplicado. Deduplicar só
 * por escopo colapsaria a intenção e a progressão do flow numa entrada só.
 */
export function montarBlocoOrientacoes(
  orientacoes: ReadonlyArray<Orientacao>,
): string {
  const vistos = new Set<string>()
  const linhas: string[] = []

  for (const { escopo, kind } of ORDEM) {
    const chave = `${escopo}:${kind}`
    if (vistos.has(chave)) continue
    const o = orientacoes.find(
      (x) =>
        x.escopo === escopo &&
        (x.kind ?? "geral") === kind &&
        (x.texto ?? "").trim().length > 0,
    )
    if (!o) continue
    vistos.add(chave)
    linhas.push(
      `[${rotuloEscopo(escopo, o.flow_type, o.email_number, kind)}]\n${o.texto.trim()}`,
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
