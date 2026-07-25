import { describe, it, expect, vi, beforeEach } from "vitest"

// Estado mutável: spy do upsert (store_email_blueprints) + blueprint global
// curado (email_blueprints) que o fallback deve consultar.
const h = vi.hoisted(() => ({
  upsertSpy: vi.fn().mockResolvedValue({ error: null }),
  globalBlueprint: null as Record<string, unknown> | null,
}))

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "store_email_blueprints") {
        return {
          upsert: (...args: unknown[]) => {
            h.upsertSpy(...args)
            return Promise.resolve({ error: null })
          },
        }
      }
      // loadEffectiveBlueprint(storeId=null) consulta apenas email_blueprints.
      if (table === "email_blueprints") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: h.globalBlueprint, error: null }),
              }),
            }),
          }),
        }
      }
      return {}
    },
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
  logGenerationRun: vi.fn().mockResolvedValue(""),
  startGenerationRun: vi.fn().mockResolvedValue("run-1"),
  finishGenerationRun: vi.fn().mockResolvedValue("run-1"),
  computeCostCents: () => 0,
  resolveCostCents: () => 0,
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
  h.upsertSpy.mockClear()
  h.globalBlueprint = null
  invokeAgent.mockReset()
})

describe("generateStoreBlueprint — fallback usa o blueprint global curado", () => {
  it("grava o blueprint quando o LLM gera JSON válido (source=ai)", async () => {
    invokeAgent.mockResolvedValue({
      raw: '{"objective":"o","messaging":"m","subject_hint":"s","blocks":[{"type":"hero","label":"H","purpose":"p"}]}',
      tokensInput: 10,
      tokensOutput: 20,
    })
    const res = await generateStoreBlueprint(baseInput)
    expect(res.source).toBe("ai")
    expect(h.upsertSpy).toHaveBeenCalledTimes(1)
  })

  it("LLM falha + global curado existe → usa o global, NÃO persiste (source=manual)", async () => {
    invokeAgent.mockRejectedValue(new Error("timeout"))
    h.globalBlueprint = {
      flow_type: "welcome",
      email_number: 1,
      objective: "obj-global",
      messaging: "msg-global",
      subject_hint: "s",
      blocks: [
        { type: "hero", label: "H", purpose: "p", needs_image: true },
        { type: "footer", label: "F", purpose: "p" },
      ],
    }
    const res = await generateStoreBlueprint(baseInput)
    expect(res.source).toBe("manual")
    expect(h.upsertSpy).not.toHaveBeenCalled()
    // o blueprint do run corrente é o global curado (não o mínimo).
    expect(res.blueprint.objective).toBe("obj-global")
    expect(res.blueprint.blocks.length).toBe(2)
  })

  it("LLM falha + SEM global → cai no DEFAULT_BLUEPRINTS in-code (source=manual)", async () => {
    invokeAgent.mockRejectedValue(new Error("timeout"))
    h.globalBlueprint = null
    const res = await generateStoreBlueprint(baseInput)
    expect(res.source).toBe("manual")
    expect(h.upsertSpy).not.toHaveBeenCalled()
    // welcome/1 existe em DEFAULT_BLUEPRINTS → estrutura completa (não o mínimo).
    expect(res.blueprint.blocks.length).toBeGreaterThan(0)
  })
})
