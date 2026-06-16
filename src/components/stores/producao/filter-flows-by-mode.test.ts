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

  it("preview com allowedEmails retorna tudo intacto (sem cadeado)", () => {
    const result = filterFlowsByMode(flows, "preview", [
      { flowType: "welcome", number: 1 },
      { flowType: "abandoned_cart", number: 1 },
      { flowType: "abandoned_cart", number: 2 },
    ])
    // pass-through: mesmos flows, todos os emails, nada marcado
    expect(result).toEqual(flows)
    for (const f of result) {
      expect(f.emails?.length).toBe(
        flows.find((x) => x.flow_type === f.flow_type)?.emails?.length,
      )
      for (const e of f.emails ?? []) {
        expect(
          (e as { preview_locked?: boolean }).preview_locked,
        ).toBeUndefined()
      }
    }
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
