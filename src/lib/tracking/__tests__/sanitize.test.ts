import { describe, expect, it } from "vitest"
import {
  sanitizePostgrestValue,
  escapePostgrestLike,
  isSuspiciousQuery,
} from "../sanitize"

describe("sanitizePostgrestValue", () => {
  it("passes through normal order numbers", () => {
    expect(sanitizePostgrestValue("1001")).toBe("1001")
    expect(sanitizePostgrestValue("12345")).toBe("12345")
  })

  it("preserves allowed characters (alphanumeric, spaces, hyphens, #)", () => {
    expect(sanitizePostgrestValue("order-123 #test")).toBe("order-123 #test")
    expect(sanitizePostgrestValue("#1001")).toBe("#1001")
    expect(sanitizePostgrestValue("ABC 123")).toBe("ABC 123")
  })

  it("strips PostgREST injection operators", () => {
    expect(sanitizePostgrestValue(",customer_email.neq.null")).toBe(
      "customeremailneqnull"
    )
    expect(sanitizePostgrestValue("1001),id.gt.0")).toBe("1001idgt0")
    expect(
      sanitizePostgrestValue(
        "1001),customer_email.neq.null,or(id.gt.0"
      )
    ).toBe("1001customeremailneqnulloridgt0")
  })

  it("strips commas, dots, parentheses, brackets", () => {
    expect(sanitizePostgrestValue("a,b")).toBe("ab")
    expect(sanitizePostgrestValue("a.b")).toBe("ab")
    expect(sanitizePostgrestValue("a(b)")).toBe("ab")
    expect(sanitizePostgrestValue("a[b]")).toBe("ab")
  })

  it("returns empty string for empty input", () => {
    expect(sanitizePostgrestValue("")).toBe("")
  })

  it("strips semicolons and quotes", () => {
    expect(sanitizePostgrestValue('a;b"c\'d')).toBe("abcd")
  })
})

describe("escapePostgrestLike", () => {
  it("escapes % wildcard", () => {
    expect(escapePostgrestLike("AB%BR")).toBe("AB\\%BR")
  })

  it("escapes _ wildcard", () => {
    expect(escapePostgrestLike("test_value")).toBe("test\\_value")
  })

  it("escapes backslash", () => {
    expect(escapePostgrestLike("test\\value")).toBe("test\\\\value")
  })

  it("passes through normal strings", () => {
    expect(escapePostgrestLike("normal")).toBe("normal")
    expect(escapePostgrestLike("AB123456789BR")).toBe("AB123456789BR")
  })

  it("escapes multiple wildcards", () => {
    expect(escapePostgrestLike("%test_%")).toBe("\\%test\\_\\%")
  })

  it("handles empty string", () => {
    expect(escapePostgrestLike("")).toBe("")
  })
})

describe("isSuspiciousQuery", () => {
  it("detects PostgREST .eq. injection", () => {
    expect(isSuspiciousQuery(",customer_email.neq.null")).toBe(true)
    expect(isSuspiciousQuery(",id.eq.1")).toBe(true)
    expect(isSuspiciousQuery(";id.gt.0")).toBe(true)
  })

  it("detects various PostgREST operators", () => {
    expect(isSuspiciousQuery(",field.lt.100")).toBe(true)
    expect(isSuspiciousQuery(",field.gte.0")).toBe(true)
    expect(isSuspiciousQuery(",field.ilike.%test%")).toBe(true)
    expect(isSuspiciousQuery(",field.is.null")).toBe(true)
    expect(isSuspiciousQuery(",field.in.(1,2,3)")).toBe(true)
    expect(isSuspiciousQuery(",field.not.null")).toBe(true)
  })

  it("allows normal queries", () => {
    expect(isSuspiciousQuery("1001")).toBe(false)
    expect(isSuspiciousQuery("#1001")).toBe(false)
    expect(isSuspiciousQuery("AB123456789BR")).toBe(false)
    expect(isSuspiciousQuery("john@example.com")).toBe(false)
    expect(isSuspiciousQuery("order-123")).toBe(false)
  })

  it("allows queries with dots that are not operators", () => {
    expect(isSuspiciousQuery("test.code")).toBe(false)
    expect(isSuspiciousQuery("v1.2.3")).toBe(false)
  })
})
