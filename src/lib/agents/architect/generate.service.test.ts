import { describe, it, expect, vi, beforeEach } from "vitest"

// Controla o source do blueprint + spies dos passos.
const h = vi.hoisted(() => ({
  blueprintSource: "ai" as "ai" | "manual",
  textOnly: false,
  // Guard de reuso: existência de reference/blueprint persistidos por loja.
  storedRef: false,
  storedBp: false,
  reconcileSpy: vi.fn(),
  assembleSpy: vi.fn(),
  blueprintSpy: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => {
  // Builder mínimo table-aware: o Promise.all inicial lê store/briefing/
  // produtos/outline ({} genérico); o guard de reuso lê store_email_
  // references/blueprints (controlado por h.storedRef/h.storedBp).
  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => {
        if (table === "store_email_references") {
          return Promise.resolve({
            data: h.storedRef ? { id: "ref1" } : null,
            error: null,
          })
        }
        if (table === "store_email_blueprints") {
          return Promise.resolve({
            data: h.storedBp ? { id: "bp1" } : null,
            error: null,
          })
        }
        return Promise.resolve({ data: {}, error: null })
      },
      then: (onF: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(onF),
    }
    return chain
  }
  return {
    createAdminClient: () => ({ from: (t: string) => makeChain(t) }),
    createClient: () => ({}),
  }
})

vi.mock("./component-assembler.service", () => ({
  assembleStoreReference: (...a: unknown[]) => {
    h.assembleSpy(...a)
    return Promise.resolve({ html: "<html></html>", source: "llm", variantIds: [] })
  },
}))

vi.mock("./blueprint-generator.service", () => ({
  generateStoreBlueprint: (...a: unknown[]) => {
    h.blueprintSpy(...a)
    return Promise.resolve({
      blueprint: { objective: "", messaging: "", subject_hint: null, blocks: [] },
      source: h.blueprintSource,
      model: h.blueprintSource === "ai" ? "sonnet" : null,
    })
  },
}))

vi.mock("@/lib/services/reconcile-blocks.service", () => ({
  reconcileEmailStructure: (...a: unknown[]) => h.reconcileSpy(...a),
}))

vi.mock("../reference-template", () => ({
  loadGlobalReferenceTemplate: () => Promise.resolve(""),
}))

vi.mock("./outline-sections", () => ({
  resolveStructure: () => [],
}))

// Flag "somente texto": controlada pelo teste (default false).
vi.mock("./blueprint-loader", () => ({
  isTextOnlyEmail: () => Promise.resolve(h.textOnly),
}))

import { generateBlueprintAndReference } from "./generate.service"

const input = { storeId: "store1", flowType: "welcome", emailNumber: 1, batchId: "b1" }

beforeEach(() => {
  h.blueprintSource = "ai"
  h.textOnly = false
  h.storedRef = false
  h.storedBp = false
  h.reconcileSpy.mockReset()
  h.reconcileSpy.mockResolvedValue({
    reconciled: true,
    added: 7,
    total: 17,
    skipped: null,
  })
  h.assembleSpy.mockReset()
  h.blueprintSpy.mockReset()
})

describe("generateBlueprintAndReference — propaga estrutura (Fase 1)", () => {
  it("source='ai' → reconcilia os email_blocks com a estrutura nova", async () => {
    h.blueprintSource = "ai"
    const res = await generateBlueprintAndReference(input)
    expect(h.reconcileSpy).toHaveBeenCalledWith("store1", "welcome", 1, {
      force: false,
    })
    expect(res.referenceSource).toBe("llm")
  })

  it("source='manual' (fallback) → NÃO reconcilia (store_bp não mudou)", async () => {
    h.blueprintSource = "manual"
    await generateBlueprintAndReference(input)
    expect(h.reconcileSpy).not.toHaveBeenCalled()
  })

  it("falha no reconcile NÃO derruba o Architect", async () => {
    h.blueprintSource = "ai"
    h.reconcileSpy.mockRejectedValue(new Error("db down"))
    const res = await generateBlueprintAndReference(input)
    expect(h.reconcileSpy).toHaveBeenCalled()
    expect(res.referenceSource).toBe("llm")
  })
})

describe("generateBlueprintAndReference — email somente texto (text_only)", () => {
  it("curto-circuita com referenceSource='global' SEM rodar Montador/Blueprint/reconcile", async () => {
    h.textOnly = true
    const res = await generateBlueprintAndReference(input)
    expect(res.referenceSource).toBe("global")
    expect(h.assembleSpy).not.toHaveBeenCalled()
    expect(h.blueprintSpy).not.toHaveBeenCalled()
    expect(h.reconcileSpy).not.toHaveBeenCalled()
  })
})

describe("generateBlueprintAndReference — guard de reuso (sem force)", () => {
  it("reference+blueprint persistidos → 'store' SEM rodar Montador/Blueprint", async () => {
    h.storedRef = true
    h.storedBp = true
    const res = await generateBlueprintAndReference(input)
    expect(res.referenceSource).toBe("store")
    expect(h.assembleSpy).not.toHaveBeenCalled()
    expect(h.blueprintSpy).not.toHaveBeenCalled()
    expect(h.reconcileSpy).not.toHaveBeenCalled()
  })

  it("force=true → regenera mesmo com reference+blueprint persistidos", async () => {
    h.storedRef = true
    h.storedBp = true
    const res = await generateBlueprintAndReference({ ...input, force: true })
    expect(res.referenceSource).toBe("llm")
    expect(h.assembleSpy).toHaveBeenCalledTimes(1)
    expect(h.blueprintSpy).toHaveBeenCalledTimes(1)
  })

  it("só reference sem blueprint (geração anterior incompleta) → regenera", async () => {
    h.storedRef = true
    h.storedBp = false
    const res = await generateBlueprintAndReference(input)
    expect(res.referenceSource).toBe("llm")
    expect(h.assembleSpy).toHaveBeenCalledTimes(1)
  })
})
