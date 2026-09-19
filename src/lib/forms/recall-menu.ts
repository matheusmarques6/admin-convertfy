/**
 * O menu de recall do editor: digitar `@` na pergunta abre a lista do
 * que já foi respondido ANTES e insere `{{chave}} ` no lugar.
 *
 * Três regras, e as três erram em silêncio se ficarem na UI:
 *
 * 1. **Só o que vem ANTES entra na lista.** Recall de pergunta posterior
 *    sai vazio na tela (a pessoa ainda não respondeu), e oferecê-lo
 *    convida a escrever `{{email}}` na primeira tela. A ordem é a do
 *    schema, que é a ordem de resposta — mesma régua do
 *    `recall_da_mesma_tela` do diagnóstico.
 * 2. **A chave inserida é a que `blocoDoRecall` resolve**: alias quando
 *    existe; senão o rótulo, quando é único entre os blocos; senão o
 *    `ref`. Inserir um rótulo repetido faria o renderer resolver o
 *    PRIMEIRO bloco com aquele texto, que pode ser outro.
 * 3. **Campo oculto entra como variável** (`hidden_fields`): ele existe
 *    desde a primeira tela, então não tem posição — vale em toda pergunta.
 */

import type { FormSchema } from "@/types/forms-conversational"
import { rotuloCurtoDoTipo } from "./tipos-de-pergunta"

export interface OpcaoDeRecall {
  /** O que vai dentro do `{{ }}`. */
  chave: string
  /** O que o menu mostra. */
  rotulo: string
  /** "pergunta" | "oculto" — decide o ícone. */
  origem: "pergunta" | "oculto"
  /** Tipo da pergunta, para o ícone e o rótulo curto. */
  tipo?: string
  tipoCurto?: string
}

/** As opções disponíveis para a pergunta `refAtual` (ou todas, sem ref). */
export function opcoesDeRecall(schema: FormSchema, refAtual?: string | null): OpcaoDeRecall[] {
  const blocos = schema.blocks.filter((b) => !b.hidden)
  const ate = refAtual ? blocos.findIndex((b) => b.ref === refAtual) : -1
  const anteriores = ate >= 0 ? blocos.slice(0, ate) : refAtual ? [] : blocos

  const contagem = new Map<string, number>()
  for (const b of blocos) {
    const k = (b.label ?? "").trim().toLowerCase()
    if (k) contagem.set(k, (contagem.get(k) ?? 0) + 1)
  }

  const out: OpcaoDeRecall[] = anteriores
    .filter((b) => b.type !== "statement")
    .map((b) => {
      const rotulo = (b.label ?? "").trim()
      const alias = (b.alias ?? "").trim()
      const unico = rotulo && (contagem.get(rotulo.toLowerCase()) ?? 0) === 1
      const chave = alias || (unico ? rotulo : b.ref)
      return {
        chave,
        rotulo: rotulo || alias || b.ref,
        origem: "pergunta" as const,
        tipo: b.type,
        tipoCurto: rotuloCurtoDoTipo(b.type),
      }
    })

  for (const h of schema.hidden_fields ?? []) {
    const chave = h.trim()
    if (chave) out.push({ chave, rotulo: chave, origem: "oculto" })
  }
  return out
}

/**
 * O gatilho: o `@` mais recente antes do cursor, com o que foi digitado
 * depois dele, desde que o `@` esteja no início ou depois de espaço —
 * `joao@loja.com` não abre menu.
 */
export function gatilhoDeRecall(texto: string, cursor: number): { inicio: number; busca: string } | null {
  const antes = texto.slice(0, cursor)
  const at = antes.lastIndexOf("@")
  if (at < 0) return null
  if (at > 0 && !/\s/.test(antes[at - 1] ?? "")) return null
  const busca = antes.slice(at + 1)
  if (/\s/.test(busca)) return null
  return { inicio: at, busca }
}

/** Filtra as opções pelo que foi digitado depois do `@` (sem acento nem caixa). */
export function filtrarRecall(opcoes: OpcaoDeRecall[], busca: string): OpcaoDeRecall[] {
  const q = normalizar(busca)
  if (!q) return opcoes
  return opcoes.filter((o) => normalizar(o.rotulo).includes(q) || normalizar(o.chave).includes(q))
}

/** Troca `@busca` por `{{chave}} ` e devolve onde o cursor fica. */
export function inserirRecall(
  texto: string,
  cursor: number,
  chave: string,
): { texto: string; cursor: number } {
  const g = gatilhoDeRecall(texto, cursor)
  const token = `{{${chave}}} `
  if (!g) {
    const novo = texto.slice(0, cursor) + token + texto.slice(cursor)
    return { texto: novo, cursor: cursor + token.length }
  }
  const novo = texto.slice(0, g.inicio) + token + texto.slice(cursor)
  return { texto: novo, cursor: g.inicio + token.length }
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // "email" tem de achar "E-mail": quem digita não sabe como o rótulo
    // foi escrito, e pontuação não é o que distingue duas perguntas.
    .replace(/[^a-z0-9]+/g, "")
}
