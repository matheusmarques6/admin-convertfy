import { describe, expect, it } from "vitest"
import { mergeSnapshot, upsertRun } from "./use-agent-runs-live"
import type { LiveAgentRun } from "@/types/agent-runs-live"

function makeRun(overrides: Partial<LiveAgentRun>): LiveAgentRun {
  return {
    id: "run-1",
    created_at: "2026-07-08T12:00:00.000Z",
    updated_at: "2026-07-08T12:00:00.000Z",
    batch_id: null,
    agent: "html",
    model: "claude-sonnet-4-6",
    status: "running",
    tokens_input: 0,
    tokens_output: 0,
    cost_cents: 0,
    duration_ms: 0,
    retry_count: 0,
    error_message: null,
    store_id: "store-1",
    store_name: "Loja Teste",
    email_id: null,
    email_name: null,
    email_number: null,
    flow_id: null,
    flow_type: null,
    ...overrides,
  }
}

describe("upsertRun", () => {
  it("insere run novo no topo (ordenado por created_at desc)", () => {
    const older = makeRun({ id: "a", created_at: "2026-07-08T11:00:00.000Z" })
    const newer = makeRun({ id: "b", created_at: "2026-07-08T12:00:00.000Z" })
    const result = upsertRun([older], newer)
    expect(result.map((r) => r.id)).toEqual(["b", "a"])
  })

  it("atualiza run existente quando o payload é mais novo (running → success)", () => {
    const running = makeRun({ id: "a", status: "running" })
    const finished = makeRun({
      id: "a",
      status: "success",
      updated_at: "2026-07-08T12:01:00.000Z",
      duration_ms: 60_000,
    })
    const result = upsertRun([running], finished)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("success")
    expect(result[0].duration_ms).toBe(60_000)
  })

  it("ignora payload mais velho que o estado local", () => {
    const finished = makeRun({
      id: "a",
      status: "success",
      updated_at: "2026-07-08T12:01:00.000Z",
    })
    const staleRunning = makeRun({
      id: "a",
      status: "running",
      updated_at: "2026-07-08T12:00:30.000Z",
    })
    const result = upsertRun([finished], staleRunning)
    expect(result[0].status).toBe("success")
  })

  it("no-op quando updated_at e status são idênticos (evita re-render)", () => {
    const run = makeRun({ id: "a" })
    const list = [run]
    expect(upsertRun(list, makeRun({ id: "a" }))).toBe(list)
  })
})

describe("mergeSnapshot", () => {
  it("snapshot vira a base da lista", () => {
    const local = [makeRun({ id: "a" })]
    const snapshot = [makeRun({ id: "b" }), makeRun({ id: "c" })]
    const result = mergeSnapshot(local, snapshot)
    expect(result.map((r) => r.id)).toEqual(["b", "c"])
  })

  it("run local mais novo que o snapshot não regride (SSE venceu o SELECT)", () => {
    const localNewer = makeRun({
      id: "a",
      status: "success",
      updated_at: "2026-07-08T12:02:00.000Z",
    })
    const snapshotStale = makeRun({
      id: "a",
      status: "running",
      updated_at: "2026-07-08T12:01:00.000Z",
    })
    const result = mergeSnapshot([localNewer], [snapshotStale])
    expect(result[0].status).toBe("success")
  })
})
