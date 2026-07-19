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
  logGenerationRun: vi.fn().mockResolvedValue(""),
  startGenerationRun: vi.fn().mockResolvedValue("run-1"),
  finishGenerationRun: vi.fn().mockResolvedValue("run-1"),
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
  it("escolhe (passo A) e harmoniza (passo B) → persiste a reference (source=llm)", async () => {
    invokeAgent.mockResolvedValueOnce(CHOICE_V1).mockResolvedValueOnce(HTML_OK)
    const res = await assembleStoreReference(baseInput)
    expect(invokeAgent).toHaveBeenCalledTimes(2)
    expect(h.upsertSpy).toHaveBeenCalledTimes(1)
    expect(res.html).toContain("</html>")
    expect(res.variantIds).toEqual(["v1"])
    expect(res.source).toBe("llm")
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

  it("passo B falha + há reference global curado → usa o global, NÃO persiste (source=global)", async () => {
    invokeAgent.mockResolvedValueOnce(CHOICE_V1).mockRejectedValueOnce(new Error("timeout"))
    const curated = "<!DOCTYPE html><html><body><div>CURADO</div></body></html>"
    const res = await assembleStoreReference({ ...baseInput, referenceTemplateHtml: curated })
    expect(h.upsertSpy).not.toHaveBeenCalled() // fallback não persiste
    expect(res.html).toBe(curated) // cai no HTML reference global
    expect(res.source).toBe("global")
  })

  it("passo B falha + SEM global curado → html vazio, NÃO persiste (source=none)", async () => {
    invokeAgent.mockResolvedValueOnce(CHOICE_V1).mockRejectedValueOnce(new Error("timeout"))
    const res = await assembleStoreReference(baseInput) // referenceTemplateHtml = ""
    expect(h.upsertSpy).not.toHaveBeenCalled()
    expect(res.html).toBe("")
    expect(res.source).toBe("none")
  })

  it("passo B com output não-HTML + global curado → usa o global, NÃO persiste (source=global)", async () => {
    invokeAgent
      .mockResolvedValueOnce(CHOICE_V1)
      .mockResolvedValueOnce({ raw: "desculpa, não consegui", tokensInput: 5, tokensOutput: 5 })
    const curated = "<!DOCTYPE html><html><body><div>CURADO</div></body></html>"
    const res = await assembleStoreReference({ ...baseInput, referenceTemplateHtml: curated })
    expect(h.upsertSpy).not.toHaveBeenCalled()
    expect(res.html).toBe(curated)
    expect(res.source).toBe("global")
  })

  it("passo A sem escolha válida → top-1 da biblioteca; passo B OK → persiste (source=llm)", async () => {
    // passo A devolve lixo (não-JSON) → resolveChoices cai no top-1 da seção.
    invokeAgent
      .mockResolvedValueOnce({ raw: "nada de json", tokensInput: 1, tokensOutput: 1 })
      .mockResolvedValueOnce(HTML_OK)
    const res = await assembleStoreReference(baseInput)
    expect(h.upsertSpy).toHaveBeenCalledTimes(1)
    expect(res.variantIds).toEqual(["v1"])
    expect(res.source).toBe("llm")
  })

  it("biblioteca vazia + global curado → NÃO chama LLM nem persiste; devolve o global (source=global)", async () => {
    h.variants = []
    const curated = "<!DOCTYPE html><html><body><div>curado</div></body></html>"
    const res = await assembleStoreReference({ ...baseInput, referenceTemplateHtml: curated })
    expect(invokeAgent).not.toHaveBeenCalled()
    expect(h.upsertSpy).not.toHaveBeenCalled()
    expect(res.html).toBe(curated)
    expect(res.variantIds).toEqual([])
    expect(res.source).toBe("global")
  })

  it("biblioteca vazia e sem global → html vazio, sem persistir (source=none)", async () => {
    h.variants = []
    const res = await assembleStoreReference(baseInput)
    expect(invokeAgent).not.toHaveBeenCalled()
    expect(h.upsertSpy).not.toHaveBeenCalled()
    expect(res.html).toBe("")
    expect(res.source).toBe("none")
  })
})

describe("findDroppedImageTags (guard dos slots de imagem)", () => {
  it("detecta tags de imagem removidas pelo Montador", async () => {
    const { findDroppedImageTags } = await import("./component-assembler.service")
    const chosen = JSON.stringify([
      { block_index: 0, html: '<td background="{{HERO_IMAGE}}"><img alt="{{HERO_IMAGE_ALT}}"></td>' },
      { block_index: 1, html: '<img src="{{PRODUCT_1_IMAGE}}"><img src="{{PRODUCT_1_THUMB_2}}">' },
    ])
    const output = '<html><body><td>{{HERO_CTA_LABEL}}</td><img src="{{PRODUCT_1_IMAGE}}"></body></html>'
    expect(findDroppedImageTags(chosen, output)).toEqual([
      "HERO_IMAGE",
      "HERO_IMAGE_ALT",
      "PRODUCT_1_THUMB_2",
    ])
  })

  it("vazio quando todas as tags de imagem sobrevivem (ou não há nenhuma)", async () => {
    const { findDroppedImageTags } = await import("./component-assembler.service")
    expect(
      findDroppedImageTags('<img src="{{HERO_IMAGE}}">', '<img src="{{ HERO_IMAGE }}">'),
    ).toEqual([])
    expect(findDroppedImageTags("<p>sem imagem</p>", "<p>out</p>")).toEqual([])
  })
})
