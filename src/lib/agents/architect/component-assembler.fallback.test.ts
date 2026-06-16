import { describe, it, expect, vi, beforeEach } from "vitest"

// Estado mutável da biblioteca (email_component_variants) + spy do upsert.
const h = vi.hoisted(() => ({
  upsertSpy: vi.fn().mockResolvedValue({ error: null }),
  variants: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "email_component_variants") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: h.variants, error: null }),
          }),
        }
      }
      if (table === "store_email_references") {
        return {
          upsert: (...args: unknown[]) => {
            h.upsertSpy(...args)
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
  prefilterCandidates: (pool: unknown[]) => pool, // sem ranqueamento no teste
}))

import { assembleStoreReference } from "./component-assembler.service"

function variant(id: string, blockType: string, html: string) {
  return {
    id,
    block_type: blockType,
    name: `${blockType} ${id}`,
    html,
    description: null,
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
  }
}

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

const CHOICE_V1 = { raw: '[{"block_index":0,"variant_id":"v1"}]', tokensInput: 5, tokensOutput: 5 }
const HTML_OK = {
  raw: "<!DOCTYPE html><html><body><div>ok</div></body></html>",
  tokensInput: 10,
  tokensOutput: 20,
}

beforeEach(() => {
  h.upsertSpy.mockClear()
  invokeAgent.mockReset()
  h.variants = [variant("v1", "hero", "<div>hero</div>")]
})

describe("assembleStoreReference — 2 passos (escolha + harmonização)", () => {
  it("escolhe (passo A) e harmoniza (passo B) → persiste a reference", async () => {
    invokeAgent.mockResolvedValueOnce(CHOICE_V1).mockResolvedValueOnce(HTML_OK)
    const res = await assembleStoreReference(baseInput)
    expect(invokeAgent).toHaveBeenCalledTimes(2)
    expect(h.upsertSpy).toHaveBeenCalledTimes(1)
    expect(res.html).toContain("</html>")
    expect(res.variantIds).toEqual(["v1"])
  })

  it("o HTML das variantes NÃO entra no passo A (só descrição/metadados)", async () => {
    h.variants = [
      variant("v1", "hero", "<div>UNIQUE_HTML_A</div>"),
      variant("v2", "hero", "<div>UNIQUE_HTML_B</div>"),
    ]
    invokeAgent.mockResolvedValueOnce(CHOICE_V1).mockResolvedValueOnce(HTML_OK)
    await assembleStoreReference(baseInput)
    // 1ª chamada = passo A (chooser). Os vars NÃO podem conter o html das variantes.
    const chooserVars = invokeAgent.mock.calls[0][1] as Record<string, string>
    expect(chooserVars.candidates_json).toContain("v1")
    expect(chooserVars.candidates_json).not.toContain("UNIQUE_HTML_A")
    expect(chooserVars.candidates_json).not.toContain("UNIQUE_HTML_B")
    expect(chooserVars.candidates_json).not.toContain("<div>")
  })

  it("passo B falha (erro) → persiste o concat REAL das escolhidas", async () => {
    invokeAgent.mockResolvedValueOnce(CHOICE_V1).mockRejectedValueOnce(new Error("timeout"))
    const res = await assembleStoreReference(baseInput)
    expect(h.upsertSpy).toHaveBeenCalledTimes(1) // conteúdo real da biblioteca → persiste
    expect(res.html).toContain("hero")
    expect(res.variantIds).toEqual(["v1"])
  })

  it("passo B com output não-HTML → persiste o concat REAL", async () => {
    invokeAgent
      .mockResolvedValueOnce(CHOICE_V1)
      .mockResolvedValueOnce({ raw: "desculpa, não consegui", tokensInput: 5, tokensOutput: 5 })
    const res = await assembleStoreReference(baseInput)
    expect(h.upsertSpy).toHaveBeenCalledTimes(1)
    expect(res.variantIds).toEqual(["v1"])
  })

  it("passo A sem escolha válida → top-1 da biblioteca (ainda persiste)", async () => {
    // passo A devolve lixo (não-JSON) → resolveChoices cai no top-1 da seção.
    invokeAgent
      .mockResolvedValueOnce({ raw: "nada de json", tokensInput: 1, tokensOutput: 1 })
      .mockResolvedValueOnce(HTML_OK)
    const res = await assembleStoreReference(baseInput)
    expect(h.upsertSpy).toHaveBeenCalledTimes(1)
    expect(res.variantIds).toEqual(["v1"])
  })

  it("biblioteca vazia → NÃO chama LLM nem persiste; devolve o curado", async () => {
    h.variants = []
    const curated = "<!DOCTYPE html><html><body><div>curado</div></body></html>"
    const res = await assembleStoreReference({ ...baseInput, referenceTemplateHtml: curated })
    expect(invokeAgent).not.toHaveBeenCalled()
    expect(h.upsertSpy).not.toHaveBeenCalled()
    expect(res.html).toBe(curated)
    expect(res.variantIds).toEqual([])
  })

  it("biblioteca vazia e sem curado → html vazio, sem persistir", async () => {
    h.variants = []
    const res = await assembleStoreReference(baseInput)
    expect(invokeAgent).not.toHaveBeenCalled()
    expect(h.upsertSpy).not.toHaveBeenCalled()
    expect(res.html).toBe("")
  })
})
