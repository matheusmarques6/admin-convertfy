import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Cobre o caminho que travava o botão "Gerar copies (n8n)":
 * - flows sem NENHUM email → auto-seed dos defaults + dispatch segue
 * - emails existem mas nenhum em draft → reason distinto (no_draft_emails)
 * - onlyDrafts=false com emails fora de draft → dispatch normal
 */

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {}

  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    let limitN: number | null = null
    let op: "select" | "insert" | "update" = "select"
    let insertRows: Row[] = []
    let updatePatch: Row = {}

    const exec = () => {
      const rows = tables[table] ?? (tables[table] = [])
      if (op === "insert") {
        for (const r of insertRows) {
          rows.push({ id: `${table}-${rows.length + 1}`, ...r })
        }
        return { data: insertRows, error: null }
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

    const api = {
      select: () => api,
      eq: (c: string, v: unknown) => {
        filters.push((r) => r[c] === v)
        return api
      },
      in: (c: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[c]))
        return api
      },
      order: () => api,
      limit: (n: number) => {
        limitN = n
        return api
      },
      maybeSingle: () => {
        const res = exec()
        return Promise.resolve({ data: res.data[0] ?? null, error: null })
      },
      insert: (rows: Row | Row[]) => {
        op = "insert"
        insertRows = Array.isArray(rows) ? rows : [rows]
        return api
      },
      update: (patch: Row) => {
        op = "update"
        updatePatch = patch
        return api
      },
      then: (
        onFulfilled?: (v: { data: Row[]; error: null }) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => Promise.resolve(exec()).then(onFulfilled, onRejected),
    }
    return api
  }

  return {
    tables,
    makeClient: () => ({ from: (table: string) => builder(table) }),
  }
})

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => h.makeClient(),
  createClient: () => ({}),
}))

vi.mock("@/lib/agents/seed-blocks", () => ({
  ensureBlocksSeeded: vi.fn().mockResolvedValue(undefined),
  reconcileBlocksAdditive: vi.fn().mockResolvedValue(undefined),
}))

const loadEffectiveBlueprintsBatch = vi.fn()
const loadTextOnlyBlueprints = vi.fn()
vi.mock("@/lib/agents/architect/blueprint-loader", () => ({
  loadEffectiveBlueprintsBatch: (...a: unknown[]) => loadEffectiveBlueprintsBatch(...a),
  loadTextOnlyBlueprints: (...a: unknown[]) => loadTextOnlyBlueprints(...a),
}))

import { dispatchEmailCopyWebhook } from "./email-copy-webhook.service"
import { reconcileBlocksAdditive } from "@/lib/agents/seed-blocks"

const fetchMock = vi.fn()

function resetTables(emailRows: Row[]) {
  for (const k of Object.keys(h.tables)) delete h.tables[k]
  h.tables.client_stores = [
    {
      id: "store1",
      store_name: "Loja Teste",
      store_url: "https://loja.test",
      platform: "shopify",
      language: "pt-BR",
      niche: "moda",
    },
  ]
  h.tables.email_flows = [
    { id: "flow1", store_id: "store1", flow_type: "welcome", name: "Welcome Flow", position: 1 },
  ]
  h.tables.email_flow_emails = emailRows
  h.tables.email_blocks = []
  h.tables.email_reference_templates = []
  h.tables.email_generation_runs = []
}

beforeEach(() => {
  vi.stubEnv("N8N_EMAIL_COPY_WEBHOOK_URL", "https://n8n.test/webhook")
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, text: async () => "" })
  vi.stubGlobal("fetch", fetchMock)
  loadEffectiveBlueprintsBatch.mockReset().mockResolvedValue(new Map())
  loadTextOnlyBlueprints.mockReset().mockResolvedValue(new Map())
  vi.mocked(reconcileBlocksAdditive).mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("dispatchEmailCopyWebhook — auto-seed e reasons", () => {
  it("flows sem NENHUM email: auto-seed dos defaults e dispatch segue (caso que travava com no_emails)", async () => {
    resetTables([])

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    expect(res.ok).toBe(true)
    expect(res.email_count).toBe(8) // welcome tem 8 emails default
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Os emails foram criados e, após dispatch ok, marcados in_progress
    const emails = h.tables.email_flow_emails
    expect(emails).toHaveLength(8)
    expect(emails.every((e) => e.status === "in_progress")).toBe(true)
  })

  it("emails existem mas nenhum em draft + onlyDrafts: reason no_draft_emails (não no_emails) e nada é semeado", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "in_progress" },
    ])

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    expect(res.ok).toBe(false)
    expect(res.reason).toBe("no_draft_emails")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(h.tables.email_flow_emails).toHaveLength(1)
  })

  it("onlyDrafts=false com emails fora de draft: dispatch normal (regerar)", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "in_progress" },
    ])

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: false,
    })

    expect(res.ok).toBe(true)
    expect(res.email_count).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("regerar email já gerado (copy_ready) reseta status p/ in_progress — senão o callback do n8n descarta a copy nova como duplicada", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "copy_ready" },
    ])

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: false,
    })

    expect(res.ok).toBe(true)
    expect(res.email_count).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Pós-dispatch o status precisa sair de copy_ready (IDEMPOTENT_STATUSES no
    // callback) p/ que a copy nova do n8n seja persistida e não vire no-op.
    const e1 = h.tables.email_flow_emails.find((e) => e.id === "e1")
    expect(e1?.status).toBe("in_progress")
  })

  it("regerar email finalizado/publicado (live) NÃO é rebaixado de status", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "live" },
    ])

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: false,
    })

    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const e1 = h.tables.email_flow_emails.find((e) => e.id === "e1")
    expect(e1?.status).toBe("live")
  })
})

describe("dispatchEmailCopyWebhook — emails somente texto (text_only)", () => {
  function payloadFromFetch(): {
    flows: Array<{
      emails: Array<{
        email_number: number
        text_only: boolean
        estrutura_geral: {
          objective: string | null
          guidance: string | null
          suggested_blocks: string[]
          tone_hint: string | null
        } | null
        blueprint: { objective: string | null } | null
      }>
    }>
  } {
    return JSON.parse(fetchMock.mock.calls[0][1].body as string)
  }

  it("payload leva text_only:true + estrutura_geral + blueprint GLOBAL (mesmo com override da loja)", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_outline_templates = [
      {
        flow_type: "welcome",
        email_number: 1,
        objective: "OUT-OBJ",
        guidance: "OUT-GUIDE",
        suggested_blocks: ["header", "text", "footer"],
        tone_hint: "caloroso",
        is_active: true,
      },
    ]
    // Cascata efetiva devolve o override da LOJA (legado do Architect)…
    loadEffectiveBlueprintsBatch.mockResolvedValue(
      new Map([
        [
          "welcome__1",
          {
            flow_type: "welcome",
            email_number: 1,
            objective: "OBJ-DA-LOJA",
            messaging: "MSG-DA-LOJA",
            subject_hint: null,
          },
        ],
      ]),
    )
    // …mas o email é text_only e o payload deve usar o GLOBAL.
    loadTextOnlyBlueprints.mockResolvedValue(
      new Map([
        [
          "welcome:1",
          {
            flow_type: "welcome",
            email_number: 1,
            objective: "OBJ-GLOBAL",
            messaging: "MSG-GLOBAL",
            subject_hint: "HINT-GLOBAL",
            text_only: true,
          },
        ],
      ]),
    )

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    expect(res.ok).toBe(true)
    const email = payloadFromFetch().flows[0].emails[0]
    expect(email.text_only).toBe(true)
    expect(email.estrutura_geral).toEqual({
      objective: "OUT-OBJ",
      guidance: "OUT-GUIDE",
      suggested_blocks: ["header", "text", "footer"],
      tone_hint: "caloroso",
    })
    expect(email.blueprint?.objective).toBe("OBJ-GLOBAL")
  })

  it("seed/reconcile de email text_only roda SEM storeId (pula camada da loja)", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
      { id: "e2", flow_id: "flow1", number: 2, name: "Welcome 2", status: "draft" },
    ])
    loadTextOnlyBlueprints.mockResolvedValue(
      new Map([
        [
          "welcome:1",
          { flow_type: "welcome", email_number: 1, objective: "O", messaging: "M", subject_hint: null },
        ],
      ]),
    )

    await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    const calls = vi.mocked(reconcileBlocksAdditive).mock.calls
    expect(calls).toContainEqual(["e1", "welcome", 1, undefined])
    expect(calls).toContainEqual(["e2", "welcome", 2, "store1"])
  })

  it("email normal segue com text_only:false e estrutura_geral null", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_outline_templates = [
      {
        flow_type: "welcome",
        email_number: 1,
        objective: "OUT-OBJ",
        guidance: null,
        suggested_blocks: [],
        tone_hint: null,
        is_active: true,
      },
    ]

    await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    const email = payloadFromFetch().flows[0].emails[0]
    expect(email.text_only).toBe(false)
    expect(email.estrutura_geral).toBeNull()
  })
})

describe("dispatchEmailCopyWebhook — purpose/copy_spec casam por position (off-by-one)", () => {
  it("bloco na position P recebe purpose/copy_spec de blueprint.blocks[P-1]", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    // email_blocks semeados 1-BASED (seed-blocks: idx+1), mesma ordem do blueprint.
    h.tables.email_blocks = [
      { id: "b1", email_id: "e1", position: 1, block_type: "header", label: "Header", content: {} },
      { id: "b2", email_id: "e1", position: 2, block_type: "hero", label: "Hero", content: {} },
      { id: "b3", email_id: "e1", position: 3, block_type: "coupon", label: "Cupom", content: {} },
    ]
    loadEffectiveBlueprintsBatch.mockResolvedValue(
      new Map([
        [
          "welcome__1",
          {
            flow_type: "welcome",
            email_number: 1,
            objective: "OBJ",
            messaging: "MSG",
            subject_hint: null,
            blocks: [
              { type: "header", label: "Header", purpose: "PURPOSE-HEADER", copy_spec: [] },
              {
                type: "hero",
                label: "Hero",
                purpose: "PURPOSE-HERO",
                copy_spec: [{ key: "eyebrow", min_chars: 8, max_chars: 24 }],
              },
              {
                type: "coupon",
                label: "Cupom",
                purpose: "PURPOSE-COUPON",
                copy_spec: [{ key: "code", min_chars: 4, max_chars: 15 }],
              },
            ],
          },
        ],
      ]),
    )

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })
    expect(res.ok).toBe(true)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      flows: Array<{
        emails: Array<{
          blocks: Array<{
            position: number
            type: string
            purpose: string | null
            copy_spec: Array<{ key: string; min_chars: number; max_chars: number }>
          }>
        }>
      }>
    }
    const blocks = body.flows[0].emails[0].blocks
    expect(blocks.map((b) => b.type)).toEqual(["header", "hero", "coupon"])

    // ANTES do fix: blocks[position] deslocava 1 → type nunca casava →
    // purpose null e copy_spec default em TODOS (provado na Luxe Lift w#3).
    expect(blocks[0].purpose).toBe("PURPOSE-HEADER")
    expect(blocks[1].purpose).toBe("PURPOSE-HERO")
    expect(blocks[2].purpose).toBe("PURPOSE-COUPON")
    expect(blocks[1].copy_spec).toEqual([{ key: "eyebrow", min_chars: 8, max_chars: 24 }])
    expect(blocks[2].copy_spec).toEqual([{ key: "code", min_chars: 4, max_chars: 15 }])
  })

  it("rows legadas 0-based ainda casam (fallback pro próprio índice)", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_blocks = [
      { id: "b1", email_id: "e1", position: 0, block_type: "hero", label: "Hero", content: {} },
      { id: "b2", email_id: "e1", position: 1, block_type: "coupon", label: "Cupom", content: {} },
    ]
    loadEffectiveBlueprintsBatch.mockResolvedValue(
      new Map([
        [
          "welcome__1",
          {
            flow_type: "welcome",
            email_number: 1,
            objective: "OBJ",
            messaging: "MSG",
            subject_hint: null,
            blocks: [
              { type: "hero", label: "Hero", purpose: "P-HERO", copy_spec: [] },
              { type: "coupon", label: "Cupom", purpose: "P-COUPON", copy_spec: [] },
            ],
          },
        ],
      ]),
    )

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })
    expect(res.ok).toBe(true)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      flows: Array<{ emails: Array<{ blocks: Array<{ purpose: string | null }> }> }>
    }
    const blocks = body.flows[0].emails[0].blocks
    expect(blocks[0].purpose).toBe("P-HERO")
    expect(blocks[1].purpose).toBe("P-COUPON")
  })
})

describe("dispatchEmailCopyWebhook — regenerateAll", () => {
  const mixedBlocks = () => [
    { id: "b1", email_id: "e1", position: 1, block_type: "hero", label: "Hero",
      content: { headline: "copy antiga" } },
    { id: "b2", email_id: "e1", position: 2, block_type: "coupon", label: "Cupom",
      content: {} },
    { id: "b3", email_id: "e1", position: 3, block_type: "footer", label: "Rodapé",
      content: { text: "copy antiga" } },
  ]

  function sentBlocks(): Array<{ position: number; type: string }> {
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      flows: Array<{ emails: Array<{ blocks: Array<{ position: number; type: string }> }> }>
    }
    return body.flows[0].emails[0].blocks
  }

  it("sem o flag: email misto envia só os blocos VAZIOS (mixed mode)", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_blocks = mixedBlocks()

    await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })
    expect(sentBlocks().map((b) => b.position)).toEqual([2])
  })

  it("com regenerateAll: envia TODOS os blocos mesmo em email misto", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_blocks = mixedBlocks()

    await dispatchEmailCopyWebhook("store1", {
      triggerSource: "test_full_pipeline",
      flowIds: ["flow1"],
      onlyDrafts: true,
      regenerateAll: true,
    })
    expect(sentBlocks().map((b) => b.position)).toEqual([1, 2, 3])
  })
})
