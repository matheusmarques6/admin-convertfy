/**
 * Testes do mapeamento suggestion → campaign_pipeline_items e do undo
 * com guard de stage. Mock do Supabase via fluent query builder.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

interface MockRow {
  table: string
  data: Record<string, unknown>
}

const captured: { inserts: MockRow[]; updates: MockRow[]; deletes: MockRow[] } = {
  inserts: [],
  updates: [],
  deletes: [],
}

// Banco mock: cada chamada de from(table) devolve um query builder que captura
// inserts/updates/deletes e devolve as rows configuradas pelo teste.
const fixtures: {
  suggestions: Map<string, Record<string, unknown>>
  pipelineItems: Map<string, Record<string, unknown>>
} = {
  suggestions: new Map(),
  pipelineItems: new Map(),
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => makeAdmin(),
}))

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

function makeAdmin() {
  return {
    from: (table: string) => makeQuery(table),
  }
}

function makeQuery(table: string) {
  type Filter = { col: string; val: unknown }
  const filters: Filter[] = []
  let action: "select" | "insert" | "update" | "delete" = "select"
  let insertPayload: Record<string, unknown> | null = null
  let updatePayload: Record<string, unknown> | null = null

  const findRow = (): Record<string, unknown> | null => {
    const store = table === "campaign_suggestions" ? fixtures.suggestions : fixtures.pipelineItems
    for (const row of store.values()) {
      if (filters.every((f) => row[f.col] === f.val)) return row
    }
    return null
  }

  const builder = {
    select: (_cols?: string) => {
      // Não sobrescreve insert/update — select depois de insert é só pra encadear .single()
      if (action !== "insert" && action !== "update") action = "select"
      return builder
    },
    insert: (data: Record<string, unknown>) => {
      action = "insert"
      insertPayload = data
      captured.inserts.push({ table, data })
      return builder
    },
    update: (data: Record<string, unknown>) => {
      action = "update"
      updatePayload = data
      return builder
    },
    delete: () => {
      action = "delete"
      return builder
    },
    eq: (col: string, val: unknown) => {
      filters.push({ col, val })
      if (action === "update" && updatePayload) {
        const row = findRow()
        if (row) Object.assign(row, updatePayload)
        captured.updates.push({ table, data: { ...updatePayload, _filters: filters.slice() } })
      } else if (action === "delete") {
        const row = findRow()
        if (row) {
          const store =
            table === "campaign_suggestions" ? fixtures.suggestions : fixtures.pipelineItems
          store.delete(row.id as string)
          captured.deletes.push({ table, data: { _filters: filters.slice() } })
        }
      }
      return builder
    },
    maybeSingle: async () => ({ data: findRow(), error: null }),
    single: async () => {
      if (action === "insert" && insertPayload) {
        const id = (insertPayload.id as string) || `${table}-${Math.random().toString(36).slice(2, 8)}`
        const row = { id, ...insertPayload }
        const store =
          table === "campaign_suggestions" ? fixtures.suggestions : fixtures.pipelineItems
        store.set(id, row)
        return { data: row, error: null }
      }
      const row = findRow()
      return { data: row, error: row ? null : new Error("not found") }
    },
    then: (resolve: (v: { data: null; error: null }) => unknown) => resolve({ data: null, error: null }),
  }
  return builder
}

beforeEach(() => {
  fixtures.suggestions.clear()
  fixtures.pipelineItems.clear()
  captured.inserts = []
  captured.updates = []
  captured.deletes = []
})

describe("approveSuggestion", () => {
  it("mapeia type → campaign_type, herda subject do draft e cria pipeline item em copy_creation", async () => {
    const { approveSuggestion } = await import("./suggestion-approval.service")

    fixtures.suggestions.set("sug-1", {
      id: "sug-1",
      org_id: "org-1",
      status: "suggested",
      type: "data",
      title: "Last call · Dia dos Namorados",
      angle: "Urgência + curadoria.",
      subject: "⏳ Ainda dá tempo",
      trigger: { label: "Dia dos Namorados", detail: "em 2 dias", source: "Calendário BR" },
      confidence: 92,
      channel: "Email + SMS",
      targets: [{ store_id: "store-1", store_name: "Loja A", country: "BR" }],
      est_revenue: "R$ 42k",
      send_date: "2026-06-11",
      pipeline_item_id: null,
      email_draft: {
        subject: "⏳ Ainda dá tempo — só hoje",
        preheader: "Garanta o seu",
        strategy: "Estratégia editada pelo COO",
        blocks: [{ id: "b1", type: "heading", headline: "Title" }],
      },
      // Gate de aprovação: precisa de pelo menos 1 piloto 'good'.
      copy_results: { test: { "store-1": { quality: "good" } } },
    })

    const result = await approveSuggestion({
      suggestionId: "sug-1",
      orgId: "org-1",
      userId: "user-1",
    })

    expect(result.pipeline_item_id).toBeTruthy()
    const insert = captured.inserts.find((i) => i.table === "campaign_pipeline_items")
    expect(insert).toBeDefined()
    expect(insert!.data.stage).toBe("copy_creation")
    expect(insert!.data.campaign_type).toBe("seasonal")
    expect(insert!.data.subject_line).toBe("⏳ Ainda dá tempo — só hoje")
    expect(insert!.data.description).toBe("Estratégia editada pelo COO")
    expect((insert!.data.target_stores as unknown[])).toHaveLength(1)
    expect((insert!.data.tags as string[])).toEqual(["central", "data"])

    // Estado de produção por loja inicializado + canal propagado (aba "Em produção")
    const targets = insert!.data.target_stores as Array<Record<string, unknown>>
    expect(targets[0].prod_stage).toBe(0)
    expect(targets[0].designer_id).toBeNull()
    expect((insert!.data.copy_data as Record<string, unknown>).channel).toBe("Email + SMS")

    const suggestion = fixtures.suggestions.get("sug-1")!
    expect(suggestion.status).toBe("approved")
    expect(suggestion.pipeline_item_id).toBe(result.pipeline_item_id)
  })

  it("type performance → campaign_type performance e cai no fallback de description", async () => {
    const { approveSuggestion } = await import("./suggestion-approval.service")

    fixtures.suggestions.set("sug-2", {
      id: "sug-2",
      org_id: "org-1",
      status: "suggested",
      type: "performance",
      title: "Win-back",
      angle: "", // sem angle
      subject: "Última chance",
      trigger: { label: "1.847 inativos", detail: "lista quente", source: "omnisend.lists" },
      confidence: 80,
      targets: [{ store_id: "store-2", store_name: "Loja B", country: "BR" }],
      pipeline_item_id: null,
      email_draft: null,
      copy_results: { test: { "store-2": { quality: "good" } } },
    })

    await approveSuggestion({ suggestionId: "sug-2", orgId: "org-1", userId: "user-1" })
    const insert = captured.inserts.find((i) => i.table === "campaign_pipeline_items")!
    expect(insert.data.campaign_type).toBe("performance")
    // Sem angle nem strategy → cai no triggerLabel
    expect(insert.data.description).toContain("1.847 inativos")
  })

  it("aprovar já-aprovada é idempotente (retorna o mesmo pipeline_item_id)", async () => {
    const { approveSuggestion } = await import("./suggestion-approval.service")

    fixtures.suggestions.set("sug-3", {
      id: "sug-3",
      org_id: "org-1",
      status: "approved",
      type: "data",
      title: "X",
      pipeline_item_id: "pipe-existing",
      trigger: { label: "x", detail: "y", source: "z" },
      targets: [{ store_id: "s1", store_name: "S1", country: "BR" }],
      email_draft: null,
      copy_results: {},
    })

    const result = await approveSuggestion({
      suggestionId: "sug-3",
      orgId: "org-1",
      userId: "user-1",
    })
    expect(result.pipeline_item_id).toBe("pipe-existing")
    expect(captured.inserts).toHaveLength(0)
  })

  it("bloqueia aprovação sem piloto 'good' (gate de qualidade)", async () => {
    const { approveSuggestion } = await import("./suggestion-approval.service")

    fixtures.suggestions.set("sug-gate", {
      id: "sug-gate",
      org_id: "org-1",
      status: "suggested",
      type: "data",
      title: "Sem piloto validado",
      trigger: { label: "x", detail: "y", source: "z" },
      targets: [{ store_id: "s1", store_name: "S1", country: "BR" }],
      email_draft: null,
      copy_results: {},
      pipeline_item_id: null,
    })

    await expect(
      approveSuggestion({ suggestionId: "sug-gate", orgId: "org-1", userId: "user-1" }),
    ).rejects.toThrow(/Boa/)
    expect(captured.inserts).toHaveLength(0)
  })
})

describe("undoSuggestionDecision", () => {
  it("deleta o pipeline item se ainda está em copy_creation e volta sugestão pra suggested", async () => {
    const { undoSuggestionDecision } = await import("./suggestion-approval.service")

    fixtures.suggestions.set("sug-u", {
      id: "sug-u",
      org_id: "org-1",
      status: "approved",
      pipeline_item_id: "pipe-1",
    })
    fixtures.pipelineItems.set("pipe-1", {
      id: "pipe-1",
      stage: "copy_creation",
    })

    await undoSuggestionDecision({ suggestionId: "sug-u", orgId: "org-1" })

    expect(fixtures.pipelineItems.has("pipe-1")).toBe(false)
    expect(fixtures.suggestions.get("sug-u")!.status).toBe("suggested")
    expect(fixtures.suggestions.get("sug-u")!.pipeline_item_id).toBeNull()
  })

  it("bloqueia undo se o item já avançou no Kanban", async () => {
    const { undoSuggestionDecision } = await import("./suggestion-approval.service")

    fixtures.suggestions.set("sug-blocked", {
      id: "sug-blocked",
      org_id: "org-1",
      status: "approved",
      pipeline_item_id: "pipe-2",
    })
    fixtures.pipelineItems.set("pipe-2", { id: "pipe-2", stage: "design" })

    await expect(
      undoSuggestionDecision({ suggestionId: "sug-blocked", orgId: "org-1" }),
    ).rejects.toThrow(/stage: design/)
    expect(fixtures.pipelineItems.has("pipe-2")).toBe(true)
  })
})
