import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        h.updates.push(payload)
        return { eq: () => Promise.resolve({ error: null }) }
      },
      insert: (payload: Record<string, unknown>) => {
        h.inserts.push(payload)
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: "run-1" }, error: null }),
          }),
        }
      },
    }),
  }),
}))

import { finishGenerationRun } from "./telemetry.callback"

const base = {
  storeId: "s1",
  batchId: "b1",
  agent: "estruturador" as const,
  status: "error" as const,
}

beforeEach(() => {
  h.updates.length = 0
  h.inserts.length = 0
})

describe("finishGenerationRun — retry_count", () => {
  // O UPDATE não gravava retry_count: toda run aberta pelo start ficava com
  // o 0 do insert. A run do Estruturador que falhou em 27/08 aparecia com
  // "0 tentativas" tendo gasto 47k tokens de entrada em duas — o número que
  // responderia "ele tentou de novo?" era o único que não existia.
  it("persiste as tentativas quando o agente informa", async () => {
    await finishGenerationRun("run-1", { ...base, retryCount: 1 })
    expect(h.updates[0].retry_count).toBe(1)
  })

  // `?? undefined` e não `?? 0`: undefined é omitido pelo supabase-js e
  // preserva o que o start gravou. Mesma armadilha dos prompt_segments.
  it("omitido não vira 0 no UPDATE", async () => {
    await finishGenerationRun("run-1", base)
    expect(h.updates[0]).toHaveProperty("retry_count", undefined)
  })

  it("sem runId degrada pro INSERT, que já gravava o campo", async () => {
    await finishGenerationRun("", { ...base, retryCount: 2 })
    expect(h.updates).toHaveLength(0)
    expect(h.inserts[0].retry_count).toBe(2)
  })
})
