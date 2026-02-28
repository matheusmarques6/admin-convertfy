import { describe, it, expect } from "vitest"
import { extractUtmParams } from "./report"

describe("extractUtmParams", () => {
  it("should extract all 5 UTM params from a complete URL", () => {
    const url =
      "https://example.com/page?utm_source=google&utm_medium=cpc&utm_campaign=summer_sale&utm_content=banner_1&utm_term=shoes"
    const result = extractUtmParams(url)
    expect(result).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "summer_sale",
      utm_content: "banner_1",
      utm_term: "shoes",
    })
  })

  it("should extract partial params (source + medium only)", () => {
    const url = "https://example.com/?utm_source=facebook&utm_medium=social"
    const result = extractUtmParams(url)
    expect(result).toEqual({
      utm_source: "facebook",
      utm_medium: "social",
    })
  })

  it("should return null when URL has no UTM params", () => {
    const url = "https://example.com/page?ref=homepage&page=2"
    const result = extractUtmParams(url)
    expect(result).toBeNull()
  })

  it("should return null for null input", () => {
    const result = extractUtmParams(null)
    expect(result).toBeNull()
  })

  it("should return null for empty string", () => {
    const result = extractUtmParams("")
    expect(result).toBeNull()
  })

  it("should handle URL without protocol by prepending https", () => {
    const url = "example.com/page?utm_source=email&utm_medium=newsletter"
    const result = extractUtmParams(url)
    expect(result).toEqual({
      utm_source: "email",
      utm_medium: "newsletter",
    })
  })

  it("should handle encoded characters (%20, +, %26)", () => {
    const url =
      "https://example.com/?utm_source=google&utm_campaign=summer%20sale&utm_medium=cost%2Bper%2Bclick&utm_term=blue%26white"
    const result = extractUtmParams(url)
    expect(result).not.toBeNull()
    expect(result!.utm_campaign).toBe("summer sale")
    expect(result!.utm_medium).toBe("cost+per+click")
    expect(result!.utm_term).toBe("blue&white")
  })

  it("should not throw on malformed URL and return null", () => {
    expect(() => extractUtmParams("://not-a-url")).not.toThrow()
    const result = extractUtmParams("://not-a-url")
    expect(result).toBeNull()
  })

  it("should handle URL with only utm_source", () => {
    const url = "https://example.com/?utm_source=instagram"
    const result = extractUtmParams(url)
    expect(result).toEqual({
      utm_source: "instagram",
    })
  })
})
