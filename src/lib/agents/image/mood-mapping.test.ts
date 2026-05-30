import { describe, it, expect } from "vitest"
import { mapTomVozToMood } from "./mood-mapping"

describe("mapTomVozToMood", () => {
  it("maps formal", () => {
    expect(mapTomVozToMood("formal")).toBe("elegant, refined, premium")
  })

  it("maps casual", () => {
    expect(mapTomVozToMood("casual")).toBe("relaxed, friendly, approachable")
  })

  it("maps afetivo", () => {
    expect(mapTomVozToMood("afetivo")).toBe("warm, intimate, soft")
  })

  it("maps divertido", () => {
    expect(mapTomVozToMood("divertido")).toBe("playful, vibrant, energetic")
  })

  it("normalizes uppercase + whitespace", () => {
    expect(mapTomVozToMood("  FORMAL ")).toBe("elegant, refined, premium")
  })

  it("returns default for unknown value", () => {
    expect(mapTomVozToMood("misterioso")).toBe("clean, modern, balanced")
  })

  it("returns default for null", () => {
    expect(mapTomVozToMood(null)).toBe("clean, modern, balanced")
  })

  it("returns default for undefined", () => {
    expect(mapTomVozToMood(undefined)).toBe("clean, modern, balanced")
  })

  it("returns default for empty string", () => {
    expect(mapTomVozToMood("")).toBe("clean, modern, balanced")
  })
})
