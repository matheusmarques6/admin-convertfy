/**
 * Quem recebe calibração humana — módulo PURO, client-safe.
 *
 * O ciclo (👍/👎 por run + orientação do COO) nasceu para o Estruturador
 * (migrations 20261084/20261086) e desde 04/09 vale também para o Curador:
 * a tela, a rota e o texto servido são os mesmos; o que muda é a quem ele
 * chega. Este módulo é o único lugar que sabe o de/para entre o nome que
 * quem escreve na tela usa (`curador`) e o nome da run no banco
 * (`assembler_chooser`) — quando ele estava espalhado, os dois divergiam.
 */

export const AGENTES_CALIBRAVEIS = ["estruturador", "curador"] as const

export type AgenteCalibravel = (typeof AGENTES_CALIBRAVEIS)[number]

/** `email_generation_runs.agent` do agente. */
const RUN_AGENT: Record<AgenteCalibravel, string> = {
  estruturador: "estruturador",
  curador: "assembler_chooser",
}

/** Nome humano — o mesmo que aparece no grafo do Estúdio. */
export const ROTULO_AGENTE: Record<AgenteCalibravel, string> = {
  estruturador: "Estruturador",
  curador: "Curador",
}

export function runAgentDe(agente: AgenteCalibravel): string {
  return RUN_AGENT[agente]
}

/** O inverso: da run para o agente calibrável (null se não for um deles). */
export function agenteDaRun(runAgent: string): AgenteCalibravel | null {
  for (const a of AGENTES_CALIBRAVEIS) {
    if (RUN_AGENT[a] === runAgent) return a
  }
  return null
}

/** Normaliza o parâmetro de rota/URL. Ausente ou desconhecido → estruturador. */
export function parseAgenteCalibravel(v: unknown): AgenteCalibravel {
  return AGENTES_CALIBRAVEIS.includes(v as AgenteCalibravel)
    ? (v as AgenteCalibravel)
    : "estruturador"
}
