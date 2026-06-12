import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Cobre o coração da fila:
 * - enqueue resolve os emails-alvo e insere o job pending (não roda LLM)
 * - process roda o Architect e, quando todos settled, dispara pro n8n UMA vez
 * - email cujo Architect falha repetidamente vira 'failed' (cai no global),
 *   sem bloquear o dispatch
 */

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {}
  // controla se o Architect "persistiu" a reference (store_email_references)
  const refControl = { persistOnRun: true }

  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    let op: "select" | "insert" | "update" = "select"
    let insertRows: Row[] = []
    let updatePatch: Row = {}
    let limitN: number | null = null

    const exec = () => {
      const rows = tables[table] ?? (tables[table] = [])
      if (op === "insert") {
        const created = insertRows.map((r, i) => ({ id: `${table}-${rows.length + i + 1}`, ...r }))
        rows.push(...created)
        return { data: created, error: null }
      }
      if (op === "update") {
        const matched = rows.filter((r) => filters.every((f) => f(r)))
        for (const r of matched) Object.assign(r, updatePatch)
        return { data: matched, error: null }
      }
      let out = rows.filter((r) => filters.every((f) => f(r)))
      if (limitN != null) out = out.slice(0, limitN)
      return { data: out, error: null }
    }

    const api: Record<string, unknown> = {
      select: () => api,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return api },
      or: () => api,
      order: () => api,
      limit: (n: number) => { limitN = n; return api },
      maybeSingle: () => Promise.resolve({ data: exec().data[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: exec().data[0] ?? null, error: null }),
      insert: (r: Row | Row[]) => { op = "insert"; insertRows = Array.isArray(r) ? r : [r]; return api },
      update: (p: Row) => { op = "update"; updatePatch = p; return api },
      then: (onF?: (v: { data: Row[]; error: null }) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(exec()).then(onF, onR),
    }
    return api
  }

  return { tables, refControl, makeClient: () => ({ from: (t: string) => builder(t) }) }
})

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => h.makeClient(),
  createClient: () => ({}),
}))

vi.mock("@/lib/services/flow-seed.service", () => ({
  seedDefaultFlows: vi.fn().mockResolvedValue({ flows_created: 0, emails_created: 0, skipped: 7 }),
}))

const generateBlueprintAndReference = vi.fn()
vi.mock("@/lib/agents/architect/generate.service", () => ({
  generateBlueprintAndReference: (...a: unknown[]) => generateBlueprintAndReference(...a),
}))

const dispatchEmailCopyWebhook = vi.fn()
vi.mock("@/lib/services/email-copy-webhook.service", () => ({
  dispatchEmailCopyWebhook: (...a: unknown[]) => dispatchEmailCopyWebhook(...a),
}))

import { enqueueDispatchJob, processDispatchJobs } from "./email-dispatch-queue.service"

function reset() {
  for (const k of Object.keys(h.tables)) delete h.tables[k]
  h.tables.email_flows = [{ id: "flow1", store_id: "store1", flow_type: "welcome" }]
  h.tables.email_flow_emails = [
    { id: "e1", flow_id: "flow1", number: 1, status: "draft" },
    { id: "e2", flow_id: "flow1", number: 2, status: "draft" },
  ]
  h.tables.store_email_references = []
  h.tables.email_dispatch_jobs = []
  h.refControl.persistOnRun = true
}

beforeEach(() => {
  reset()
  generateBlueprintAndReference.mockReset()
  dispatchEmailCopyWebhook.mockReset().mockResolvedValue({ ok: true, flow_count: 1, email_count: 2 })
  // por padrão, "gerar" persiste a reference (Montador genuíno)
  generateBlueprintAndReference.mockImplementation(async (input: { storeId: string; flowType: string; emailNumber: number }) => {
    if (h.refControl.persistOnRun) {
      h.tables.store_email_references.push({
        store_id: input.storeId, flow_type: input.flowType, email_number: input.emailNumber,
      })
    }
  })
})

describe("enqueueDispatchJob", () => {
  it("resolve os emails-alvo e insere o job pending sem rodar LLM", async () => {
    const res = await enqueueDispatchJob("store1", { flowIds: ["flow1"], onlyDrafts: true })
    expect(res.ok).toBe(true)
    expect(res.email_count).toBe(2)
    expect(generateBlueprintAndReference).not.toHaveBeenCalled()
    const job = h.tables.email_dispatch_jobs[0]
    expect(job.status).toBe("pending")
    expect((job.emails as unknown[]).length).toBe(2)
    expect(job.architect_total).toBe(2)
  })

  it("sem draft + onlyDrafts retorna no_draft_emails", async () => {
    h.tables.email_flow_emails.forEach((e) => (e.status = "in_progress"))
    const res = await enqueueDispatchJob("store1", { flowIds: ["flow1"], onlyDrafts: true })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe("no_draft_emails")
  })
})

describe("processDispatchJobs", () => {
  it("roda o Architect de todos e dispara pro n8n UMA vez quando settled", async () => {
    await enqueueDispatchJob("store1", { flowIds: ["flow1"], onlyDrafts: true })
    const res = await processDispatchJobs()
    expect(res.claimed).toBe(true)
    expect(res.done).toBe(true)
    expect(res.dispatched).toBe(true)
    expect(generateBlueprintAndReference).toHaveBeenCalledTimes(2)
    expect(dispatchEmailCopyWebhook).toHaveBeenCalledTimes(1)
    const job = h.tables.email_dispatch_jobs[0]
    expect(job.status).toBe("done")
    expect((job.emails as Array<{ architect: string }>).every((e) => e.architect === "done")).toBe(true)
  })

  it("email cujo Architect nunca persiste vira 'failed' mas o dispatch ainda acontece", async () => {
    h.refControl.persistOnRun = false // nenhuma reference persiste → fallback
    await enqueueDispatchJob("store1", { flowIds: ["flow1"], onlyDrafts: true })
    const res = await processDispatchJobs()
    expect(res.done).toBe(true)
    expect(res.dispatched).toBe(true) // dispatch acontece mesmo com tudo no fallback
    const job = h.tables.email_dispatch_jobs[0]
    expect((job.emails as Array<{ architect: string }>).every((e) => e.architect === "failed")).toBe(true)
    // 2 emails × 2 tentativas (MAX_ARCHITECT_ATTEMPTS default)
    expect(generateBlueprintAndReference).toHaveBeenCalledTimes(4)
  })

  it("sem job claimável retorna claimed=false", async () => {
    const res = await processDispatchJobs()
    expect(res.claimed).toBe(false)
    expect(dispatchEmailCopyWebhook).not.toHaveBeenCalled()
  })
})
