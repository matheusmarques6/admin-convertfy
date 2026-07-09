import { describe, it, expect, vi, beforeEach } from "vitest"

const { architectMock, dispatchMock, adminMock, blocksData } = vi.hoisted(() => {
  const blocksData: { rows: Array<{ content: unknown }> } = { rows: [] }
  const adminMock = {
    from: vi.fn((table: string) => {
      if (table === "email_blocks") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: blocksData.rows, error: null }),
          }),
        }
      }
      // email_flow_emails update chain
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }),
  }
  return {
    architectMock: vi.fn().mockResolvedValue({ referenceSource: "llm" }),
    dispatchMock: vi.fn().mockResolvedValue({ ok: true }),
    adminMock,
    blocksData,
  }
})

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => adminMock,
  createClient: () => ({}),
}))
vi.mock("./architect/generate.service", () => ({
  generateBlueprintAndReference: architectMock,
}))
vi.mock("../services/email-copy-webhook.service", () => ({
  dispatchEmailCopyWebhook: dispatchMock,
}))

import { blockHasCopy, runTestGeneration } from "./test-generation.service"

const baseInput = {
  storeId: "store-1",
  flowId: "flow-1",
  emailId: "email-1",
  flowType: "welcome",
  emailNumber: 1,
  batchId: "batch-1",
  triggeredBy: "user-1",
}

describe("runTestGeneration — phase2Only", () => {
  beforeEach(() => {
    architectMock.mockClear()
    dispatchMock.mockClear()
    blocksData.rows = [{ content: { headline: "Olá" } }]
  })

  it("com copy: pula Montador/Blueprint e prepara a fase 2", async () => {
    const res = await runTestGeneration({ ...baseInput, phase2Only: true })
    expect(architectMock).not.toHaveBeenCalled()
    expect(res.status).toBe("running")
    expect(res.triggerPhase2).toBe(true)
  })

  it("sem copy: retorna erro sem gastar nada (nem architect, nem dispatch)", async () => {
    blocksData.rows = [{ content: {} }]
    const res = await runTestGeneration({ ...baseInput, phase2Only: true })
    expect(res.status).toBe("error")
    expect(architectMock).not.toHaveBeenCalled()
    expect(dispatchMock).not.toHaveBeenCalled()
  })

  it("sem phase2Only: comportamento original (roda o Architect)", async () => {
    const res = await runTestGeneration(baseInput)
    expect(architectMock).toHaveBeenCalledTimes(1)
    expect(res.triggerPhase2).toBe(true)
  })
})

describe("blockHasCopy (detecção de copy no bloco)", () => {
  it("true quando content é objeto com pelo menos uma chave", () => {
    expect(blockHasCopy({ headline: "Olá" })).toBe(true)
    expect(blockHasCopy({ a: 1, b: 2 })).toBe(true)
  })

  it("false para vazio / null / undefined / array / primitivos", () => {
    expect(blockHasCopy({})).toBe(false)
    expect(blockHasCopy(null)).toBe(false)
    expect(blockHasCopy(undefined)).toBe(false)
    expect(blockHasCopy([])).toBe(false)
    expect(blockHasCopy(["x"])).toBe(false)
    expect(blockHasCopy("texto")).toBe(false)
    expect(blockHasCopy(42)).toBe(false)
  })
})
