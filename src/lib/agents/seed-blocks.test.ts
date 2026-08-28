/**
 * Tests para seedBlocksFromBlueprint / ensureBlocksSeeded / reconcileBlocksAdditive.
 *
 * Cobre:
 *  - persistência de `needs_image` no INSERT (checkbox "imagem" do blueprint)
 *  - reconciliação ADITIVA: adiciona blocos faltantes da blueprint preservando
 *    a copy existente (carry-over por match de tipo), no-op quando já bate.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { BlueprintBlockDef } from "./email-blueprint"

/* eslint-disable @typescript-eslint/no-explicit-any */

let blueprintBlocks: BlueprintBlockDef[] | null = null
let existingBlocksCount = 0
let existingBlocksData: any[] = []
const insertCalls: Array<Record<string, unknown>[]> = []
let deleteCalls = 0
const updateCalls: Array<{ id: string; patch: Record<string, unknown> }> = []

function buildQuery(table: string): any {
  const self: any = {}
  self.__cols = ""
  self.select = (cols?: string) => {
    self.__cols = String(cols ?? "")
    return self
  }
  ;["eq", "order", "limit"].forEach((m) => {
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
  // await da query: email_blocks com "content" → leitura de blocos existentes
  // (reconcile); senão → count head (ensureBlocksSeeded).
  self.then = (resolve: (v: any) => void) => {
    if (table === "email_blocks" && self.__cols.includes("content")) {
      return resolve({ data: existingBlocksData, error: null })
    }
    return resolve({ count: existingBlocksCount, error: null })
  }
  self.delete = () => ({
    eq: () => {
      deleteCalls++
      return Promise.resolve({ error: null })
    },
  })
  self.update = (patch: Record<string, unknown>) => ({
    eq: (_col: string, id: string) => {
      updateCalls.push({ id, patch })
      return Promise.resolve({ error: null })
    },
  })
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

import {
  seedBlocksFromBlueprint,
  ensureBlocksSeeded,
  reconcileBlocksAdditive,
} from "./seed-blocks"

const BLOCKS: BlueprintBlockDef[] = [
  { type: "hero", label: "Hero", purpose: "Banner", needs_image: true },
  { type: "text", label: "Texto", purpose: "Corpo" }, // sem flag
  { type: "products", label: "Produtos", purpose: "Grid", needs_image: true },
  { type: "footer", label: "Rodapé", purpose: "Links", needs_image: false },
]

beforeEach(() => {
  blueprintBlocks = BLOCKS
  existingBlocksCount = 0
  existingBlocksData = []
  insertCalls.length = 0
  deleteCalls = 0
  updateCalls.length = 0
})

describe("seedBlocksFromBlueprint", () => {
  it("persiste needs_image no INSERT conforme o blueprint", async () => {
    await seedBlocksFromBlueprint("email-1", "abandoned_cart", 5)
    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0].map((r) => r.needs_image)).toEqual([true, false, true, false])
  })

  it("retorna os blocos com needs_image derivado do que foi persistido", async () => {
    const { blocks } = await seedBlocksFromBlueprint("email-1", "welcome", 1)
    expect(blocks.map((b) => b.needs_image)).toEqual([true, false, true, false])
  })

  it("hero sem flag explícita assume needs_image=true", async () => {
    blueprintBlocks = [
      { type: "hero", label: "Hero", purpose: "Banner" },
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
    expect(insertCalls[0].map((r) => r.needs_image)).toEqual([true, false, true, false])
  })

  it("não insere nada quando já há blocos (idempotente)", async () => {
    existingBlocksCount = 4
    const res = await ensureBlocksSeeded("email-1", "abandoned_cart", 5)
    expect(res.seeded).toBe(false)
    expect(insertCalls).toHaveLength(0)
  })
})

describe("reconcileBlocksAdditive", () => {
  const BP5: BlueprintBlockDef[] = [
    { type: "header", label: "Header", purpose: "H" },
    { type: "hero", label: "Hero", purpose: "He", needs_image: true },
    { type: "coupon", label: "Coupon", purpose: "C" },
    { type: "cta", label: "CTA", purpose: "Ct" },
    { type: "footer", label: "Footer", purpose: "F" },
  ]

  it("no-op quando a estrutura já bate com a blueprint (e needs_image já correto)", async () => {
    blueprintBlocks = BP5
    existingBlocksData = BP5.map((d, i) => ({
      id: `x${i}`,
      block_type: d.type,
      position: i + 1,
      label: d.label,
      content: { headline: "x" },
      applied: false,
      applied_at: null,
      // já reflete o desejado da blueprint: só o hero precisa de imagem
      needs_image: d.type === "hero",
    }))
    const res = await reconcileBlocksAdditive("email-1", "welcome", 4)
    expect(res.reconciled).toBe(false)
    expect(res.added).toBe(0)
    expect(insertCalls).toHaveLength(0)
    expect(deleteCalls).toBe(0)
    expect(updateCalls).toHaveLength(0)
  })

  it("sameSequence mas needs_image divergente → backfilla o flag sem reordenar", async () => {
    blueprintBlocks = BP5
    // Cenário do bug: blocos semeados por SQL antigo nasceram com needs_image=false
    // em TODOS (inclusive o hero). Estrutura bate com a blueprint.
    existingBlocksData = BP5.map((d, i) => ({
      id: `x${i}`,
      block_type: d.type,
      position: i + 1,
      label: d.label,
      content: { headline: "x" },
      applied: false,
      applied_at: null,
      needs_image: false,
    }))
    const res = await reconcileBlocksAdditive("email-1", "welcome", 4)
    expect(res.reconciled).toBe(true)
    expect(res.added).toBe(0)
    // sem reescrita estrutural: nada de delete/insert
    expect(deleteCalls).toBe(0)
    expect(insertCalls).toHaveLength(0)
    // só o hero (índice 1 em BP5) é corrigido pra true
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].id).toBe("x1")
    expect(updateCalls[0].patch).toEqual({ needs_image: true })
  })

  it("adiciona os blocos faltantes preservando a copy existente (carry-over)", async () => {
    blueprintBlocks = BP5
    existingBlocksData = [
      { id: "x1", block_type: "hero", position: 1, label: "Hero", content: { headline: "Olá" }, applied: false, applied_at: null },
      { id: "x2", block_type: "coupon", position: 2, label: "Coupon", content: { code: "OFF10" }, applied: true, applied_at: "t" },
      { id: "x3", block_type: "footer", position: 3, label: "Footer", content: { body: "rodapé" }, applied: false, applied_at: null },
    ]
    const res = await reconcileBlocksAdditive("email-1", "welcome", 4)
    expect(res.reconciled).toBe(true)
    expect(res.added).toBe(2) // header + cta
    expect(res.total).toBe(5)
    expect(deleteCalls).toBe(1)
    const rows = insertCalls[0]
    expect(rows.map((r) => r.block_type)).toEqual([
      "header", "hero", "coupon", "cta", "footer",
    ])
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4, 5])
    // carry-over de content
    expect(rows[1].content).toEqual({ headline: "Olá" })
    expect(rows[2].content).toEqual({ code: "OFF10" })
    expect(rows[2].applied).toBe(true)
    expect(rows[4].content).toEqual({ body: "rodapé" })
    // novos ficam vazios
    expect(rows[0].content).toEqual({})
    expect(rows[3].content).toEqual({})
    // needs_image vem da blueprint
    expect(rows[1].needs_image).toBe(true)
  })

  it("email vazio → materializa toda a blueprint", async () => {
    blueprintBlocks = BP5
    existingBlocksData = []
    const res = await reconcileBlocksAdditive("email-1", "welcome", 4)
    expect(res.reconciled).toBe(true)
    expect(res.added).toBe(5)
    expect(insertCalls[0]).toHaveLength(5)
    expect(insertCalls[0].every((r) => Object.keys(r.content as object).length === 0)).toBe(true)
  })
})

// ── sanitizeBlockType (CHECK do banco × vocabulário da biblioteca) ───────

import { sanitizeBlockType } from "./seed-blocks"
import { COMPONENT_CATEGORY_KEYS } from "./shared/component-categories"

describe("sanitizeBlockType", () => {
  // A INVARIANTE. Este é o teste que faltava: a lista era escrita à mão e
  // já esqueceu categoria duas vezes. A 20261074 acrescentou 'body' e
  // 'reviews' (Luxe Lift) e deixou 'offer' de fora — todo bloco de oferta
  // passou a nascer 'text', o merge não achou o contrato pelo tipo e o
  // email da InnovaBay saiu com o texto de exemplo da variante, sem um
  // único sinal. Categoria que a biblioteca oferece TEM de sobreviver.
  it("toda categoria da biblioteca sobrevive ao sanitizador", () => {
    const degradadas = COMPONENT_CATEGORY_KEYS.filter(
      (k) => sanitizeBlockType(k, "e1") !== k,
    )
    expect(degradadas, `categorias virando 'text': ${degradadas.join(", ")}`).toEqual([])
  })

  it("aceita o vocabulário da biblioteca (incidente Luxe Lift: reviews/body)", () => {
    expect(sanitizeBlockType("reviews", "e1")).toBe("reviews")
    expect(sanitizeBlockType("body", "e1")).toBe("body")
    expect(sanitizeBlockType("hero", "e1")).toBe("hero")
    expect(sanitizeBlockType("products", "e1")).toBe("products")
    // A que faltava (28/08).
    expect(sanitizeBlockType("offer", "e1")).toBe("offer")
  })

  // Os técnicos do blueprint não são categorias e também não podem cair.
  it("mantém os tipos legados do blueprint", () => {
    for (const t of ["text", "coupon", "image", "divider", "spacer", "letter"]) {
      expect(sanitizeBlockType(t, "e1")).toBe(t)
    }
  })

  it("tipo desconhecido degrada pra 'text' — nunca derruba o INSERT", () => {
    expect(sanitizeBlockType("categoria_futura", "e1")).toBe("text")
  })
})
