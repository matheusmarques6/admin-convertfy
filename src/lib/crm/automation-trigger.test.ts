import { describe, expect, it } from "vitest"
import { triggerDaDag } from "./automation-trigger"

describe("o gatilho que vale sai do desenho que o usuário editou", () => {
  it("nó trigger vira a coluna, com os filtros", () => {
    expect(
      triggerDaDag({
        nodes: [
          {
            type: "trigger",
            config: {
              trigger_type: "thread_message_received",
              channel_type: "instagram",
              channel_id: "ch-1",
              event_kind: "comment",
              keyword: "SEGMENTO",
            },
          },
          { type: "action_create_deal", config: { pipeline_id: "p" } },
        ],
      }),
    ).toEqual({
      type: "thread_message_received",
      channel_type: "instagram",
      channel_id: "ch-1",
      event_kind: "comment",
      keyword: "SEGMENTO",
    })
  })

  it("filtro apagado na tela sai da coluna — vazio nunca casaria", () => {
    const t = triggerDaDag({
      nodes: [{ type: "trigger", config: { trigger_type: "thread_message_received", channel_type: "", event_kind: null } }],
    })
    expect(t).toEqual({ type: "thread_message_received" })
  })

  it("sem nó de trigger, ou sem tipo, não derruba o que está gravado", () => {
    expect(triggerDaDag({ nodes: [{ type: "action_create_deal", config: {} }] })).toBeNull()
    expect(triggerDaDag({ nodes: [{ type: "trigger", config: { trigger_type: "  " } }] })).toBeNull()
    expect(triggerDaDag({ nodes: [{ type: "trigger" }] })).toBeNull()
    expect(triggerDaDag(null)).toBeNull()
  })

  it("mantém o formato flat que o dispatcher lê nos outros gatilhos", () => {
    expect(
      triggerDaDag({ nodes: [{ type: "trigger", config: { trigger_type: "deal_stage_change", to_stage_id: "s-9" } }] }),
    ).toEqual({ type: "deal_stage_change", to_stage_id: "s-9" })
  })
})
