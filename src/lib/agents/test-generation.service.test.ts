import { describe, it, expect, vi, beforeEach } from "vitest"

const { architectMock, dispatchMock, adminMock, blocksData, emailRow } = vi.hoisted(() => {
  const blocksData: { rows: Array<{ content: unknown }> } = { rows: [] }
  // Row do email lida pelo guard de dedup do fullPipeline (select+maybeSingle)
  const emailRow: { data: Record<string, unknown> | null } = { data: null }
  const adminMock = {
    from: vi.fn((table: string) => {
      if (table === "email_blocks") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: blocksData.rows, error: null }),
          }),
        }
      }
      // email_flow_emails: update chain + select/maybeSingle (guard de dedup)
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockImplementation(async () => ({
              data: emailRow.data,
              error: null,
            })),
          }),
        }),
      }
    }),
  }
  return {
    architectMock: vi.fn().mockResolvedValue({ referenceSource: "llm" }),
    dispatchMock: vi.fn().mockResolvedValue({ ok: true }),
    adminMock,
    blocksData,
    emailRow,
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

describe("runTestGeneration — fullPipeline (dedup de geração em voo)", () => {
  beforeEach(() => {
    architectMock.mockClear()
    dispatchMock.mockClear()
    emailRow.data = null
    blocksData.rows = []
  })

  it("email em copy_generating RECENTE: bloqueia com generation_in_progress", async () => {
    emailRow.data = {
      status: "copy_generating",
      generation_batch_id: "batch-antigo",
      updated_at: new Date(Date.now() - 2 * 60_000).toISOString(),
      auto_phase2_relaxed: false,
    }
    const res = await runTestGeneration({ ...baseInput, fullPipeline: true })
    expect(res.status).toBe("error")
    expect(res.error).toContain("generation_in_progress")
    expect(architectMock).not.toHaveBeenCalled()
    expect(dispatchMock).not.toHaveBeenCalled()
  })

  it("claim de full pipeline em voo (auto_phase2_relaxed, status draft): bloqueia", async () => {
    // Janela da fase 1 síncrona: status ainda draft, mas o claim marcou o flag.
    emailRow.data = {
      status: "draft",
      generation_batch_id: "batch-em-voo",
      updated_at: new Date(Date.now() - 60_000).toISOString(),
      auto_phase2_relaxed: true,
    }
    const res = await runTestGeneration({ ...baseInput, fullPipeline: true })
    expect(res.status).toBe("error")
    expect(res.error).toContain("generation_in_progress")
    expect(architectMock).not.toHaveBeenCalled()
  })

  it("email travado há mais que a janela (>10min): re-teste permitido", async () => {
    emailRow.data = {
      status: "copy_generating",
      generation_batch_id: "batch-travado",
      updated_at: new Date(Date.now() - 30 * 60_000).toISOString(),
      auto_phase2_relaxed: false,
    }
    const res = await runTestGeneration({ ...baseInput, fullPipeline: true })
    expect(res.status).toBe("dispatched")
    expect(architectMock).toHaveBeenCalledTimes(1)
    expect(dispatchMock).toHaveBeenCalledTimes(1)
  })

  it("email draft sem geração em voo: pipeline roda normal", async () => {
    emailRow.data = {
      status: "draft",
      generation_batch_id: null,
      updated_at: new Date().toISOString(),
      auto_phase2_relaxed: false,
    }
    const res = await runTestGeneration({ ...baseInput, fullPipeline: true })
    expect(res.status).toBe("dispatched")
    expect(res.fullPipeline).toBe(true)
    expect(architectMock).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    )
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
