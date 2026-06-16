/**
 * Tests para os helpers de GATE 2 em brand-guards.ts:
 *   - isBrandConfirmed: a ultima versao de store_brand_identity tem confirmed_at?
 *   - getConfirmedBrandStoreIds: versao em lote (ultima versao por loja).
 */
import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { isBrandConfirmed, getConfirmedBrandStoreIds } from "./brand-guards"

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeAdmin(opts: {
  single?: Record<string, unknown> | null
  list?: Array<Record<string, unknown>>
}): SupabaseClient {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () =>
      Promise.resolve({ data: opts.single ?? null, error: null }),
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: opts.list ?? [], error: null }),
  }
  return { from: () => chain } as unknown as SupabaseClient
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("isBrandConfirmed", () => {
  it("true quando a ultima versao tem confirmed_at", async () => {
    const admin = makeAdmin({
      single: { confirmed_at: "2026-06-16T00:00:00Z" },
    })
    expect(await isBrandConfirmed(admin, "store-1")).toBe(true)
  })

  it("false quando a ultima versao tem confirmed_at null", async () => {
    const admin = makeAdmin({ single: { confirmed_at: null } })
    expect(await isBrandConfirmed(admin, "store-1")).toBe(false)
  })

  it("false quando nao ha row de brand identity", async () => {
    const admin = makeAdmin({ single: null })
    expect(await isBrandConfirmed(admin, "store-1")).toBe(false)
  })
})

describe("getConfirmedBrandStoreIds", () => {
  it("retorna Set vazio sem consultar quando storeIds vazio", async () => {
    const admin = makeAdmin({
      list: [{ store_id: "x", version: 1, confirmed_at: "y" }],
    })
    const result = await getConfirmedBrandStoreIds(admin, [])
    expect(result.size).toBe(0)
  })

  it("usa a ULTIMA versao por loja: v3 nao-confirmada exclui a loja mesmo com v2 confirmada", async () => {
    // Dados ja ordenados por version desc (como o DB devolve via .order desc).
    const admin = makeAdmin({
      list: [
        { store_id: "A", version: 3, confirmed_at: null },
        { store_id: "A", version: 2, confirmed_at: "2026-01-01" },
        { store_id: "B", version: 1, confirmed_at: "2026-01-02" },
      ],
    })
    const result = await getConfirmedBrandStoreIds(admin, ["A", "B"])
    expect(result.has("A")).toBe(false)
    expect(result.has("B")).toBe(true)
    expect(result.size).toBe(1)
  })

  it("inclui loja cuja ultima versao esta confirmada", async () => {
    const admin = makeAdmin({
      list: [{ store_id: "C", version: 5, confirmed_at: "2026-01-03" }],
    })
    const result = await getConfirmedBrandStoreIds(admin, ["C"])
    expect(result.has("C")).toBe(true)
    expect(result.size).toBe(1)
  })
})
