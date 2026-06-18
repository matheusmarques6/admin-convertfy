import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Cobre o coração da fila:
 * - enqueue resolve os emails-alvo e insere o job pending (não roda LLM)
 * - enqueue é idempotente: job ativo pra loja → already_queued (não paga 2×)
 * - enqueue pula LLM de emails cuja reference já existe (architect:'done')
 * - Architect não configurado → job nasce todo settled ('failed' → global)
 * - process roda o Architect e, quando todos settled, dispara pro n8n UMA vez
 *   propagando o trigger_source do job
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
const isArchitectConfigured = vi.fn()
vi.mock("@/lib/agents/architect/generate.service", () => ({
  generateBlueprintAndReference: (...a: unknown[]) => generateBlueprintAndReference(...a),
  isArchitectConfigured: (...a: unknown[]) => isArchitectConfigured(...a),
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
  isArchitectConfigured.mockReset().mockResolvedValue(true)
  dispatchEmailCopyWebhook.mockReset().mockResolvedValue({ ok: true, flow_count: 1, email_count: 2 })
  // por padrão, "gerar" persiste a reference (Montador genuíno → source 'llm')
  generateBlueprintAndReference.mockImplementation(async (input: { storeId: string; flowType: string; emailNumber: number }) => {
    if (h.refControl.persistOnRun) {
      h.tables.store_email_references.push({
        store_id: input.storeId, flow_type: input.flowType, email_number: input.emailNumber,
      })
      return { referenceSource: "llm" }
    }
    // sem persistir e sem global curado → 'none' (conta tentativa → failed)
    return { referenceSource: "none" }
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

  it("job ativo pra loja → already_queued, sem inserir segundo job", async () => {
    const first = await enqueueDispatchJob("store1", { flowIds: ["flow1"], onlyDrafts: true })
    expect(first.ok).toBe(true)
    const second = await enqueueDispatchJob("store1", { flowIds: ["flow1"], onlyDrafts: true })
    expect(second.ok).toBe(true)
    expect(second.reason).toBe("already_queued")
    expect(second.job_id).toBe(first.job_id)
    expect(h.tables.email_dispatch_jobs.length).toBe(1)
  })

  it("reference já existente entra architect:'done' (não re-paga LLM)", async () => {
    h.tables.store_email_references.push({
      store_id: "store1", flow_type: "welcome", email_number: 1,
    })
    const res = await enqueueDispatchJob("store1", { flowIds: ["flow1"], onlyDrafts: true })
    expect(res.ok).toBe(true)
    const job = h.tables.email_dispatch_jobs[0]
    const emails = job.emails as Array<{ email_number: number; architect: string }>
    expect(emails.find((e) => e.email_number === 1)?.architect).toBe("done")
    expect(emails.find((e) => e.email_number === 2)?.architect).toBe("pending")
    expect(job.architect_done).toBe(1)
  })

  it("Architect não configurado → job nasce todo settled ('failed')", async () => {
    isArchitectConfigured.mockResolvedValue(false)
    const res = await enqueueDispatchJob("store1", { flowIds: ["flow1"], onlyDrafts: true })
    expect(res.ok).toBe(true)
    const job = h.tables.email_dispatch_jobs[0]
    expect((job.emails as Array<{ architect: string }>).every((e) => e.architect === "failed")).toBe(true)
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

  it("Architect cai no global (referenceSource='global') → 'done' sem re-tentar", async () => {
    generateBlueprintAndReference.mockReset().mockResolvedValue({ referenceSource: "global" })
    await enqueueDispatchJob("store1", { flowIds: ["flow1"], onlyDrafts: true })
    const res = await processDispatchJobs()
    expect(res.done).toBe(true)
    expect(res.dispatched).toBe(true)
    // global = settled na 1ª tentativa, sem retry → 1 chamada por email (2 emails)
    expect(generateBlueprintAndReference).toHaveBeenCalledTimes(2)
    const job = h.tables.email_dispatch_jobs[0]
    expect((job.emails as Array<{ architect: string }>).every((e) => e.architect === "done")).toBe(true)
  })

  it("email com reference pré-existente ('done') não roda LLM; só o pendente roda", async () => {
    h.tables.store_email_references.push({
      store_id: "store1", flow_type: "welcome", email_number: 1,
    })
    await enqueueDispatchJob("store1", { flowIds: ["flow1"], onlyDrafts: true })
    const res = await processDispatchJobs()
    expect(res.done).toBe(true)
    expect(res.dispatched).toBe(true)
    expect(generateBlueprintAndReference).toHaveBeenCalledTimes(1)
    expect(generateBlueprintAndReference).toHaveBeenCalledWith(
      expect.objectContaining({ flowType: "welcome", emailNumber: 2 }),
    )
  })

  it("Architect não configurado → despacha direto sem rodar LLM", async () => {
    isArchitectConfigured.mockResolvedValue(false)
    await enqueueDispatchJob("store1", { flowIds: ["flow1"], onlyDrafts: true })
    const res = await processDispatchJobs()
    expect(res.done).toBe(true)
    expect(res.dispatched).toBe(true)
    expect(res.architectRan).toBe(0)
    expect(generateBlueprintAndReference).not.toHaveBeenCalled()
    expect(dispatchEmailCopyWebhook).toHaveBeenCalledTimes(1)
    expect(h.tables.email_dispatch_jobs[0].status).toBe("done")
  })

  it("propaga o trigger_source do job pro dispatch", async () => {
    await enqueueDispatchJob("store1", {
      flowIds: ["flow1"],
      onlyDrafts: true,
      triggerSource: "pesquisa_completa",
    })
    await processDispatchJobs()
    expect(dispatchEmailCopyWebhook).toHaveBeenCalledTimes(1)
    expect(dispatchEmailCopyWebhook).toHaveBeenCalledWith(
      "store1",
      expect.objectContaining({ triggerSource: "pesquisa_completa" }),
    )
  })

  it("sem job claimável retorna claimed=false", async () => {
    const res = await processDispatchJobs()
    expect(res.claimed).toBe(false)
    expect(dispatchEmailCopyWebhook).not.toHaveBeenCalled()
  })

  it("recovery: dispatch devolve no_draft_emails (batch já saiu) → job 'done', não 'failed'", async () => {
    // Simula re-claim de job cujo dispatch anterior JÁ saiu (emails fora de
    // draft): o re-dispatch volta no_draft_emails — não é falha real.
    dispatchEmailCopyWebhook.mockResolvedValue({
      ok: false,
      flow_count: 0,
      email_count: 0,
      reason: "no_draft_emails",
    })
    await enqueueDispatchJob("store1", { flowIds: ["flow1"], onlyDrafts: true })
    const res = await processDispatchJobs()
    expect(res.done).toBe(true)
    const job = h.tables.email_dispatch_jobs[0]
    expect(job.status).toBe("done")
    expect(String(job.error)).toContain("no_draft_emails")
  })
})
