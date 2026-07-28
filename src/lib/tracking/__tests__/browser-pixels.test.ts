import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

import { setMetaUserData } from "../browser-pixels"

/**
 * `setMetaUserData` e client-only (le `window.fbq`). O ambiente do vitest
 * e node, entao stubamos um `window` minimo com o fbq espiao.
 */
const calls: unknown[][] = []

function stubWindowWithFbq(): void {
  const fbq = (...args: unknown[]) => {
    calls.push(args)
  }
  vi.stubGlobal("window", { fbq })
}

describe("setMetaUserData", () => {
  beforeEach(() => {
    calls.length = 0
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("re-inicializa o pixel com o advanced matching", () => {
    stubWindowWithFbq()
    setMetaUserData("123", {
      em: "lead@example.com",
      ph: "5511999999999",
      fn: "maria",
      ln: "silva",
      external_id: "lead-uuid",
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual([
      "init",
      "123",
      {
        em: "lead@example.com",
        ph: "5511999999999",
        fn: "maria",
        ln: "silva",
        external_id: "lead-uuid",
      },
    ])
  })

  it("descarta campos vazios ou so com espacos", () => {
    stubWindowWithFbq()
    setMetaUserData("123", { em: "lead@example.com", ph: "", fn: "   " })

    expect(calls[0]?.[2]).toEqual({ em: "lead@example.com" })
  })

  it("nao chama o fbq quando nao sobra nenhum campo", () => {
    stubWindowWithFbq()
    setMetaUserData("123", { em: "", ph: "" })

    expect(calls).toHaveLength(0)
  })

  it("e no-op sem pixelId", () => {
    stubWindowWithFbq()
    setMetaUserData("", { em: "lead@example.com" })

    expect(calls).toHaveLength(0)
  })

  it("e no-op quando o fbq nao carregou (ad-blocker)", () => {
    vi.stubGlobal("window", {})
    expect(() => setMetaUserData("123", { em: "lead@example.com" })).not.toThrow()
    expect(calls).toHaveLength(0)
  })

  it("e no-op no servidor (sem window)", () => {
    vi.stubGlobal("window", undefined)
    expect(() => setMetaUserData("123", { em: "lead@example.com" })).not.toThrow()
    expect(calls).toHaveLength(0)
  })
})
