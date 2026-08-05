import { describe, expect, it } from "vitest"
import {
  buildInstagramAutomation,
  isSameInstagramAutomation,
  type InstagramAutomationInput,
} from "./instagram-automation"

const base: InstagramAutomationInput = {
  channelId: "ch-1",
  channelName: "@convertfy",
  pipelineId: "pipe-1",
  pipelineName: "Vendas",
  stageId: "stage-1",
  stageName: "Novo lead",
  eventKind: "message",
  firstMessageOnly: true,
  onlyThisChannel: true,
}

describe("buildInstagramAutomation", () => {
  it("monta trigger flat com todos os filtros no caso recomendado", () => {
    const built = buildInstagramAutomation(base)
    expect(built.trigger).toEqual({
      type: "thread_message_received",
      channel_type: "instagram",
      channel_id: "ch-1",
      event_kind: "message",
      first_message: true,
    })
  })

  it("espelha os filtros no config do nó trigger (builder mostra o mesmo que o dispatcher usa)", () => {
    const built = buildInstagramAutomation(base)
    const triggerNode = built.dag.nodes.find((n) => n.type === "trigger")
    expect(triggerNode?.config).toEqual({
      trigger_type: "thread_message_received",
      channel_type: "instagram",
      channel_id: "ch-1",
      event_kind: "message",
      first_message: true,
    })
  })

  it("event_kind 'any' omite o filtro — dispara em DM e comentário", () => {
    const built = buildInstagramAutomation({ ...base, eventKind: "any" })
    expect(built.trigger).not.toHaveProperty("event_kind")
    const triggerNode = built.dag.nodes.find((n) => n.type === "trigger")
    expect(triggerNode?.config).not.toHaveProperty("event_kind")
  })

  it("onlyThisChannel=false vale para qualquer conta de Instagram da org", () => {
    const built = buildInstagramAutomation({ ...base, onlyThisChannel: false })
    expect(built.trigger).not.toHaveProperty("channel_id")
  })

  it("firstMessageOnly=false omite o filtro (dispara a cada mensagem)", () => {
    const built = buildInstagramAutomation({ ...base, firstMessageOnly: false })
    expect(built.trigger).not.toHaveProperty("first_message")
  })

  it("liga o nó trigger ao action_create_deal com pipeline/etapa escolhidas", () => {
    const built = buildInstagramAutomation(base)
    const deal = built.dag.nodes.find((n) => n.type === "action_create_deal")
    expect(deal?.config).toEqual({ pipeline_id: "pipe-1", stage_id: "stage-1" })
    expect(built.dag.edges).toEqual([
      { id: "e-trigger-create-deal", from: "trigger-1", to: "create-deal-1" },
    ])
  })

  it("nome e descrição citam pipeline, etapa e escopo da conta", () => {
    const built = buildInstagramAutomation(base)
    expect(built.name).toContain("Vendas")
    expect(built.description).toContain("Novo lead")
    expect(built.description).toContain("@convertfy")
    expect(built.description).toContain("primeira mensagem")
  })
})

describe("isSameInstagramAutomation", () => {
  const built = buildInstagramAutomation(base)

  it("reconhece automação idêntica (mesmo gatilho e mesmo destino)", () => {
    const existing = {
      trigger: built.trigger,
      dag: built.dag,
    }
    expect(isSameInstagramAutomation(existing, built)).toBe(true)
  })

  it("destino diferente (outra etapa) NÃO é duplicata", () => {
    const other = buildInstagramAutomation({ ...base, stageId: "stage-2" })
    expect(
      isSameInstagramAutomation({ trigger: built.trigger, dag: built.dag }, other),
    ).toBe(false)
  })

  it("gatilho diferente (comentário vs DM) NÃO é duplicata", () => {
    const other = buildInstagramAutomation({ ...base, eventKind: "comment" })
    expect(
      isSameInstagramAutomation({ trigger: built.trigger, dag: built.dag }, other),
    ).toBe(false)
  })

  it("trigger de outro tipo nunca casa", () => {
    expect(
      isSameInstagramAutomation(
        { trigger: { type: "deal_stage_change" }, dag: built.dag },
        built,
      ),
    ).toBe(false)
  })
})
