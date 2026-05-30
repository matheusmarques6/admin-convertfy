import { describe, it, expect, beforeEach, vi } from "vitest"

// ── Mock supabase admin ─────────────────────────────────────
type Row = Record<string, unknown>
interface MockTable { rows: Row[] }
const tables: Record<string, MockTable> = {}

function resetTables() {
  for (const k of Object.keys(tables)) delete tables[k]
}

function buildQuery(tableName: string) {
  const filters: Array<{ kind: string; col: string; val?: unknown; values?: unknown[] }> = []
  let updatePatch: Row | null = null
  let insertRows: Row[] | null = null
  let limitN: number | null = null
  let orderCol: string | null = null
  let orderAsc = true

  const matchRow = (r: Row) =>
    filters.every((f) => {
      if (f.kind === "eq") return r[f.col] === f.val
      if (f.kind === "in") return f.values!.includes(r[f.col])
      return true
    })

  const exec = (): Row[] => {
    if (insertRows) {
      tables[tableName] ??= { rows: [] }
      const withIds = insertRows.map((r) => ({
        id: r.id ?? `${tableName}-${tables[tableName].rows.length + 1}-${Math.random().toString(36).slice(2, 7)}`,
        created_at: r.created_at ?? new Date().toISOString(),
        ...r,
      }))
      tables[tableName].rows.push(...withIds)
      return withIds
    }
    const table = tables[tableName] ?? { rows: [] }
    let rows = table.rows.filter(matchRow)
    if (updatePatch) {
      for (const row of rows) Object.assign(row, updatePatch)
    }
    if (orderCol) {
      rows = [...rows].sort((a, b) => {
        const av = a[orderCol!] as number | string
        const bv = b[orderCol!] as number | string
        if (av === bv) return 0
        const cmp = av < bv ? -1 : 1
        return orderAsc ? cmp : -cmp
      })
    }
    if (limitN !== null) rows = rows.slice(0, limitN)
    return rows
  }

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => { filters.push({ kind: "eq", col, val }); return chain },
    in: (col: string, values: unknown[]) => { filters.push({ kind: "in", col, values }); return chain },
    order: (col: string, opts?: { ascending?: boolean }) => {
      orderCol = col
      orderAsc = opts?.ascending !== false
      return chain
    },
    limit: (n: number) => { limitN = n; return chain },
    maybeSingle: async () => ({ data: exec()[0] ?? null, error: null }),
    single: async () => ({ data: exec()[0] ?? null, error: null }),
    update: (patch: Row) => { updatePatch = patch; return chain },
    insert: (rows: Row[] | Row) => {
      insertRows = Array.isArray(rows) ? rows : [rows]
      return chain
    },
    then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
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
      debug: vi.fn(),
    }),
  },
}))

import {
  createPromptVersion,
  activatePrompt,
  rollbackToVersion,
  listPrompts,
  canManagePrompts,
} from "@/lib/services/prompt-management.service"

const ACTOR = "user-1"

function seedActiveCopy(version = 1) {
  resetTables()
  tables.email_agent_configs = {
    rows: [
      {
        id: "copy-v1",
        agent_type: "copy",
        model: "claude-sonnet-4-6",
        system_prompt: "You are a copywriter.",
        user_template: "Write a {{type}} email for {{brand}}.",
        temperature: 0.7,
        max_tokens: 2048,
        output_schema: null,
        version,
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        created_by: ACTOR,
      },
    ],
  }
  tables.profiles = { rows: [{ id: ACTOR, name: "Tester", email: "t@t.com" }] }
}

describe("prompt-management.service", () => {
  beforeEach(() => {
    resetTables()
  })

  describe("createPromptVersion", () => {
    it("increments version when there are previous rows", async () => {
      seedActiveCopy(3)
      const created = await createPromptVersion({
        agentType: "copy",
        model: "claude-sonnet-4-6",
        systemPrompt: "Better prompt now.",
        userTemplate: "Write a {{type}} for {{brand}}.",
        temperature: 0.5,
        maxTokens: 1024,
        createdBy: ACTOR,
      })
      expect(created.version).toBe(4)
      expect(created.is_active).toBe(false)
      expect(created.agent_type).toBe("copy")
    })

    it("starts at version 1 when no previous rows", async () => {
      resetTables()
      tables.email_agent_configs = { rows: [] }
      tables.profiles = { rows: [{ id: ACTOR, name: "Tester" }] }
      const created = await createPromptVersion({
        agentType: "qa",
        model: "claude-haiku-3-5",
        systemPrompt: "QA agent prompt.",
        userTemplate: "Validate {{html}}.",
        temperature: 0.2,
        maxTokens: 512,
        createdBy: ACTOR,
      })
      expect(created.version).toBe(1)
      expect(created.is_active).toBe(false)
    })

    it("rejects invalid output_schema", async () => {
      seedActiveCopy(1)
      await expect(
        createPromptVersion({
          agentType: "copy",
          model: "claude-sonnet-4-6",
          systemPrompt: "Prompt content.",
          userTemplate: "Template {{x}}.",
          temperature: 0.7,
          maxTokens: 1024,
          outputSchema: { foo: "bar" }, // sem `type`/`properties`
          createdBy: ACTOR,
        }),
      ).rejects.toThrow(/output_schema/i)
    })

    it("accepts valid output_schema with type", async () => {
      seedActiveCopy(1)
      const created = await createPromptVersion({
        agentType: "copy",
        model: "claude-sonnet-4-6",
        systemPrompt: "Prompt content.",
        userTemplate: "Template {{x}}.",
        temperature: 0.7,
        maxTokens: 1024,
        outputSchema: { type: "object", properties: { x: { type: "string" } } },
        createdBy: ACTOR,
      })
      expect(created.version).toBe(2)
    })
  })

  describe("activatePrompt", () => {
    it("is idempotent when target is already active", async () => {
      seedActiveCopy(1)
      const result = await activatePrompt("copy-v1", ACTOR)
      expect(result.was_already_active).toBe(true)
      expect(result.deactivated_version).toBeNull()
      // Continua só 1 ativo
      const actives = tables.email_agent_configs.rows.filter((r) => r.is_active)
      expect(actives).toHaveLength(1)
    })

    it("deactivates previous and activates target", async () => {
      seedActiveCopy(1)
      // Cria v2 (não-ativa) e tenta ativá-la
      const created = await createPromptVersion({
        agentType: "copy",
        model: "claude-sonnet-4-6",
        systemPrompt: "v2 prompt.",
        userTemplate: "Template {{x}}.",
        temperature: 0.7,
        maxTokens: 1024,
        createdBy: ACTOR,
      })
      const result = await activatePrompt(created.id, ACTOR)
      expect(result.was_already_active).toBe(false)
      expect(result.deactivated_version).toBe(1)
      expect(result.activated.version).toBe(2)

      // Apenas 1 ativo no agent_type copy
      const actives = tables.email_agent_configs.rows.filter(
        (r) => r.agent_type === "copy" && r.is_active,
      )
      expect(actives).toHaveLength(1)
      expect(actives[0].id).toBe(created.id)
    })

    it("returns 404 when prompt id does not exist", async () => {
      seedActiveCopy(1)
      await expect(activatePrompt("inexistente", ACTOR)).rejects.toThrow()
    })
  })

  describe("rollbackToVersion", () => {
    async function seedThreeCopyVersions() {
      seedActiveCopy(1) // v1 is active
      const v2 = await createPromptVersion({
        agentType: "copy",
        model: "claude-sonnet-4-6",
        systemPrompt: "v2.",
        userTemplate: "Template.",
        temperature: 0.7,
        maxTokens: 1024,
        createdBy: ACTOR,
      })
      await activatePrompt(v2.id, ACTOR) // agora v2 ativa
      const v3 = await createPromptVersion({
        agentType: "copy",
        model: "claude-sonnet-4-6",
        systemPrompt: "v3.",
        userTemplate: "Template.",
        temperature: 0.7,
        maxTokens: 1024,
        createdBy: ACTOR,
      })
      await activatePrompt(v3.id, ACTOR) // agora v3 ativa
      return { v3 }
    }

    it("rolls back active to a previous version", async () => {
      const { v3 } = await seedThreeCopyVersions()
      const result = await rollbackToVersion(v3.id, 1, ACTOR)
      expect(result.activated_version).toBe(1)
      expect(result.previous_active_version).toBe(3)
      const activeRow = tables.email_agent_configs.rows.find(
        (r) => r.agent_type === "copy" && r.is_active,
      )
      expect(activeRow?.version).toBe(1)
    })

    it("returns 404 when target version does not exist", async () => {
      const { v3 } = await seedThreeCopyVersions()
      await expect(rollbackToVersion(v3.id, 99, ACTOR)).rejects.toThrow(
        /Versão 99/i,
      )
    })

    it("returns 409 when target version is already active", async () => {
      const { v3 } = await seedThreeCopyVersions()
      await expect(rollbackToVersion(v3.id, 3, ACTOR)).rejects.toThrow(/já é a ativa/i)
    })
  })

  describe("listPrompts", () => {
    it("groups by agent_type and separates active from history", async () => {
      seedActiveCopy(1)
      const v2 = await createPromptVersion({
        agentType: "copy",
        model: "claude-sonnet-4-6",
        systemPrompt: "v2.",
        userTemplate: "Template.",
        temperature: 0.7,
        maxTokens: 1024,
        createdBy: ACTOR,
      })
      const result = await listPrompts()
      expect(result.by_type.copy.active?.version).toBe(1)
      expect(result.by_type.copy.history.map((r) => r.version)).toContain(v2.version)
      expect(result.by_type.image.active).toBeNull()
    })
  })

  describe("canManagePrompts", () => {
    it("allows admin/owner roles", () => {
      expect(canManagePrompts({ id: "u", role: "admin", tags: [] })).toBe(true)
      expect(canManagePrompts({ id: "u", role: "owner", tags: [] })).toBe(true)
    })
    it("allows tag dev", () => {
      expect(canManagePrompts({ id: "u", role: "member", tags: ["dev"] })).toBe(true)
    })
    it("denies otherwise", () => {
      expect(canManagePrompts({ id: "u", role: "member", tags: [] })).toBe(false)
      expect(canManagePrompts({ id: "u", role: null, tags: [] })).toBe(false)
    })
  })
})
