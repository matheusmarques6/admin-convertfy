import { describe, expect, it } from "vitest"
import { normalizeStoreHost } from "./n8n-store-guard"

describe("normalizeStoreHost", () => {
  it("extrai host normalizado de variações da mesma URL", () => {
    expect(normalizeStoreHost("https://vorrelle.com/")).toBe("vorrelle.com")
    expect(normalizeStoreHost("https://www.vorrelle.com")).toBe("vorrelle.com")
    expect(normalizeStoreHost("http://WWW.Vorrelle.com/collections/all")).toBe(
      "vorrelle.com",
    )
    expect(normalizeStoreHost("vorrelle.com")).toBe("vorrelle.com")
    expect(normalizeStoreHost("  vorrelle.com  ")).toBe("vorrelle.com")
  })

  it("hosts diferentes NÃO se igualam (caso da contaminação entre lojas)", () => {
    expect(normalizeStoreHost("https://shayaroot.com")).not.toBe(
      normalizeStoreHost("https://vorrelle.com"),
    )
  })

  it("retorna null pra entrada vazia/não parseável", () => {
    expect(normalizeStoreHost(null)).toBeNull()
    expect(normalizeStoreHost(undefined)).toBeNull()
    expect(normalizeStoreHost("")).toBeNull()
    expect(normalizeStoreHost("   ")).toBeNull()
  })
})
