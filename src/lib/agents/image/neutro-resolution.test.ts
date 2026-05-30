import { describe, it, expect } from "vitest"
import { resolveNeutro } from "./neutro-resolution"

describe("resolveNeutro", () => {
  it("returns override when provided", () => {
    expect(
      resolveNeutro({
        colorsPrimary: [{ hex: "#000000", role: "Fundo" }],
        posicionamento: "premium",
        override: "#ABCDEF",
      }),
    ).toBe("#ABCDEF")
  })

  it("ignores empty override and falls through", () => {
    expect(
      resolveNeutro({
        colorsPrimary: [{ hex: "#123456", role: "Fundo" }],
        override: "  ",
      }),
    ).toBe("#123456")
  })

  it("returns role=Fundo color (case-insensitive) from primary", () => {
    expect(
      resolveNeutro({
        colorsPrimary: [
          { hex: "#111111", role: "Principal" },
          { hex: "#FAFAFA", role: "fundo" },
        ],
      }),
    ).toBe("#FAFAFA")
  })

  it("finds role=Fundo in secondary when not in primary", () => {
    expect(
      resolveNeutro({
        colorsPrimary: [{ hex: "#111111", role: "Principal" }],
        colorsSecondary: [{ hex: "#EEEEEE", role: "Fundo" }],
      }),
    ).toBe("#EEEEEE")
  })

  it("falls to premium heuristic when no Fundo role", () => {
    expect(
      resolveNeutro({
        colorsPrimary: [{ hex: "#111111", role: "Principal" }],
        posicionamento: "premium",
      }),
    ).toBe("#0B0B0B")
  })

  it("falls to popular heuristic", () => {
    expect(resolveNeutro({ posicionamento: "popular" })).toBe("#F5F5F5")
  })

  it("falls to white default", () => {
    expect(resolveNeutro({})).toBe("#FFFFFF")
    expect(resolveNeutro({ posicionamento: "medio" })).toBe("#FFFFFF")
    expect(resolveNeutro({ posicionamento: null })).toBe("#FFFFFF")
  })

  it("handles null/undefined arrays", () => {
    expect(
      resolveNeutro({ colorsPrimary: null, colorsSecondary: undefined }),
    ).toBe("#FFFFFF")
  })

  it("ignores Fundo entry without hex", () => {
    expect(
      resolveNeutro({
        colorsPrimary: [{ role: "Fundo" }],
        posicionamento: "popular",
      }),
    ).toBe("#F5F5F5")
  })
})
