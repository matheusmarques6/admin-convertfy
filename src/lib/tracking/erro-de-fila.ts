/**
 * Classificação do erro do Postgres na hora de enfileirar um evento de
 * conversão.
 *
 * Existe por causa de um defeito que ficou um mês invisível: o índice de
 * dedupe da fila é PARCIAL
 * (`... (submission_id, platform, event_name) WHERE submission_id IS NOT
 * NULL`) e o `on_conflict` do PostgREST não carrega o predicado, então o
 * Postgres não consegue inferir o índice e recusa a statement inteira com
 * **42P10**. Como o enqueue fazia um `upsert` em lote e tratava qualquer
 * erro com `log.error` + `return`, TODO cadastro deixou de gerar evento —
 * o "Lead" junto com o qualificado — sem nada em tela, sem linha na fila,
 * sem falha visível em lugar nenhum.
 *
 * A lição que este módulo carrega: o único erro que significa "a linha já
 * está lá, siga" é o 23505. Qualquer outro é falha de verdade e precisa
 * chegar ao log COM O CÓDIGO — foi a ausência do código que fez o
 * diagnóstico custar um mês.
 */

/** Formato mínimo do erro que o supabase-js devolve. */
export interface ErroDoPostgres {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

/** Violação de unicidade — a linha já existe, e isso não é falha. */
export const CODIGO_DUPLICADA = "23505"

/**
 * `ON CONFLICT` que o Postgres não consegue casar com nenhum índice.
 * Na prática, aqui, significa índice único parcial.
 */
export const CODIGO_ON_CONFLICT_INCOMPATIVEL = "42P10"

export function ehDuplicada(erro: ErroDoPostgres | null | undefined): boolean {
  return erro?.code === CODIGO_DUPLICADA
}

export function ehOnConflictIncompativel(erro: ErroDoPostgres | null | undefined): boolean {
  return erro?.code === CODIGO_ON_CONFLICT_INCOMPATIVEL
}

/**
 * Mensagem curta e com o código, para o log e para a tela.
 *
 * O código vem primeiro de propósito: é por ele que se procura, e foi
 * justamente ele que faltava quando o enqueue logava só `insert_failed`.
 */
export function descreverErro(erro: ErroDoPostgres | null | undefined): string {
  if (!erro) return "erro desconhecido"
  const codigo = erro.code ? `${erro.code}: ` : ""
  const texto = erro.message?.trim() || erro.details?.trim() || "sem mensagem"
  return `${codigo}${texto}`
}

/** Resultado de enfileirar uma linha. */
export type DesfechoDaLinha = "inserida" | "ja_existia" | "falhou"

export interface ResumoDoEnqueue {
  inseridas: number
  jaExistiam: number
  falhas: string[]
}

/**
 * Junta os desfechos de cada linha num resumo.
 *
 * Linha a linha, e não em lote, porque o lote é exatamente o que fazia o
 * "Lead" morrer junto com o qualificado: uma statement só, um conflito,
 * as duas linhas perdidas.
 */
export function resumirEnqueue(
  desfechos: ReadonlyArray<{ desfecho: DesfechoDaLinha; erro?: string }>,
): ResumoDoEnqueue {
  const resumo: ResumoDoEnqueue = { inseridas: 0, jaExistiam: 0, falhas: [] }
  for (const d of desfechos) {
    if (d.desfecho === "inserida") resumo.inseridas++
    else if (d.desfecho === "ja_existia") resumo.jaExistiam++
    else resumo.falhas.push(d.erro ?? "erro desconhecido")
  }
  return resumo
}
