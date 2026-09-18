/**
 * O que o desfecho faz no CRM.
 *
 * Um funil de aplicação recusa mais gente do que aprova — é para isso
 * que ele existe. Se todo desfecho virasse card na pipeline, o vendedor
 * abriria o Inbound e veria, no meio dos leads bons, dezenas de cards de
 * quem acabou de ler "a conta não fecha para você". O funil cumpriria o
 * papel na tela e o desfaria no CRM.
 *
 * Três decisões que erram em silêncio se ficarem espalhadas:
 *
 * 1. **A tag de uma resposta só conta se a resposta está no CAMINHO.**
 *    Quem responde a tela de gateway, volta e troca o mercado para
 *    Brasil deixa a resposta antiga em `answers` — ela não foi apagada,
 *    só deixou de ser perguntada. Marcar "risco de gateway" nesse lead
 *    manda o time abrir uma conversa sobre um problema que a pessoa não
 *    disse ter.
 * 2. **Toda tag é normalizada.** Elas viram `deals.tags` e `crm_leads
 *    .tags`, e o filtro do board já falhou em silêncio por diferença de
 *    caixa. "Risco de gateway" e "risco-de-gateway" não podem ser duas.
 * 3. **Não criar negócio é opção do FINAL, e o padrão é criar.** O
 *    comportamento de hoje (todo envio vira card) está no ar com verba
 *    em cima; mudá-lo para todo mundo por causa deste funil seria
 *    trocar um problema conhecido por um que ninguém pediu.
 */

import type { FormAnswers, FormOption, FormSchema } from "@/types/forms-conversational"

export interface DesfechoNoCrm {
  /** Tags do final mais as das respostas do caminho, normalizadas. */
  tags: string[]
  /** `false` só quando o final pede. Ausente = cria, como sempre. */
  criaNegocio: boolean
  desqualificado: boolean
  /**
   * A resposta que o closer devolve na conversa — a da pergunta marcada
   * como `destaque`. É a frase que a pessoa usou para descrever o que
   * muda na vida dela; enterrada no meio de vinte respostas, ninguém lê.
   */
  destaque: { pergunta: string; resposta: string } | null
}

/**
 * Normaliza a tag: minúscula, sem acento, espaço vira hífen.
 *
 * O texto que o operador digita ("Risco de gateway") e o que o filtro
 * procura têm de ser o mesmo, e quem garante isso é uma função só.
 */
export function normalizarTag(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Junta preservando a ordem e sem repetir. */
function unir(...listas: Array<string[] | undefined>): string[] {
  const vistas = new Set<string>()
  const out: string[] = []
  for (const l of listas) {
    for (const bruta of l ?? []) {
      const t = normalizarTag(bruta)
      if (!t || vistas.has(t)) continue
      vistas.add(t)
      out.push(t)
    }
  }
  return out
}

/** As opções que a resposta de um bloco representa. */
function escolhidas(opcoes: FormOption[] | undefined, resposta: unknown): FormOption[] {
  if (!opcoes || opcoes.length === 0) return []
  const valores = Array.isArray(resposta)
    ? resposta.map((v) => String(v))
    : typeof resposta === "string"
      ? [resposta]
      : []
  if (valores.length === 0) return []
  return opcoes.filter((o) => valores.includes(o.value))
}

export function desfechoNoCrm(
  schema: FormSchema | null,
  endingRef: string | null,
  answers: FormAnswers,
  /**
   * Os refs que a pessoa REALMENTE percorreu. `null` = sem lógica no
   * formulário (o clássico), e aí todo bloco respondido conta.
   */
  refsDoCaminho: Set<string> | null,
): DesfechoNoCrm {
  const final = endingRef ? (schema?.endings ?? []).find((e) => e.ref === endingRef) : undefined

  const daResposta: string[] = []
  let destaque: DesfechoNoCrm["destaque"] = null
  for (const b of schema?.blocks ?? []) {
    if (refsDoCaminho && !refsDoCaminho.has(b.ref)) continue
    const resposta = answers[b.ref]
    if (resposta === undefined || resposta === null || resposta === "") continue

    for (const o of escolhidas(b.options, resposta)) {
      if (o.tag) daResposta.push(o.tag)
    }
    if (b.destaque && !destaque) {
      const escolhas = escolhidas(b.options, resposta)
      const texto = escolhas.length > 0 ? escolhas.map((o) => o.label).join(", ") : String(resposta)
      destaque = { pergunta: b.label, resposta: texto }
    }
  }

  return {
    tags: unir(final?.tags, daResposta),
    // Final desconhecido cai no padrão: o `cria_negocio` de um final que
    // não existe no schema não pode decidir nada.
    criaNegocio: final ? final.cria_negocio !== false : true,
    desqualificado: Boolean(final?.disqualified),
    destaque,
  }
}
