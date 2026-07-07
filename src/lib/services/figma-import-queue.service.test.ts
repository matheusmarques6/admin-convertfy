import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Cobre o coração da fila de imports do Figma:
 * - enqueue insere o job pending sem tocar a API do Figma
 * - enqueue é idempotente: job ativo por (suggestion, kind) → already_queued
 * - cut_model: processa e marca done com o result do serviço
 * - erro permanente (4xx ≠ 429) → failed direto, sem retry
 * - erro retryável (429) → attempts++/pending; esgota → failed
 * - store_emails: progresso parcial via onStoreResult (heartbeat) e retomada
 *   por remaining (deadline do tick não perde trabalho nem re-paga export)
 * - órfão com tudo settlado → done sem re-rodar o import
 */

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {}

  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    let op: "select" | "insert" | "update" = "select"
    let insertRows: Row[] = []
    let updatePatch: Row = {}
    let limitN: number | null = null

    const exec = () => {
      const rows = tables[table] ?? (tables[table] = [])
      if (op === "insert") {
        // Espelha os DEFAULTs da migration (attempts/progress/result).
        const created = insertRows.map((r, i) => ({
          id: `${table}-${rows.length + i + 1}`,
          attempts: 0,
          progress_total: 0,
          progress_done: 0,
          result: null,
          error: null,
          ...r,
        }))
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

  return { tables, makeClient: () => ({ from: (t: string) => builder(t) }) }
})

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => h.makeClient(),
  createClient: () => ({}),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

const getCampaignHandoff = vi.fn()
vi.mock("@/lib/services/campaign-central/campaign-handoff.service", () => ({
  getCampaignHandoff: (...a: unknown[]) => getCampaignHandoff(...a),
}))

const importStoreEmailsFromFigma = vi.fn()
vi.mock("@/lib/services/campaign-central/campaign-figma-import.service", () => ({
  importStoreEmailsFromFigma: (...a: unknown[]) => importStoreEmailsFromFigma(...a),
}))

const importCutModelImageFromFigma = vi.fn()
vi.mock("@/lib/services/campaign-central/campaign-cut-model-import.service", () => ({
  importCutModelImageFromFigma: (...a: unknown[]) => importCutModelImageFromFigma(...a),
}))

import {
  enqueueFigmaImportJob,
  getFigmaImportJob,
  processFigmaImportJobs,
} from "./figma-import-queue.service"
import { FigmaError } from "@/lib/integrations/figma/client"
import { AppError } from "@/lib/api/errors"
import type { FigmaImportStoreResult } from "@/types/campaign-store-emails"

const CUT_RESULT = {
  url: "https://signed.example/modelo.png",
  path: "campaigns/sug-1/cut-map/x.png",
  filename: "modelo.png",
  image_natural_w: 1200,
  image_natural_h: 4800,
}

function storeResult(id: string, status = "imported"): FigmaImportStoreResult {
  return {
    store_id: id,
    store_name: `Loja ${id}`,
    status: status as FigmaImportStoreResult["status"],
  }
}

beforeEach(() => {
  for (const k of Object.keys(h.tables)) delete h.tables[k]
  h.tables.figma_import_jobs = []
  getCampaignHandoff.mockReset().mockResolvedValue({
    suggestion_id: "sug-1",
    figma_link: "https://www.figma.com/design/AbCdEf123456/C",
    stores: [
      { store_id: "s1", store_name: "Loja s1" },
      { store_id: "s2", store_name: "Loja s2" },
    ],
  })
  importStoreEmailsFromFigma.mockReset()
  importCutModelImageFromFigma.mockReset().mockResolvedValue(CUT_RESULT)
})

describe("enqueueFigmaImportJob", () => {
  it("insere job pending store_emails sem tocar o Figma", async () => {
    const res = await enqueueFigmaImportJob({
      kind: "store_emails",
      suggestionId: "sug-1",
      orgId: "org-1",
      userId: "user-1",
      storeIds: ["s2"],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.alreadyQueued).toBe(false)
    expect(importStoreEmailsFromFigma).not.toHaveBeenCalled()
    const job = h.tables.figma_import_jobs[0]
    expect(job.status).toBe("pending")
    expect(job.kind).toBe("store_emails")
    expect(job.payload).toEqual({ store_ids: ["s2"] })
  })

  it("job ativo por (suggestion, kind) → already_queued com o mesmo id", async () => {
    const first = await enqueueFigmaImportJob({
      kind: "store_emails",
      suggestionId: "sug-1",
      orgId: "org-1",
      userId: "user-1",
    })
    const second = await enqueueFigmaImportJob({
      kind: "store_emails",
      suggestionId: "sug-1",
      orgId: "org-1",
      userId: "user-1",
      storeIds: ["s1"],
    })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.alreadyQueued).toBe(true)
    expect(second.jobId).toBe(first.jobId)
    expect(h.tables.figma_import_jobs).toHaveLength(1)
  })

  it("kinds diferentes na mesma suggestion coexistem", async () => {
    await enqueueFigmaImportJob({
      kind: "store_emails",
      suggestionId: "sug-1",
      orgId: "org-1",
      userId: "user-1",
    })
    const cut = await enqueueFigmaImportJob({
      kind: "cut_model",
      suggestionId: "sug-1",
      userId: "user-1",
      figmaUrl: "https://www.figma.com/design/AbCdEf123456/C?node-id=1-2",
    })
    expect(cut.ok).toBe(true)
    if (!cut.ok) return
    expect(cut.alreadyQueued).toBe(false)
    expect(h.tables.figma_import_jobs).toHaveLength(2)
    const job = h.tables.figma_import_jobs[1]
    expect(job.kind).toBe("cut_model")
    expect(job.progress_total).toBe(1)
    expect(job.payload).toEqual({
      figma_url: "https://www.figma.com/design/AbCdEf123456/C?node-id=1-2",
    })
  })
})

describe("processFigmaImportJobs — cut_model", () => {
  async function enqueueCut() {
    const res = await enqueueFigmaImportJob({
      kind: "cut_model",
      suggestionId: "sug-1",
      userId: "user-1",
      figmaUrl: "https://www.figma.com/design/AbCdEf123456/C?node-id=1-2",
    })
    if (!res.ok) throw new Error("enqueue falhou")
    return res.jobId
  }

  it("processa e marca done com o result do serviço", async () => {
    await enqueueCut()
    const summary = await processFigmaImportJobs()
    expect(summary.claimed).toBe(1)
    expect(summary.jobs[0].status).toBe("done")
    const job = h.tables.figma_import_jobs[0]
    expect(job.status).toBe("done")
    expect(job.result).toEqual(CUT_RESULT)
    expect(job.progress_done).toBe(1)
    expect(importCutModelImageFromFigma).toHaveBeenCalledWith(
      "sug-1",
      "https://www.figma.com/design/AbCdEf123456/C?node-id=1-2",
    )
  })

  it("erro permanente (422) → failed direto, sem retry", async () => {
    importCutModelImageFromFigma.mockRejectedValue(
      new AppError("O arquivo tem 5 frames — copie o link do frame", 422),
    )
    await enqueueCut()
    const summary = await processFigmaImportJobs()
    expect(summary.jobs[0].status).toBe("failed")
    const job = h.tables.figma_import_jobs[0]
    expect(job.status).toBe("failed")
    expect(String(job.error)).toContain("5 frames")
    expect(job.attempts).toBe(0)
    expect(importCutModelImageFromFigma).toHaveBeenCalledTimes(1)
  })

  it("erro retryável (429) → pending com attempts; esgota → failed", async () => {
    importCutModelImageFromFigma.mockRejectedValue(
      new FigmaError("Rate limit do Figma", 429),
    )
    await enqueueCut()

    const first = await processFigmaImportJobs()
    expect(first.jobs[0].status).toBe("pending")
    expect(h.tables.figma_import_jobs[0].attempts).toBe(1)

    const second = await processFigmaImportJobs()
    expect(second.jobs[0].status).toBe("failed")
    expect(h.tables.figma_import_jobs[0].attempts).toBe(2)
  })
})

describe("processFigmaImportJobs — store_emails", () => {
  async function enqueueStores(storeIds?: string[]) {
    const res = await enqueueFigmaImportJob({
      kind: "store_emails",
      suggestionId: "sug-1",
      orgId: "org-1",
      userId: "user-1",
      storeIds,
    })
    if (!res.ok) throw new Error("enqueue falhou")
    return res.jobId
  }

  it("roda o import, persiste progresso via onStoreResult e marca done", async () => {
    importStoreEmailsFromFigma.mockImplementation(
      async (
        _sug: string,
        _org: string,
        _user: string,
        opts: {
          storeIds?: string[]
          onStoreResult?: (r: FigmaImportStoreResult) => Promise<void>
        },
      ) => {
        // Heartbeat: depois da 1ª loja, o result parcial já está persistido.
        await opts.onStoreResult?.(storeResult("s1"))
        const partial = h.tables.figma_import_jobs[0].result as {
          results: FigmaImportStoreResult[]
        }
        expect(partial.results).toHaveLength(1)
        expect(h.tables.figma_import_jobs[0].progress_done).toBe(1)

        await opts.onStoreResult?.(storeResult("s2", "no_frame"))
        return {
          file_key: "AbCdEf123456",
          frames_found: 2,
          frame_names: ["Loja s1", "Rascunho"],
          results: [storeResult("s1"), storeResult("s2", "no_frame")],
        }
      },
    )

    await enqueueStores()
    const summary = await processFigmaImportJobs()
    expect(summary.jobs[0].status).toBe("done")

    const job = h.tables.figma_import_jobs[0]
    expect(job.status).toBe("done")
    expect(job.progress_total).toBe(2)
    expect(job.progress_done).toBe(2)
    const result = job.result as { file_key: string; results: FigmaImportStoreResult[] }
    expect(result.file_key).toBe("AbCdEf123456")
    expect(result.results.map((r) => r.store_id)).toEqual(["s1", "s2"])
    // Todas as lojas do handoff eram remaining na primeira rodada.
    expect(importStoreEmailsFromFigma).toHaveBeenCalledWith(
      "sug-1",
      "org-1",
      "user-1",
      expect.objectContaining({ storeIds: ["s1", "s2"] }),
    )
  })

  it("payload.store_ids restringe os alvos do job", async () => {
    importStoreEmailsFromFigma.mockResolvedValue({
      file_key: "K",
      frames_found: 1,
      frame_names: [],
      results: [storeResult("s2")],
    })
    await enqueueStores(["s2"])
    await processFigmaImportJobs()
    expect(importStoreEmailsFromFigma).toHaveBeenCalledWith(
      "sug-1",
      "org-1",
      "user-1",
      expect.objectContaining({ storeIds: ["s2"] }),
    )
    expect(h.tables.figma_import_jobs[0].progress_total).toBe(1)
  })

  it("deadline no tick: job volta pending e a retomada roda só o remaining", async () => {
    // 1º tick: só s1 settla (deadline). O serviço devolve resultado parcial.
    importStoreEmailsFromFigma.mockImplementationOnce(
      async (
        _sug: string,
        _org: string,
        _user: string,
        opts: { onStoreResult?: (r: FigmaImportStoreResult) => Promise<void> },
      ) => {
        await opts.onStoreResult?.(storeResult("s1"))
        return {
          file_key: "K",
          frames_found: 2,
          frame_names: ["Loja s1", "Loja s2"],
          results: [storeResult("s1")],
        }
      },
    )
    await enqueueStores()

    const first = await processFigmaImportJobs()
    expect(first.jobs[0].status).toBe("pending")
    expect(h.tables.figma_import_jobs[0].progress_done).toBe(1)

    // 2º tick: retoma só s2 (s1 nunca re-paga export).
    importStoreEmailsFromFigma.mockImplementationOnce(
      async (
        _sug: string,
        _org: string,
        _user: string,
        opts: {
          storeIds?: string[]
          onStoreResult?: (r: FigmaImportStoreResult) => Promise<void>
        },
      ) => {
        expect(opts.storeIds).toEqual(["s2"])
        await opts.onStoreResult?.(storeResult("s2"))
        return {
          file_key: "K",
          frames_found: 2,
          frame_names: ["Loja s1", "Loja s2"],
          results: [storeResult("s2")],
        }
      },
    )
    const second = await processFigmaImportJobs()
    expect(second.jobs[0].status).toBe("done")
    const result = h.tables.figma_import_jobs[0].result as {
      results: FigmaImportStoreResult[]
    }
    // Merge: as duas rodadas aparecem no resultado final, na ordem dos alvos.
    expect(result.results.map((r) => r.store_id)).toEqual(["s1", "s2"])
  })

  it("órfão com tudo settlado → done sem re-rodar o import", async () => {
    await enqueueStores()
    const job = h.tables.figma_import_jobs[0]
    job.result = {
      file_key: "K",
      frames_found: 2,
      frame_names: [],
      results: [storeResult("s1"), storeResult("s2")],
    }

    const summary = await processFigmaImportJobs()
    expect(summary.jobs[0].status).toBe("done")
    expect(importStoreEmailsFromFigma).not.toHaveBeenCalled()
    expect(job.status).toBe("done")
    expect(job.progress_done).toBe(2)
  })

  it("erro retryável no import (rede) → pending com attempts, result parcial preservado", async () => {
    importStoreEmailsFromFigma.mockImplementationOnce(
      async (
        _sug: string,
        _org: string,
        _user: string,
        opts: { onStoreResult?: (r: FigmaImportStoreResult) => Promise<void> },
      ) => {
        await opts.onStoreResult?.(storeResult("s1"))
        throw new Error("fetch failed")
      },
    )
    await enqueueStores()
    const summary = await processFigmaImportJobs()
    expect(summary.jobs[0].status).toBe("pending")
    const job = h.tables.figma_import_jobs[0]
    expect(job.attempts).toBe(1)
    // O heartbeat da s1 sobreviveu ao throw — a retomada só roda s2.
    const result = job.result as { results: FigmaImportStoreResult[] }
    expect(result.results.map((r) => r.store_id)).toEqual(["s1"])
  })
})

describe("processFigmaImportJobs — fila", () => {
  it("sem job claimável retorna claimed=0", async () => {
    const summary = await processFigmaImportJobs()
    expect(summary.claimed).toBe(0)
    expect(summary.jobs).toHaveLength(0)
  })

  it("processa vários jobs no mesmo tick enquanto há orçamento", async () => {
    importStoreEmailsFromFigma.mockResolvedValue({
      file_key: "K",
      frames_found: 2,
      frame_names: [],
      results: [storeResult("s1"), storeResult("s2")],
    })
    await enqueueFigmaImportJob({
      kind: "store_emails",
      suggestionId: "sug-1",
      orgId: "org-1",
      userId: "user-1",
    })
    await enqueueFigmaImportJob({
      kind: "cut_model",
      suggestionId: "sug-1",
      userId: "user-1",
      figmaUrl: "https://www.figma.com/design/AbCdEf123456/C?node-id=1-2",
    })

    const summary = await processFigmaImportJobs()
    expect(summary.claimed).toBe(2)
    expect(summary.jobs.map((j) => j.status)).toEqual(["done", "done"])
  })
})

describe("getFigmaImportJob", () => {
  it("filtra por suggestion_id (autorização) — job de outra campanha é null", async () => {
    const res = await enqueueFigmaImportJob({
      kind: "cut_model",
      suggestionId: "sug-1",
      userId: "user-1",
      figmaUrl: "https://www.figma.com/design/AbCdEf123456/C?node-id=1-2",
    })
    if (!res.ok) throw new Error("enqueue falhou")

    const found = await getFigmaImportJob(res.jobId, "sug-1")
    expect(found?.id).toBe(res.jobId)
    const other = await getFigmaImportJob(res.jobId, "sug-OUTRA")
    expect(other).toBeNull()
  })
})
