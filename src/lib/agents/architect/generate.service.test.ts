import { describe, it, expect, vi, beforeEach } from "vitest"

// Controla o source do blueprint + spies dos passos.
const h = vi.hoisted(() => ({
  blueprintSource: "ai" as "ai" | "manual",
  reconcileSpy: vi.fn(),
  assembleSpy: vi.fn(),
  blueprintSpy: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => {
  // Builder mínimo: o Promise.all inicial só lê store/briefing/produtos/outline.
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: {}, error: null }),
    then: (onF: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(onF),
  }
  return {
    createAdminClient: () => ({ from: () => chain }),
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

import { generateBlueprintAndReference } from "./generate.service"

const input = { storeId: "store1", flowType: "welcome", emailNumber: 1, batchId: "b1" }

beforeEach(() => {
  h.blueprintSource = "ai"
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
