import { describe, it, expect, vi, beforeEach } from "vitest"

// Spy do upsert em store_email_references.
const upsertSpy = vi.fn().mockResolvedValue({ error: null })

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "email_component_variants") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  {
                    id: "v1",
                    block_type: "hero",
                    name: "Hero V1",
                    html: "<div>hero</div>",
                    slots: [],
                    niche_affinity: [],
                    positioning: [],
                    mood: [],
                    density: null,
                    tags: [],
                    thumbnail: null,
                    is_active: true,
                    version: 1,
                    created_at: "2026-01-01",
                    created_by: null,
                  },
                ],
                error: null,
              }),
          }),
        }
      }
      if (table === "store_email_references") {
        return {
          upsert: (...args: unknown[]) => {
            upsertSpy(...args)
            return Promise.resolve({ error: null })
          },
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
  logGenerationRun: vi.fn().mockResolvedValue(undefined),
  computeCostCents: () => 0,
}))

vi.mock("./component-deriver", () => ({
  buildMatchContext: () => ({}),
  DEFAULT_TOP_K: 3,
  prefilterCandidates: (pool: unknown[]) => pool,
}))

import { assembleStoreReference } from "./component-assembler.service"

const baseInput = {
  storeId: "s1",
  flowType: "welcome",
  emailNumber: 1,
  batchId: "b1",
  brandName: "Loja",
  nicho: "",
  posicionamento: "",
  tomVoz: "",
  mood: "",
  persona: "",
  briefingJson: "{}",
  pesquisa: "",
  outlineObjective: "",
  outlineGuidance: "",
  outlineToneHint: "",
  referenceTemplateHtml: "",
  structure: [{ section: "hero", label: "Hero" }],
}

beforeEach(() => {
  upsertSpy.mockClear()
  invokeAgent.mockReset()
})

describe("assembleStoreReference — fallback não persiste a reference", () => {
  it("grava a reference quando o LLM gera HTML válido", async () => {
    invokeAgent.mockResolvedValue({
      raw: "<!DOCTYPE html><html><body><div>ok</div></body></html>",
      tokensInput: 10,
      tokensOutput: 20,
    })
    const res = await assembleStoreReference(baseInput)
    expect(upsertSpy).toHaveBeenCalledTimes(1)
    expect(res.html).toContain("</html>")
  })

  it("NÃO grava a reference quando o LLM falha (cai no fallback)", async () => {
    invokeAgent.mockRejectedValue(new Error("timeout"))
    const res = await assembleStoreReference(baseInput)
    expect(upsertSpy).not.toHaveBeenCalled()
    // retorno ainda traz um html de fallback pro Blueprint do mesmo run
    expect(res.html).toContain("<!DOCTYPE html>")
  })

  it("NÃO grava a reference quando o output do LLM não é HTML", async () => {
    invokeAgent.mockResolvedValue({
      raw: "desculpa, não consegui gerar",
      tokensInput: 5,
      tokensOutput: 5,
    })
    await assembleStoreReference(baseInput)
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it("fallback usa o HTML de referência CURADO quando existe (não a biblioteca)", async () => {
    invokeAgent.mockRejectedValue(new Error("timeout"))
    const curated =
      "<!DOCTYPE html><html><body><div>email curado completo</div></body></html>"
    const res = await assembleStoreReference({
      ...baseInput,
      referenceTemplateHtml: curated,
    })
    expect(upsertSpy).not.toHaveBeenCalled()
    expect(res.html).toBe(curated)
    // não escolheu variantes da biblioteca
    expect(res.variantIds).toEqual([])
  })

  it("fallback só concatena variantes quando NÃO há curado", async () => {
    invokeAgent.mockRejectedValue(new Error("timeout"))
    const res = await assembleStoreReference(baseInput) // referenceTemplateHtml: ""
    expect(res.html).toContain("hero")
    expect(res.variantIds).toEqual(["v1"])
  })
})
