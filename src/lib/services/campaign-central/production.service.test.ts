/**
 * Testes do mapeamento pipeline_items → produção (estágio/designer por loja,
 * fallback de estágio para itens antigos) e da mutação updateProductionStore.
 * Mock do Supabase via fluent query builder por tabela.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

type Row = Record<string, unknown>

const fx: {
  pipelineItems: Row[]
  stores: Row[]
  members: Row[]
  pipelineById: Map<string, Row>
  emailsById: Map<string, Row>
  updates: Array<{ id: unknown; payload: Row }>
} = {
  pipelineItems: [],
  stores: [],
  members: [],
  pipelineById: new Map(),
  emailsById: new Map(),
  updates: [],
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: (t: string) => makeQuery(t) }),
}))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

function makeQuery(table: string) {
  const filters: Array<{ c: string; v: unknown }> = []
  let action: "select" | "update" = "select"
  let updatePayload: Row | null = null

  const listFor = (): Row[] =>
    table === "campaign_pipeline_items"
      ? fx.pipelineItems
      : table === "client_stores"
        ? fx.stores
        : table === "org_members"
          ? fx.members
          : []

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (c: string, v: unknown) => {
      filters.push({ c, v })
      return builder
    },
    contains: () => builder,
    in: () => builder,
    order: () => builder,
    update: (p: Row) => {
      action = "update"
      updatePayload = p
      return builder
    },
    maybeSingle: async () => {
      const id = filters.find((f) => f.c === "id")?.v as string | undefined
      const store =
        table === "email_flow_emails" ? fx.emailsById : fx.pipelineById
      return { data: id ? (store.get(id) ?? null) : null, error: null }
    },
    then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
      if (action === "update") {
        const id = filters.find((f) => f.c === "id")?.v as string | undefined
        if (id) {
          const row = fx.pipelineById.get(id)
          if (row && updatePayload) Object.assign(row, updatePayload)
          fx.updates.push({ id, payload: updatePayload as Row })
        }
        return resolve({ data: null, error: null })
      }
      return resolve({ data: listFor(), error: null })
    },
  }
  return builder
}

beforeEach(() => {
  fx.pipelineItems = []
  fx.stores = []
  fx.members = []
  fx.pipelineById = new Map()
  fx.emailsById = new Map()
  fx.updates = []
})

describe("getProduction", () => {
  it("mapeia itens, usa prod_stage por loja e enriquece país/idioma", async () => {
    fx.pipelineItems = [
      {
        id: "p1",
        title: "Last call",
        subject_line: "Assunto",
        description: "desc",
        stage: "copy_creation",
        copy_data: { suggestion_id: "sug-1", angle: "Ângulo X", channel: "Email + SMS" },
        deploy_config: { send_date: "2026-12-31" },
        target_stores: [
          { store_id: "s1", store_name: "Loja A", status: "pending", prod_stage: 2, designer_id: "d1" },
          { store_id: "s2", store_name: "Loja B", status: "pending" },
        ],
        tags: ["central", "data"],
        created_at: "2026-06-01",
      },
    ]
    fx.stores = [
      { id: "s1", country: "BR", language: "pt-BR" },
      { id: "s2", country: "GB", language: "en-GB" },
    ]
    fx.members = [{ profile: { id: "d1", name: "Mariana", avatar_url: null } }]

    const { getProduction } = await import("./production.service")
    const res = await getProduction("org-1")

    expect(res.productions).toHaveLength(1)
    const p = res.productions[0]
    expect(p.type).toBe("data")
    expect(p.channel).toBe("Email + SMS")
    expect(p.angle).toBe("Ângulo X")
    expect(p.suggestion_id).toBe("sug-1")

    const a = p.stores.find((s) => s.store_id === "s1")!
    expect(a.prod_stage).toBe(2)
    expect(a.designer_id).toBe("d1")
    expect(a.region_label).toBe("Brasil")
    expect(a.lang).toBe("pt")

    const b = p.stores.find((s) => s.store_id === "s2")!
    expect(b.prod_stage).toBe(0) // sem prod_stage → fallback de copy_creation
    expect(b.region_label).toBe("Reino Unido")
    expect(b.lang).toBe("en")

    expect(res.designers).toEqual([{ id: "d1", name: "Mariana", avatar_url: null }])
  })

  it("fallback de estágio deriva do stage global do item (design → 1)", async () => {
    fx.pipelineItems = [
      {
        id: "p2",
        title: "X",
        subject_line: null,
        description: null,
        stage: "design",
        copy_data: {},
        deploy_config: {},
        target_stores: [{ store_id: "s1", store_name: "Loja A", status: "pending" }],
        tags: ["central", "tema"],
        created_at: "2026-06-01",
      },
    ]
    fx.stores = [{ id: "s1", country: "BR", language: "pt" }]

    const { getProduction } = await import("./production.service")
    const res = await getProduction("org-1")
    expect(res.productions[0].stores[0].prod_stage).toBe(1)
    expect(res.productions[0].type).toBe("tema")
    expect(res.productions[0].channel).toBe("Email") // default sem channel
  })

  it("deduplica designers repetidos entre membros", async () => {
    fx.pipelineItems = []
    fx.members = [
      { profile: { id: "d1", name: "Ana", avatar_url: null } },
      { profile: { id: "d1", name: "Ana", avatar_url: null } },
      { profile: { id: "d2", name: "Bruno", avatar_url: null } },
    ]
    const { getProduction } = await import("./production.service")
    const res = await getProduction("org-1")
    expect(res.designers.map((d) => d.id)).toEqual(["d1", "d2"])
  })
})

describe("updateProductionStore", () => {
  it("atualiza prod_stage (clamp 0..4) e preserva o designer", async () => {
    const item: Row = {
      id: "p1",
      stage: "copy_creation",
      target_stores: [
        { store_id: "s1", store_name: "Loja A", status: "pending", prod_stage: 1, designer_id: "d1" },
      ],
    }
    fx.pipelineById.set("p1", item)

    const { updateProductionStore } = await import("./production.service")
    await updateProductionStore({ orgId: "org-1", itemId: "p1", storeId: "s1", prodStage: 9 })

    const updated = (item.target_stores as Row[])[0]
    expect(updated.prod_stage).toBe(4)
    expect(updated.designer_id).toBe("d1")
  })

  it("atualiza designer sem mexer no estágio", async () => {
    const item: Row = {
      id: "p1",
      stage: "copy_creation",
      target_stores: [
        { store_id: "s1", store_name: "A", status: "pending", prod_stage: 2, designer_id: null },
      ],
    }
    fx.pipelineById.set("p1", item)

    const { updateProductionStore } = await import("./production.service")
    await updateProductionStore({ orgId: "org-1", itemId: "p1", storeId: "s1", designerId: "d2" })

    const updated = (item.target_stores as Row[])[0]
    expect(updated.designer_id).toBe("d2")
    expect(updated.prod_stage).toBe(2)
  })

  it("lança erro se o item não existe", async () => {
    const { updateProductionStore } = await import("./production.service")
    await expect(
      updateProductionStore({ orgId: "org-1", itemId: "nope", storeId: "s1", prodStage: 1 }),
    ).rejects.toThrow()
  })

  it("lança erro se a loja não está no item", async () => {
    fx.pipelineById.set("p1", { id: "p1", stage: "copy_creation", target_stores: [] })
    const { updateProductionStore } = await import("./production.service")
    await expect(
      updateProductionStore({ orgId: "org-1", itemId: "p1", storeId: "sX", prodStage: 1 }),
    ).rejects.toThrow()
  })
})

describe("getProductionStorePreview", () => {
  it("fallback (available=false) quando a loja não tem vínculo email_flow_email_id", async () => {
    fx.pipelineById.set("p1", {
      id: "p1",
      target_stores: [{ store_id: "s1", store_name: "Loja A" }],
    })
    const { getProductionStorePreview } = await import("./production.service")
    const r = await getProductionStorePreview({ orgId: "org-1", itemId: "p1", storeId: "s1" })
    expect(r.available).toBe(false)
    expect(r.html).toBeNull()
    expect(r.email_flow_email_id).toBeNull()
  })

  it("fallback quando há vínculo mas o email não está 'ready'", async () => {
    fx.pipelineById.set("p1", {
      id: "p1",
      target_stores: [{ store_id: "s1", store_name: "Loja A", email_flow_email_id: "e1" }],
    })
    fx.emailsById.set("e1", { id: "e1", status: "rendering", html: "<p>parcial</p>" })
    const { getProductionStorePreview } = await import("./production.service")
    const r = await getProductionStorePreview({ orgId: "org-1", itemId: "p1", storeId: "s1" })
    expect(r.available).toBe(false)
    expect(r.html).toBeNull()
    expect(r.email_flow_email_id).toBe("e1")
    expect(r.status).toBe("rendering")
  })

  it("retorna HTML real quando o email vinculado está 'ready'", async () => {
    fx.pipelineById.set("p1", {
      id: "p1",
      target_stores: [{ store_id: "s1", store_name: "Loja A", email_flow_email_id: "e1" }],
    })
    fx.emailsById.set("e1", { id: "e1", status: "ready", html: "<html><body>oi</body></html>" })
    const { getProductionStorePreview } = await import("./production.service")
    const r = await getProductionStorePreview({ orgId: "org-1", itemId: "p1", storeId: "s1" })
    expect(r.available).toBe(true)
    expect(r.html).toBe("<html><body>oi</body></html>")
    expect(r.status).toBe("ready")
  })

  it("fallback quando 'ready' mas html vazio", async () => {
    fx.pipelineById.set("p1", {
      id: "p1",
      target_stores: [{ store_id: "s1", store_name: "Loja A", email_flow_email_id: "e1" }],
    })
    fx.emailsById.set("e1", { id: "e1", status: "ready", html: "   " })
    const { getProductionStorePreview } = await import("./production.service")
    const r = await getProductionStorePreview({ orgId: "org-1", itemId: "p1", storeId: "s1" })
    expect(r.available).toBe(false)
    expect(r.html).toBeNull()
  })

  it("lança erro se o pipeline item não existe / fora da org", async () => {
    const { getProductionStorePreview } = await import("./production.service")
    await expect(
      getProductionStorePreview({ orgId: "org-1", itemId: "nope", storeId: "s1" }),
    ).rejects.toThrow()
  })
})
