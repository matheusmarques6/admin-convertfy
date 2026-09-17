/**
 * Trocar o endereço provisório pelo definitivo.
 *
 * Pergunta recém-criada no editor ainda não tem `crm_form_fields.id` —
 * ela só ganha um quando o PATCH a insere. Até lá o editor a endereça
 * por um `ref` provisório (`novo-3`), e é com esse `ref` que o operador
 * escreve a regra de salto: ele acabou de criar a pergunta, quer ligá-la
 * ao fluxo e não tem como saber que o endereço dela ainda é de mentira.
 *
 * Se a troca não acontecesse, o rascunho gravado apontaria para um `ref`
 * que nunca existirá, e a publicação descartaria a regra — **em
 * silêncio**, que é a assinatura de todo defeito caro deste produto.
 *
 * Quem sabe o de/para é o servidor (ele acabou de inserir as linhas), e
 * por isso a troca acontece lá, não na tela. Aqui só a aritmética dela,
 * pura e testável: `ref` do bloco, `goto` da regra e `ref` de cada
 * condição — os três lugares onde um endereço aparece.
 *
 * `ending:<x>` NÃO é remapeado: o `ref` de um final é escolhido pelo
 * operador e nunca foi provisório.
 */

import type { FormSchema } from "@/types/forms-conversational"

const PREFIXO_ENDING = "ending:"

export type MapaDeRefs = Readonly<Record<string, string>>

/** Aplica o de/para em todo endereço do schema. Não muta a entrada. */
export function remapearRefs(schema: FormSchema, mapa: MapaDeRefs): FormSchema {
  if (Object.keys(mapa).length === 0) return schema
  const novo = (ref: string) => mapa[ref] ?? ref

  return {
    ...schema,
    blocks: (schema.blocks ?? []).map((b) => ({
      ...b,
      ref: novo(b.ref),
      ...(b.logic
        ? {
            logic: b.logic.map((r) => ({
              ...r,
              goto: r.goto.startsWith(PREFIXO_ENDING) ? r.goto : novo(r.goto),
              conditions: (r.conditions ?? []).map((c) => ({ ...c, ref: novo(c.ref) })),
            })),
          }
        : {}),
    })),
  }
}

/**
 * O de/para a partir das posições: o editor manda o `ref` provisório de
 * cada pergunta nova, o banco devolve os ids na mesma ordem.
 *
 * Casar por POSIÇÃO e não por ordem de inserção é o que torna isto
 * correto: é a posição que o editor e o banco compartilham.
 */
export function mapaPorPosicao(
  provisorios: ReadonlyArray<{ posicao: number; ref: string }>,
  idsPorPosicao: ReadonlyArray<string>,
): MapaDeRefs {
  const out: Record<string, string> = {}
  for (const { posicao, ref } of provisorios) {
    const id = idsPorPosicao[posicao]
    // Sem id naquela posição não há troca a fazer. Inventar uma faria a
    // regra apontar para outra pergunta — pior que a regra cair.
    if (id && id !== ref) out[ref] = id
  }
  return out
}
