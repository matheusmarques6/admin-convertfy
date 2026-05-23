import { describe, it, expect } from "vitest"
import type { EmailFlow } from "@/types/email-workspace"
import { filterFlowsByMode } from "./filter-flows-by-mode"

function makeEmail(id: string, number: number) {
  return {
    id,
    flow_id: "f",
    number,
    name: `E${number}`,
    from_name: null,
    from_email: null,
    subject: null,
    preheader: null,
    html: null,
    delay_hours: null,
    status: "draft" as const,
    progress_percent: 0,
    klaviyo_message_id: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  }
}

function makeFlow(
  id: string,
  flow_type: EmailFlow["flow_type"],
  emails: ReturnType<typeof makeEmail>[],
): EmailFlow {
  return {
    id,
    store_id: "s",
    flow_type,
    name: flow_type,
    description: null,
    status: "in_progress",
    position: 1,
    assigned_to: null,
    progress_percent: 0,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    emails,
  }
}

describe("filterFlowsByMode", () => {
  const flows: EmailFlow[] = [
    makeFlow("w", "welcome", [
      makeEmail("w1", 1),
      makeEmail("w2", 2),
      makeEmail("w3", 3),
    ]),
    makeFlow("c", "abandoned_cart", [
      makeEmail("c1", 1),
      makeEmail("c2", 2),
    ]),
    makeFlow("p", "post_purchase", [makeEmail("p1", 1)]),
  ]

  it("modo full retorna intacto", () => {
    expect(filterFlowsByMode(flows, "full")).toEqual(flows)
    expect(filterFlowsByMode(flows, "full", [])).toEqual(flows)
  })

  it("modo preview sem allowedEmails retorna intacto", () => {
    expect(filterFlowsByMode(flows, "preview")).toEqual(flows)
    expect(filterFlowsByMode(flows, "preview", [])).toEqual(flows)
  })

  it("preview mantem todos os flows e todos os emails", () => {
    const result = filterFlowsByMode(flows, "preview", [
      { flowType: "welcome", number: 1 },
    ])
    expect(result.map((f) => f.flow_type)).toEqual([
      "welcome",
      "abandoned_cart",
      "post_purchase",
    ])
    for (const f of result) {
      expect(f.preview_locked).toBeUndefined()
      expect(f.emails?.length).toBe(flows.find((x) => x.flow_type === f.flow_type)?.emails?.length)
    }
  })

  it("preview marca emails fora da lista como preview_locked", () => {
    const result = filterFlowsByMode(flows, "preview", [
      { flowType: "welcome", number: 1 },
      { flowType: "abandoned_cart", number: 1 },
      { flowType: "abandoned_cart", number: 2 },
    ])
    const welcome = result.find((f) => f.flow_type === "welcome")!
    expect(welcome.emails?.map((e) => ({ n: e.number, locked: e.preview_locked }))).toEqual([
      { n: 1, locked: false },
      { n: 2, locked: true },
      { n: 3, locked: true },
    ])
    const cart = result.find((f) => f.flow_type === "abandoned_cart")!
    expect(cart.emails?.every((e) => e.preview_locked === false)).toBe(true)
    const post = result.find((f) => f.flow_type === "post_purchase")!
    expect(post.emails?.every((e) => e.preview_locked === true)).toBe(true)
  })

  it("flow sem nenhum piloto: todos emails ficam preview_locked", () => {
    const result = filterFlowsByMode(flows, "preview", [
      { flowType: "welcome", number: 99 },
    ])
    expect(result).toHaveLength(3)
    for (const f of result) {
      expect(f.emails?.every((e) => e.preview_locked === true)).toBe(true)
    }
  })

  it("simula os 4 pilotos da etapa 3 (welcome#1, cart#1+2, post#1)", () => {
    const result = filterFlowsByMode(flows, "preview", [
      { flowType: "welcome", number: 1 },
      { flowType: "abandoned_cart", number: 1 },
      { flowType: "abandoned_cart", number: 2 },
      { flowType: "post_purchase", number: 1 },
    ])
    const unlocked = Object.fromEntries(
      result.map((f) => [
        f.flow_type,
        f.emails?.filter((e) => !e.preview_locked).map((e) => e.number) ?? [],
      ]),
    )
    expect(unlocked).toEqual({
      welcome: [1],
      abandoned_cart: [1, 2],
      post_purchase: [1],
    })
  })

  it("preserva ordem original dos flows em modo preview", () => {
    const result = filterFlowsByMode(flows, "preview", [
      { flowType: "post_purchase", number: 1 },
    ])
    expect(result.map((f) => f.flow_type)).toEqual([
      "welcome",
      "abandoned_cart",
      "post_purchase",
    ])
  })
})
