import { describe, it, expect } from "vitest"
import { sanitizeSearch } from "../sanitize-search"

describe("sanitizeSearch", () => {
  // Individual escape cases
  it("escapes backslash", () => {
    expect(sanitizeSearch("test\\value")).toBe("test\\\\value")
  })

  it("escapes percent sign", () => {
    expect(sanitizeSearch("100%")).toBe("100\\%")
  })

  it("escapes underscore", () => {
    expect(sanitizeSearch("my_store")).toBe("my\\_store")
  })

  it("escapes comma", () => {
    expect(sanitizeSearch("a,b")).toBe("a\\,b")
  })

  it("escapes opening parenthesis", () => {
    expect(sanitizeSearch("foo(bar")).toBe("foo\\(bar")
  })

  it("escapes closing parenthesis", () => {
    expect(sanitizeSearch("foo)bar")).toBe("foo\\)bar")
  })

  // Edge cases
  it("returns empty string unchanged", () => {
    expect(sanitizeSearch("")).toBe("")
  })

  it("returns string without special characters unchanged", () => {
    expect(sanitizeSearch("hello world 123")).toBe("hello world 123")
  })

  it("escapes multiple special characters combined", () => {
    expect(sanitizeSearch("50%_off,(sale)\\end")).toBe(
      "50\\%\\_off\\,\\(sale\\)\\\\end"
    )
  })
})
