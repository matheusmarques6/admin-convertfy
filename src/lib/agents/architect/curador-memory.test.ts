import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock configurável do supabase admin client. Cada teste seta `mockConfig`.
interface MockConfig {
  store: { org_id: string | null } | null
  previous: Record<string, unknown> | null
  crossStore: Array<Record<string, unknown>>
  inserted: Array<Record<string, unknown>>
  insertError: string | null
  throwOn: string | null
}

const mockConfig: MockConfig = {
  store: null,
  previous: null,
  crossStore: [],
  inserted: [],
  insertError: null,
  throwOn: null,
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (mockConfig.throwOn === table) {
        throw new Error(`boom:${table}`)
      }
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      builder.select = chain
      builder.eq = chain
      builder.neq = chain
      builder.order = chain
      builder.limit = chain
      builder.maybeSingle = () =>
        Promise.resolve({
          data: table === "client_stores" ? mockConfig.store : mockConfig.previous,
        })
      builder.insert = (row: Record<string, unknown>) => {
        mockConfig.inserted.push(row)
        return Promise.resolve({
          error: mockConfig.insertError ? { message: mockConfig.insertError } : null,
        })
      }
      // Builder é thenable: awaitar direto (crossStore) resolve com a lista.
      builder.then = (resolve: (v: { data: unknown }) => unknown) =>
        resolve({ data: mockConfig.crossStore })
      return builder
    },
  }),
  createClient: () => ({}),
}))

import {
  loadCuradorMemory,
  logCuradorChoice,
  renderCuradorMemory,
  type CuradorMemory,
} from "./curador-memory"

beforeEach(() => {
  mockConfig.store = null
  mockConfig.previous = null
  mockConfig.crossStore = []
  mockConfig.inserted = []
  mockConfig.insertError = null
  mockConfig.throwOn = null
})

describe("loadCuradorMemory", () => {
  it("resolve org_id, email anterior e cross-store deduplicado por loja", async () => {
    mockConfig.store = { org_id: "org-1" }
    mockConfig.previous = {
      email_number: 3,
      choices: [{ section: "hero", variant_id: "v1", variant_name: "Hero A" }],
    }
    mockConfig.crossStore = [
      {
        store_id: "s2",
        created_at: "2026-07-20",
        choices: [{ section: "hero", variant_id: "v9", variant_name: "Hero Z" }],
        store: { store_name: "Loja Dois" },
      },
      // Mesma loja repetida → deve ser deduplicada (fica só a 1ª).
      {
        store_id: "s2",
        created_at: "2026-07-19",
        choices: [],
        store: { store_name: "Loja Dois" },
      },
      {
        store_id: "s3",
        created_at: "2026-07-18",
        choices: [],
        store: [{ store_name: "Loja Três" }],
      },
    ]

    const mem = await loadCuradorMemory("s1", "welcome", 4)

    expect(mem.orgId).toBe("org-1")
    expect(mem.previousEmail).toEqual({
      email_number: 3,
      choices: [{ section: "hero", variant_id: "v1", variant_name: "Hero A" }],
    })
    // s2 aparece uma vez só; store relacional aceita objeto ou array.
    expect(mem.crossStore.map((c) => c.store_name)).toEqual([
      "Loja Dois",
      "Loja Três",
    ])
  })

  it("email_number=1 não busca email anterior", async () => {
    mockConfig.store = { org_id: "org-1" }
    mockConfig.previous = { email_number: 0, choices: [] }
    const mem = await loadCuradorMemory("s1", "welcome", 1)
    expect(mem.previousEmail).toBeNull()
  })

  it("sem org_id não traz cross-store", async () => {
    mockConfig.store = { org_id: null }
    mockConfig.crossStore = [
      { store_id: "s2", created_at: "x", choices: [], store: { store_name: "X" } },
    ]
    const mem = await loadCuradorMemory("s1", "welcome", 2)
    expect(mem.orgId).toBeNull()
    expect(mem.crossStore).toEqual([])
  })

  it("falha de leitura devolve memória vazia (best-effort)", async () => {
    mockConfig.throwOn = "client_stores"
    const mem = await loadCuradorMemory("s1", "welcome", 2)
    expect(mem).toEqual({ orgId: null, previousEmail: null, crossStore: [] })
  })
})

describe("logCuradorChoice", () => {
  it("insere linha com as escolhas", async () => {
    await logCuradorChoice({
      storeId: "s1",
      orgId: "org-1",
      flowType: "welcome",
      emailNumber: 4,
      batchId: "b1",
      choices: [{ section: "hero", variant_id: "v1", variant_name: "Hero A" }],
    })
    expect(mockConfig.inserted).toHaveLength(1)
    expect(mockConfig.inserted[0]).toMatchObject({
      store_id: "s1",
      org_id: "org-1",
      flow_type: "welcome",
      email_number: 4,
      batch_id: "b1",
    })
  })

  it("no-op quando não há escolhas", async () => {
    await logCuradorChoice({
      storeId: "s1",
      orgId: null,
      flowType: "welcome",
      emailNumber: 4,
      choices: [],
    })
    expect(mockConfig.inserted).toHaveLength(0)
  })

  it("erro de insert não propaga (best-effort)", async () => {
    mockConfig.insertError = "db down"
    await expect(
      logCuradorChoice({
        storeId: "s1",
        orgId: null,
        flowType: "welcome",
        emailNumber: 4,
        choices: [{ section: "hero", variant_id: "v1", variant_name: "Hero A" }],
      }),
    ).resolves.toBeUndefined()
  })
})

describe("renderCuradorMemory", () => {
  it("formata email anterior + cross-store", () => {
    const mem: CuradorMemory = {
      orgId: "org-1",
      previousEmail: {
        email_number: 3,
        choices: [{ section: "hero", variant_id: "v1", variant_name: "Hero A" }],
      },
      crossStore: [
        {
          store_name: "Loja Dois",
          created_at: "2026-07-20",
          choices: [{ section: "hero", variant_id: "v9", variant_name: "Hero Z" }],
        },
      ],
    }
    const out = renderCuradorMemory(mem)
    expect(out).toContain('<email_anterior_desta_loja email_number="3">')
    expect(out).toContain("- hero: Hero A")
    expect(out).toContain("<mesmo_email_em_outras_lojas>")
    expect(out).toContain('<loja nome="Loja Dois">')
    expect(out).toContain("- hero: Hero Z")
  })

  it("fallback quando não há histórico", () => {
    const mem: CuradorMemory = { orgId: null, previousEmail: null, crossStore: [] }
    expect(renderCuradorMemory(mem)).toBe("(sem histórico ainda)")
  })

  it("blocos vazios rendem placeholder", () => {
    const mem: CuradorMemory = {
      orgId: "org-1",
      previousEmail: { email_number: 2, choices: [] },
      crossStore: [],
    }
    expect(renderCuradorMemory(mem)).toContain("(sem blocos)")
  })
})
