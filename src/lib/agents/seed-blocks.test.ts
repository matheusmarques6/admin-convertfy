/**
 * Tests para seedBlocksFromBlueprint / ensureBlocksSeeded — foco no fix que
 * passou a PERSISTIR `needs_image` em email_blocks (antes o flag se perdia no
 * INSERT e o pipeline ignorava o checkbox "imagem" do blueprint).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { BlueprintBlockDef } from "./email-blueprint"

/* eslint-disable @typescript-eslint/no-explicit-any */

let blueprintBlocks: BlueprintBlockDef[] | null = null
let existingBlocksCount = 0
const insertCalls: Array<Record<string, unknown>[]> = []

function buildQuery(table: string): any {
  const self: any = {}
  ;["select", "eq", "order", "limit"].forEach((m) => {
    self[m] = () => self
  })
  // email_blueprints.select("blocks").eq().eq().maybeSingle()
  self.maybeSingle = () => {
    if (table === "email_blueprints") {
      return Promise.resolve({
        data: blueprintBlocks ? { blocks: blueprintBlocks } : null,
        error: null,
      })
    }
    return Promise.resolve({ data: null, error: null })
  }
  // count: head select para ensureBlocksSeeded
  self.then = (resolve: (v: { count: number; error: null }) => void) =>
    resolve({ count: existingBlocksCount, error: null })
  // delete().eq()
  self.delete = () => ({
    eq: () => Promise.resolve({ error: null }),
  })
  // insert(arr).select(...) ou insert(arr) direto
  self.insert = (data: Record<string, unknown>[]) => {
    insertCalls.push(data)
    const echoRows = data.map((row, idx) => ({
      id: `block-${idx}`,
      block_type: row.block_type,
      position: row.position,
      label: row.label,
      needs_image: row.needs_image,
    }))
    return {
      select: () => Promise.resolve({ data: echoRows, error: null }),
      then: (resolve: (v: { error: null }) => void) =>
        resolve({ error: null }),
    }
  }
  return self
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => buildQuery(table),
  }),
}))

import { seedBlocksFromBlueprint, ensureBlocksSeeded } from "./seed-blocks"

const BLOCKS: BlueprintBlockDef[] = [
  { type: "hero", label: "Hero", purpose: "Banner", needs_image: true },
  { type: "text", label: "Texto", purpose: "Corpo" }, // sem flag
  { type: "products", label: "Produtos", purpose: "Grid", needs_image: true },
  { type: "footer", label: "Rodapé", purpose: "Links", needs_image: false },
]

beforeEach(() => {
  blueprintBlocks = BLOCKS
  existingBlocksCount = 0
  insertCalls.length = 0
})

describe("seedBlocksFromBlueprint", () => {
  it("persiste needs_image no INSERT conforme o blueprint", async () => {
    await seedBlocksFromBlueprint("email-1", "abandoned_cart", 5)

    expect(insertCalls).toHaveLength(1)
    const rows = insertCalls[0]
    expect(rows.map((r) => r.needs_image)).toEqual([true, false, true, false])
  })

  it("retorna os blocos com needs_image derivado do que foi persistido", async () => {
    const { blocks } = await seedBlocksFromBlueprint("email-1", "welcome", 1)
    expect(blocks.map((b) => b.needs_image)).toEqual([true, false, true, false])
  })

  it("hero sem flag explícita assume needs_image=true", async () => {
    blueprintBlocks = [
      { type: "hero", label: "Hero", purpose: "Banner" }, // sem needs_image
      { type: "text", label: "Texto", purpose: "Corpo" },
    ]
    await seedBlocksFromBlueprint("email-1", "welcome", 2)
    expect(insertCalls[0].map((r) => r.needs_image)).toEqual([true, false])
  })
})

describe("ensureBlocksSeeded", () => {
  it("persiste needs_image quando a tabela está vazia", async () => {
    existingBlocksCount = 0
    await ensureBlocksSeeded("email-1", "abandoned_cart", 5)
    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0].map((r) => r.needs_image)).toEqual([
      true,
      false,
      true,
      false,
    ])
  })

  it("não insere nada quando já há blocos (idempotente)", async () => {
    existingBlocksCount = 4
    const res = await ensureBlocksSeeded("email-1", "abandoned_cart", 5)
    expect(res.seeded).toBe(false)
    expect(insertCalls).toHaveLength(0)
  })
})
