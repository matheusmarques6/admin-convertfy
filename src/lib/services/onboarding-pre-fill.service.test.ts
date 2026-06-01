import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock Supabase admin client ────────────────────────────────────────────
type Row = Record<string, unknown>
interface MockTable {
  rows: Row[]
  updates: { match: Row; patch: Row }[]
}

const tables: Record<string, MockTable> = {}

function resetTables() {
  for (const k of Object.keys(tables)) delete tables[k]
}

function matches(row: Row, filters: Array<[string, unknown]>): boolean {
  return filters.every(([k, v]) => row[k] === v)
}

function buildQuery(tableName: string) {
  const filters: Array<[string, unknown]> = []
  let containsFilter: Row | null = null
  let inFilter: { col: string; values: unknown[] } | null = null
  let updatePatch: Row | null = null

  const exec = () => {
    const table = tables[tableName] ?? { rows: [], updates: [] }
    let rows = table.rows.filter((r) => matches(r, filters))
    if (containsFilter) {
      rows = rows.filter((r) => {
        const meta = (r.metadata ?? {}) as Row
        return Object.entries(containsFilter as Row).every(
          ([k, v]) => meta[k] === v,
        )
      })
    }
    if (inFilter) {
      rows = rows.filter((r) =>
        (inFilter as { col: string; values: unknown[] }).values.includes(
          r[(inFilter as { col: string }).col],
        ),
      )
    }
    if (updatePatch) {
      table.updates.push({
        match: Object.fromEntries(filters),
        patch: updatePatch,
      })
      for (const row of rows) Object.assign(row, updatePatch)
    }
    return rows
  }

  const chain: Record<string, unknown> = {
    select: (_cols?: string) => chain,
    eq: (col: string, val: unknown) => {
      filters.push([col, val])
      return chain
    },
    in: (col: string, values: unknown[]) => {
      inFilter = { col, values }
      return chain
    },
    contains: (_col: string, val: Row) => {
      containsFilter = val
      return chain
    },
    maybeSingle: async () => ({ data: exec()[0] ?? null, error: null }),
    update: (patch: Row) => {
      updatePatch = patch
      return chain
    },
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: exec(), error: null }),
  }
  return chain
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (tableName: string) => buildQuery(tableName),
  }),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

// markPreviewEmailReady é testado isoladamente; aqui só verificamos que o
// pre-fill o chama com (storeId, flowType, emailNumber) corretos quando há
// store_id e o piloto tem file_url.
const markPreviewEmailReady = vi.fn(
  async (_storeId: string, _flowType: string, _emailNumber: number) => {},
)
vi.mock("./email-task-sync.service", () => ({
  markPreviewEmailReady: (
    storeId: string,
    flowType: string,
    emailNumber: number,
  ) => markPreviewEmailReady(storeId, flowType, emailNumber),
}))

import { applyPreFillFromPreview } from "./onboarding-pre-fill.service"

const ONB_ID = "onb-1"
const PREVIEW_ANCHOR_ID = "task-preview-anchor"
const FLOW_WELCOME_TASK_ID = "task-flow-welcome"
const FLOW_CARRINHO_TASK_ID = "task-flow-carrinho"
const FLOW_UPSELL_TASK_ID = "task-flow-upsell"

function seed(opts?: {
  carrinhoSubItem1Completed?: boolean
  carrinhoSubItem1Manual?: boolean
  pilotoWelcomeFilled?: boolean
  storeId?: string
}) {
  resetTables()
  tables.onboardings = {
    rows: [
      {
        id: ONB_ID,
        current_version: 1,
        ...(opts?.storeId ? { store_id: opts.storeId } : {}),
      },
    ],
    updates: [],
  }
  tables.tasks = {
    rows: [
      {
        id: PREVIEW_ANCHOR_ID,
        onboarding_id: ONB_ID,
        version: 1,
        slug: "preview_brand_brain",
        metadata: { column_slug: "preview_producao", is_column_anchor: true },
      },
      {
        id: FLOW_WELCOME_TASK_ID,
        onboarding_id: ONB_ID,
        version: 1,
        slug: "flow_welcome",
        metadata: {
          column_slug: "emails_finais",
          sub_items: [
            {
              slug: "welcome_email_1",
              label: "Email 1",
              from_preview: "piloto_welcome_files",
              completed: false,
            },
            { slug: "welcome_email_2", label: "Email 2", completed: false },
          ],
        },
      },
      {
        id: FLOW_CARRINHO_TASK_ID,
        onboarding_id: ONB_ID,
        version: 1,
        slug: "flow_carrinho_abandonado",
        metadata: {
          column_slug: "emails_finais",
          sub_items: [
            {
              slug: "carrinho_email_1",
              label: "Email 1",
              from_preview: "piloto_carrinho_1_files",
              completed: opts?.carrinhoSubItem1Completed ?? false,
              // Quando "manual", simula que o usuario marcou manualmente
              // (sem preview_deliverable_id).
              ...(opts?.carrinhoSubItem1Manual
                ? { completed_by: "manual-user" }
                : {}),
            },
            {
              slug: "carrinho_email_2",
              label: "Email 2",
              from_preview: "piloto_carrinho_2_files",
              completed: false,
            },
          ],
        },
      },
      {
        id: FLOW_UPSELL_TASK_ID,
        onboarding_id: ONB_ID,
        version: 1,
        slug: "flow_upsell",
        metadata: {
          column_slug: "emails_finais",
          sub_items: [
            {
              slug: "upsell_email_1",
              label: "Email 1",
              from_preview: "piloto_pos_compra_files",
              completed: false,
            },
          ],
        },
      },
    ],
    updates: [],
  }
  tables.task_deliverables = {
    rows: [
      {
        id: "d-welcome",
        task_id: PREVIEW_ANCHOR_ID,
        field_slug: "piloto_welcome_files",
        file_url:
          opts?.pilotoWelcomeFilled === false
            ? null
            : "https://example.com/welcome.pdf",
      },
      {
        id: "d-carrinho-1",
        task_id: PREVIEW_ANCHOR_ID,
        field_slug: "piloto_carrinho_1_files",
        file_url: "https://example.com/carrinho1.pdf",
      },
      {
        id: "d-carrinho-2",
        task_id: PREVIEW_ANCHOR_ID,
        field_slug: "piloto_carrinho_2_files",
        file_url: "https://example.com/carrinho2.pdf",
      },
      {
        id: "d-pos-compra",
        task_id: PREVIEW_ANCHOR_ID,
        field_slug: "piloto_pos_compra_files",
        file_url: "https://example.com/poscompra.pdf",
      },
    ],
    updates: [],
  }
}

describe("applyPreFillFromPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("copia file_url + deliverable_id pros 4 sub_items mapeados", async () => {
    seed()
    await applyPreFillFromPreview(ONB_ID, "actor-1")

    const welcomeTask = tables.tasks.rows.find(
      (t) => t.id === FLOW_WELCOME_TASK_ID,
    )
    const welcomeSub = (welcomeTask?.metadata as { sub_items: Array<{ slug: string; completed?: boolean; preview_file_url?: string | null }> }).sub_items[0]
    expect(welcomeSub.completed).toBe(true)
    expect(welcomeSub.preview_file_url).toBe("https://example.com/welcome.pdf")

    const carrinhoTask = tables.tasks.rows.find(
      (t) => t.id === FLOW_CARRINHO_TASK_ID,
    )
    const carrinhoSubs = (carrinhoTask?.metadata as { sub_items: Array<{ slug: string; completed?: boolean; preview_file_url?: string | null }> }).sub_items
    expect(carrinhoSubs[0].completed).toBe(true)
    expect(carrinhoSubs[0].preview_file_url).toBe(
      "https://example.com/carrinho1.pdf",
    )
    expect(carrinhoSubs[1].completed).toBe(true)
    expect(carrinhoSubs[1].preview_file_url).toBe(
      "https://example.com/carrinho2.pdf",
    )

    const upsellTask = tables.tasks.rows.find(
      (t) => t.id === FLOW_UPSELL_TASK_ID,
    )
    const upsellSub = (upsellTask?.metadata as { sub_items: Array<{ slug: string; completed?: boolean; preview_file_url?: string | null }> }).sub_items[0]
    expect(upsellSub.completed).toBe(true)
    expect(upsellSub.preview_file_url).toBe(
      "https://example.com/poscompra.pdf",
    )
  })

  it("e idempotente (rodar 2x nao duplica nem altera resultado)", async () => {
    seed()
    await applyPreFillFromPreview(ONB_ID, "actor-1")
    const firstRunUpdates = tables.tasks.updates.length
    await applyPreFillFromPreview(ONB_ID, "actor-1")
    // Segunda chamada deve sobrescrever (mesmo state final), mas nao deve
    // criar rows novas em outras tabelas
    const welcomeTask = tables.tasks.rows.find(
      (t) => t.id === FLOW_WELCOME_TASK_ID,
    )
    const welcomeSubs = (welcomeTask?.metadata as { sub_items: Array<{ completed?: boolean }> }).sub_items
    expect(welcomeSubs[0].completed).toBe(true)
    expect(tables.tasks.updates.length).toBeGreaterThan(firstRunUpdates)
  })

  it("nao sobrescreve sub_item ja completado manualmente", async () => {
    seed({ carrinhoSubItem1Completed: true, carrinhoSubItem1Manual: true })
    await applyPreFillFromPreview(ONB_ID, "actor-1")
    const carrinhoTask = tables.tasks.rows.find(
      (t) => t.id === FLOW_CARRINHO_TASK_ID,
    )
    const sub = (carrinhoTask?.metadata as { sub_items: Array<{ completed_by?: string | null; preview_deliverable_id?: string | null }> }).sub_items[0]
    // Mantem o completed_by manual e NAO ganha preview_deliverable_id
    expect(sub.completed_by).toBe("manual-user")
    expect(sub.preview_deliverable_id).toBeUndefined()
  })

  it("skip silencioso quando anchor da Etapa 03 nao existe", async () => {
    resetTables()
    tables.onboardings = {
      rows: [{ id: ONB_ID, current_version: 1 }],
      updates: [],
    }
    tables.tasks = { rows: [], updates: [] }
    tables.task_deliverables = { rows: [], updates: [] }

    // Nao deve lancar
    await expect(
      applyPreFillFromPreview(ONB_ID, "actor-1"),
    ).resolves.toBeUndefined()
  })

  it("ignora deliverables sem file_url", async () => {
    seed({ pilotoWelcomeFilled: false })
    await applyPreFillFromPreview(ONB_ID, "actor-1")
    const welcomeTask = tables.tasks.rows.find(
      (t) => t.id === FLOW_WELCOME_TASK_ID,
    )
    const sub = (welcomeTask?.metadata as { sub_items: Array<{ completed?: boolean }> }).sub_items[0]
    expect(sub.completed).toBe(false)
  })

  it("propaga pilotos pro workspace (markPreviewEmailReady) quando ha store_id", async () => {
    seed({ storeId: "store-1" })
    await applyPreFillFromPreview(ONB_ID, "actor-1")

    // 4 pilotos mapeados -> 4 chamadas, com flowType+emailNumber corretos
    const calls = markPreviewEmailReady.mock.calls
    expect(calls).toEqual(
      expect.arrayContaining([
        ["store-1", "welcome", 1],
        ["store-1", "abandoned_cart", 1],
        ["store-1", "abandoned_cart", 2],
        ["store-1", "upsell", 1],
      ]),
    )
    expect(calls.length).toBe(4)
  })

  it("nao chama markPreviewEmailReady quando onboarding nao tem store_id", async () => {
    seed()
    await applyPreFillFromPreview(ONB_ID, "actor-1")
    expect(markPreviewEmailReady).not.toHaveBeenCalled()
  })

  it("nao propaga piloto sem file_url", async () => {
    seed({ storeId: "store-1", pilotoWelcomeFilled: false })
    await applyPreFillFromPreview(ONB_ID, "actor-1")
    // welcome (#1) nao deve ser propagado; os outros 3 sim
    const calls = markPreviewEmailReady.mock.calls
    expect(calls).not.toContainEqual(["store-1", "welcome", 1])
    expect(calls.length).toBe(3)
  })
})
