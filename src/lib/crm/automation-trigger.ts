/**
 * O gatilho que VALE é a coluna `automations.trigger` — é ela que o
 * dispatcher lê. O nó `trigger` do DAG é o que o builder mostra e edita.
 *
 * Os dois nascem espelhados (a automação do painel Instagram monta os
 * dois do mesmo objeto), mas o save do builder manda só `{name, dag}`:
 * mexer no canal, no tipo de interação ou na palavra-chave pela tela
 * mudava o desenho e **nada mais**. O campo existia, o usuário editava,
 * salvava, e o fluxo continuava disparando como antes — sem erro, sem
 * aviso, sem jeito de descobrir a não ser lendo o banco.
 *
 * Esta função reconstrói a coluna a partir do nó, e é chamada no PATCH
 * quando o corpo traz `dag` e não traz `trigger` explícito.
 */

export interface DagComTrigger {
  nodes?: Array<{ type?: string; config?: Record<string, unknown> | null }>
}

/**
 * Devolve o gatilho derivado do DAG, ou `null` quando não há o que
 * derivar — e aí quem chama MANTÉM o que está gravado. Apagar o gatilho
 * porque o desenho veio sem nó de trigger desligaria a automação em
 * silêncio, que é o defeito que esta função existe para não repetir.
 */
export function triggerDaDag(dag: DagComTrigger | null | undefined): Record<string, unknown> | null {
  const no = dag?.nodes?.find((n) => n.type === "trigger")
  const cfg = no?.config
  if (!cfg) return null

  const tipo = cfg.trigger_type
  if (typeof tipo !== "string" || !tipo.trim()) return null

  const saida: Record<string, unknown> = { type: tipo }
  for (const [k, v] of Object.entries(cfg)) {
    if (k === "trigger_type") continue
    // Campo apagado na tela vem vazio; guardá-lo faria o dispatcher
    // comparar contra "" e nunca casar.
    if (v === undefined || v === null || v === "") continue
    saida[k] = v
  }
  return saida
}
