import { describe, it, expect } from "vitest"
import {
  flowImplementationMeta,
  flowTriggerLabel,
  flowAudienceLabel,
} from "./flow-meta"
import type { FlowType } from "@/types/email-workspace"

const ALL_FLOWS: FlowType[] = [
  "welcome",
  "site_abandoned",
  "abandoned_cart",
  "browse_abandonment",
  "upsell",
  "win_back",
  "shipping_stages",
  "post_purchase",
  "custom",
]

describe("flowImplementationMeta", () => {
  it("cobre todos os flow types com trigger e audience preenchidos", () => {
    for (const ft of ALL_FLOWS) {
      const meta = flowImplementationMeta(ft)
      expect(meta.trigger, ft).toBeTruthy()
      expect(meta.audience, ft).toBeTruthy()
      expect(meta.metricEvent, ft).toBeTruthy()
    }
  })

  it("retorna gatilhos específicos por flow", () => {
    expect(flowTriggerLabel("welcome")).toMatch(/inscri/i)
    expect(flowTriggerLabel("abandoned_cart")).toMatch(/checkout|carrinho/i)
    expect(flowAudienceLabel("win_back")).toMatch(/inativ|sem compra|churn/i)
  })
})
