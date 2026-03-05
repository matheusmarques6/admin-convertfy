/**
 * Tests for src/lib/services/credentials.service.ts
 * Covers Story 16.6 — validateCredentialField() + updateStoreCredentials() integration
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { validateCredentialField } from "./credentials.service"

// ---------------------------------------------------------------------------
// Unit tests — validateCredentialField()
// ---------------------------------------------------------------------------

describe("Story 16.6 — validateCredentialField()", () => {
  it("accepts a normal ASCII API key without modification", () => {
    const key = "pk_abc123_DEF-456.xyz"
    expect(validateCredentialField("klaviyo_private_key", key)).toBe(key)
  })

  it("trims whitespace from both ends", () => {
    expect(validateCredentialField("klaviyo_api_key", "  pk_abc123  ")).toBe("pk_abc123")
  })

  it("trims newlines and tabs, accepts if remaining content is ASCII", () => {
    expect(validateCredentialField("shopify_access_token", "\n\tshpat_abc123\n")).toBe("shpat_abc123")
  })

  it("returns empty string for whitespace-only input (no throw)", () => {
    expect(validateCredentialField("klaviyo_api_key", "   ")).toBe("")
  })

  it("returns empty string for empty input (no throw)", () => {
    expect(validateCredentialField("klaviyo_api_key", "")).toBe("")
  })

  it("throws AppError 400 when key contains bullet point (U+2022)", () => {
    expect(() =>
      validateCredentialField("klaviyo_private_key", "pk_1234567890\u2022abcdef")
    ).toThrow("caracteres invalidos")
  })

  it("throws AppError 400 when key contains emoji", () => {
    expect(() =>
      validateCredentialField("klaviyo_api_key", "pk_test_\u{1F600}_key")
    ).toThrow("caracteres invalidos")
  })

  it("throws AppError 400 when key contains non-breaking space (U+00A0)", () => {
    expect(() =>
      validateCredentialField("shopify_api_key", "shpat_abc\u00A0def")
    ).toThrow("caracteres invalidos")
  })

  it("throws AppError 400 when key contains zero-width space (U+200B)", () => {
    expect(() =>
      validateCredentialField("klaviyo_private_key", "pk_abc\u200Bdef")
    ).toThrow("caracteres invalidos")
  })

  it("accepts keys with all printable ASCII characters (excluding leading/trailing space due to trim)", () => {
    // Range 0x21 (!) to 0x7E (~) — space (0x20) is trimmed at edges
    const allPrintableNoEdgeSpaces = "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~"
    expect(validateCredentialField("test_field", allPrintableNoEdgeSpaces)).toBe(allPrintableNoEdgeSpaces)
  })

  it("accepts keys with internal spaces (only trims edges)", () => {
    const keyWithSpaces = "pk_abc 123 def"
    expect(validateCredentialField("test_field", keyWithSpaces)).toBe(keyWithSpaces)
  })
})

// ---------------------------------------------------------------------------
// Integration tests — updateStoreCredentials()
// ---------------------------------------------------------------------------

// Mock encrypt to return a predictable value so we can inspect what was passed
const mockEncrypt = vi.fn((v: string) => `encrypted:${v}`)
const mockUpdate = vi.fn().mockReturnValue({ error: null })
const mockEq = vi.fn().mockReturnValue({ error: null })

vi.mock("@/lib/crypto", () => ({
  encrypt: (v: string) => mockEncrypt(v),
  decryptStoreCredentials: (s: unknown) => s,
  encryptCredentialsJson: (v: unknown) => JSON.stringify(v),
  decryptCredentialsJson: (v: unknown) => v,
}))

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (data: unknown) => {
        mockUpdate(data)
        return { eq: mockEq }
      },
      select: () => ({
        eq: () => ({
          single: () => ({ data: null, error: null }),
        }),
      }),
    }),
  }),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

describe("Story 16.6 — updateStoreCredentials() integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects klaviyo_private_key with non-ASCII characters (bullet point)", async () => {
    // Dynamic import to pick up mocks
    const { updateStoreCredentials } = await import("./credentials.service")

    await expect(
      updateStoreCredentials("store-1", {
        klaviyo_private_key: "pk_abc\u2022def",
      })
    ).rejects.toThrow("caracteres invalidos")

    // encrypt should NOT have been called — validation fails before encryption
    expect(mockEncrypt).not.toHaveBeenCalled()
    // DB update should NOT have been called
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("accepts and encrypts a valid klaviyo_private_key", async () => {
    const { updateStoreCredentials } = await import("./credentials.service")

    await updateStoreCredentials("store-1", {
      klaviyo_private_key: "pk_valid_key_123",
    })

    expect(mockEncrypt).toHaveBeenCalledWith("pk_valid_key_123")
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        klaviyo_private_key: "encrypted:pk_valid_key_123",
      })
    )
  })

  it("trims whitespace before encrypting", async () => {
    const { updateStoreCredentials } = await import("./credentials.service")

    await updateStoreCredentials("store-1", {
      klaviyo_api_key: "  pk_trimmed  ",
    })

    // Should encrypt the trimmed value, not the original
    expect(mockEncrypt).toHaveBeenCalledWith("pk_trimmed")
  })

  it("does NOT validate meta_access_token (OAuth field)", async () => {
    const { updateStoreCredentials } = await import("./credentials.service")

    // meta_access_token with non-ASCII — should NOT throw
    await updateStoreCredentials("store-1", {
      meta_access_token: "EAAx\u2022token",
    })

    // Should encrypt the raw value without validation
    expect(mockEncrypt).toHaveBeenCalledWith("EAAx\u2022token")
    expect(mockUpdate).toHaveBeenCalled()
  })

  it("validates shopify_access_token the same way as klaviyo keys", async () => {
    const { updateStoreCredentials } = await import("./credentials.service")

    await expect(
      updateStoreCredentials("store-1", {
        shopify_access_token: "shpat_\u2022invalid",
      })
    ).rejects.toThrow("caracteres invalidos")

    expect(mockEncrypt).not.toHaveBeenCalled()
  })
})
