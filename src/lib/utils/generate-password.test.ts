import { describe, it, expect } from "vitest"
import { generateTempPassword } from "./generate-password"

describe("generateTempPassword", () => {
  it("should generate a password with default length of 16", () => {
    const password = generateTempPassword()
    expect(password).toHaveLength(16)
  })

  it("should generate a password with custom length", () => {
    const password = generateTempPassword(24)
    expect(password).toHaveLength(24)
  })

  it("should contain at least one uppercase letter", () => {
    const password = generateTempPassword()
    expect(password).toMatch(/[A-Z]/)
  })

  it("should contain at least one lowercase letter", () => {
    const password = generateTempPassword()
    expect(password).toMatch(/[a-z]/)
  })

  it("should contain at least one digit", () => {
    const password = generateTempPassword()
    expect(password).toMatch(/[0-9]/)
  })

  it("should contain at least one special character", () => {
    const password = generateTempPassword()
    expect(password).toMatch(/[!@#$%&*\-_=+]/)
  })

  it("should generate unique passwords each time", () => {
    const passwords = new Set(Array.from({ length: 50 }, () => generateTempPassword()))
    expect(passwords.size).toBe(50)
  })

  it("should not contain ambiguous characters (0, O, 1, l, I)", () => {
    // Run multiple times to increase confidence
    for (let i = 0; i < 100; i++) {
      const password = generateTempPassword()
      expect(password).not.toMatch(/[0OlI1]/)
    }
  })
})
