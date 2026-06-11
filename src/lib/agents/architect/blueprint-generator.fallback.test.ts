import { describe, it, expect, vi, beforeEach } from "vitest"

// Spy do upsert em store_email_blueprints.
const upsertSpy = vi.fn().mockResolvedValue({ error: null })

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      table === "store_email_blueprints"
        ? {
            upsert: (...args: unknown[]) => {
              upsertSpy(...args)
              return Promise.resolve({ error: null })
            },
          }
        : {},
  }),
  createClient: () => ({}),
}))

const invokeAgent = vi.fn()
vi.mock("./llm-invoke", async (importActual) => {
  const actual = await importActual<typeof import("./llm-invoke")>()
  return {
    ...actual,
    invokeAgent: (...a: unknown[]) => invokeAgent(...a),
    loadActiveAgentConfig: vi.fn().mockResolvedValue(null), // usa DEFAULT config
  }
})

vi.mock("../callbacks/telemetry.callback", () => ({
  logGenerationRun: vi.fn().mockResolvedValue(undefined),
  computeCostCents: () => 0,
}))

import { generateStoreBlueprint } from "./blueprint-generator.service"

const baseInput = {
  storeId: "s1",
  flowType: "welcome",
  emailNumber: 1,
  batchId: "b1",
  brandName: "Loja",
  nicho: "",
  posicionamento: "",
  persona: "",
  tomVoz: "",
  topProductNames: [],
  outline: null,
  referenceHtml: "<html><body><div>hero</div></body></html>",
  pesquisa: "",
}

beforeEach(() => {
  upsertSpy.mockClear()
  invokeAgent.mockReset()
})

describe("generateStoreBlueprint — fallback não persiste o blueprint", () => {
  it("grava o blueprint quando o LLM gera JSON válido (source=ai)", async () => {
    invokeAgent.mockResolvedValue({
      raw: '{"objective":"o","messaging":"m","subject_hint":"s","blocks":[{"type":"hero","label":"H","purpose":"p"}]}',
      tokensInput: 10,
      tokensOutput: 20,
    })
    const res = await generateStoreBlueprint(baseInput)
    expect(res.source).toBe("ai")
    expect(upsertSpy).toHaveBeenCalledTimes(1)
  })

  it("NÃO grava o blueprint quando o LLM falha (cai no DEFAULT_BLUEPRINTS, source=manual)", async () => {
    invokeAgent.mockRejectedValue(new Error("timeout"))
    const res = await generateStoreBlueprint(baseInput)
    expect(res.source).toBe("manual")
    expect(upsertSpy).not.toHaveBeenCalled()
    // retorno ainda traz o blueprint de fallback pro run corrente
    expect(res.blueprint.blocks.length).toBeGreaterThan(0)
  })
})
