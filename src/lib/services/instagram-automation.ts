/**
 * Automação 1-clique do painel Instagram: interação (DM/comentário) →
 * negócio na pipeline, estilo Datacrazy.
 *
 * Este módulo é PURO: monta o `trigger` flat (que o dispatcher usa para
 * o match) e o `dag` (que o builder renderiza) a partir da escolha do
 * operador. A rota só valida e insere.
 *
 * Regras que importam aqui:
 * - O trigger da COLUNA e o config do NÓ trigger nascem espelhados —
 *   o dispatcher lê a coluna, o builder mostra o nó, e o save do
 *   builder envia só {name, dag}, então a coluna sobrevive a edições.
 * - `first_message` ligado por padrão: sem ele a automação criaria um
 *   negócio a cada resposta do contato (o action_create_deal ainda é
 *   idempotente por thread, mas rodar o fluxo toda hora é ruído).
 * - `channel_id` restringe ao canal escolhido — org com mais de uma
 *   conta de Instagram não quer o direct da conta B caindo na pipeline
 *   da conta A.
 * - Sem `title_template`: o executor tem default dinâmico
 *   ("{contato} — Instagram"), melhor que qualquer texto fixo.
 */

export type InstagramAutomationEventKind = "message" | "comment" | "any"

export const IG_AUTOMATION_EVENT_LABEL: Record<InstagramAutomationEventKind, string> = {
  message: "Novo direct (DM)",
  comment: "Comentário em publicação",
  any: "DM ou comentário",
}

export interface InstagramAutomationInput {
  channelId: string
  channelName: string
  pipelineId: string
  pipelineName: string
  stageId: string
  stageName: string
  eventKind: InstagramAutomationEventKind
  /** Dispara só na primeira mensagem do contato (default recomendado). */
  firstMessageOnly: boolean
  /** Restringe ao canal escolhido (org pode ter várias contas de IG). */
  onlyThisChannel: boolean
}

export interface BuiltInstagramAutomation {
  name: string
  description: string
  trigger: Record<string, unknown>
  dag: {
    nodes: Array<{
      id: string
      type: string
      position: { x: number; y: number }
      config: Record<string, unknown>
    }>
    edges: Array<{ id: string; from: string; to: string }>
  }
}

export function buildInstagramAutomation(
  input: InstagramAutomationInput,
): BuiltInstagramAutomation {
  const filters: Record<string, unknown> = { channel_type: "instagram" }
  if (input.onlyThisChannel) filters.channel_id = input.channelId
  if (input.eventKind !== "any") filters.event_kind = input.eventKind
  if (input.firstMessageOnly) filters.first_message = true

  const eventText =
    input.eventKind === "message"
      ? "novo direct"
      : input.eventKind === "comment"
        ? "comentário"
        : "DM ou comentário"

  const name = `Instagram → ${input.pipelineName}: ${eventText} vira negócio`
  const scopeText = input.onlyThisChannel ? `da conta "${input.channelName}"` : "de qualquer conta"
  const description =
    `Criada pelo painel Instagram: ${eventText} ${scopeText} cadastra o contato ` +
    `como negócio na etapa "${input.stageName}" da pipeline "${input.pipelineName}".` +
    (input.firstMessageOnly ? " Dispara só na primeira mensagem do contato." : "")

  return {
    name,
    description,
    trigger: { type: "thread_message_received", ...filters },
    dag: {
      nodes: [
        {
          id: "trigger-1",
          type: "trigger",
          position: { x: 80, y: 180 },
          config: { trigger_type: "thread_message_received", ...filters },
        },
        {
          id: "create-deal-1",
          type: "action_create_deal",
          position: { x: 420, y: 180 },
          config: { pipeline_id: input.pipelineId, stage_id: input.stageId },
        },
      ],
      edges: [{ id: "e-trigger-create-deal", from: "trigger-1", to: "create-deal-1" }],
    },
  }
}

/**
 * Duas automações são "a mesma" quando têm o mesmo gatilho (canal,
 * evento, first_message) e o mesmo destino (pipeline+etapa). A rota usa
 * isso para não criar duplicata em double-click — devolve a existente.
 */
export function isSameInstagramAutomation(
  existing: {
    trigger: Record<string, unknown> | null
    dag: { nodes?: Array<{ type?: string; config?: Record<string, unknown> }> } | null
  },
  built: BuiltInstagramAutomation,
): boolean {
  const t = existing.trigger
  if (!t || t.type !== "thread_message_received") return false
  const keys = ["channel_type", "channel_id", "event_kind", "first_message"] as const
  for (const k of keys) {
    if ((t[k] ?? null) !== ((built.trigger as Record<string, unknown>)[k] ?? null)) return false
  }
  const dealNode = existing.dag?.nodes?.find((n) => n.type === "action_create_deal")
  const builtDeal = built.dag.nodes.find((n) => n.type === "action_create_deal")
  if (!dealNode?.config || !builtDeal) return false
  return (
    dealNode.config.pipeline_id === builtDeal.config.pipeline_id &&
    dealNode.config.stage_id === builtDeal.config.stage_id
  )
}
