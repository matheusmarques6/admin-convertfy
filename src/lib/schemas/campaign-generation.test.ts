/**
 * Tests for campaign generation Zod schemas.
 * Validates request body shapes for generate and webhook-callback endpoints.
 */

import { describe, it, expect } from "vitest"
import { generateRequestSchema, webhookCallbackSchema } from "./campaign-generation"

// ─────────────────────────────────────────────────────────────────────────────
// Generate Request Schema
// ─────────────────────────────────────────────────────────────────────────────

describe("generateRequestSchema", () => {
  it("accepts valid request with all fields", () => {
    const result = generateRequestSchema.safeParse({
      name: "Black Friday 2026",
      date: "2026-11-27",
      reference_doc_url: "https://drive.google.com/doc/123",
      store_ids: ["550e8400-e29b-41d4-a716-446655440000"],
      generation_id: "550e8400-e29b-41d4-a716-446655440001",
    })
    expect(result.success).toBe(true)
  })

  it("accepts request without optional fields", () => {
    const result = generateRequestSchema.safeParse({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty name", () => {
    const result = generateRequestSchema.safeParse({
      name: "",
      date: "2026-11-27",
      store_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid date format", () => {
    const cases = ["27/11/2026", "2026-1-1", "Nov 27 2026", "2026/11/27"]
    for (const date of cases) {
      const result = generateRequestSchema.safeParse({
        name: "BF",
        date,
        store_ids: ["550e8400-e29b-41d4-a716-446655440000"],
      })
      expect(result.success, `Expected "${date}" to be rejected`).toBe(false)
    }
  })

  it("rejects empty store_ids array", () => {
    const result = generateRequestSchema.safeParse({
      name: "BF",
      date: "2026-11-27",
      store_ids: [],
    })
    expect(result.success).toBe(false)
  })

  it("rejects non-UUID store_ids", () => {
    const result = generateRequestSchema.safeParse({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["not-a-uuid"],
    })
    expect(result.success).toBe(false)
  })

  it("accepts null reference_doc_url", () => {
    const result = generateRequestSchema.safeParse({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["550e8400-e29b-41d4-a716-446655440000"],
      reference_doc_url: null,
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid reference_doc_url", () => {
    const result = generateRequestSchema.safeParse({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["550e8400-e29b-41d4-a716-446655440000"],
      reference_doc_url: "not-a-url",
    })
    expect(result.success).toBe(false)
  })

  it("accepts null generation_id (new campaign)", () => {
    const result = generateRequestSchema.safeParse({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["550e8400-e29b-41d4-a716-446655440000"],
      generation_id: null,
    })
    expect(result.success).toBe(true)
  })

  it("accepts multiple store_ids", () => {
    const result = generateRequestSchema.safeParse({
      name: "BF",
      date: "2026-11-27",
      store_ids: [
        "550e8400-e29b-41d4-a716-446655440000",
        "550e8400-e29b-41d4-a716-446655440001",
        "550e8400-e29b-41d4-a716-446655440002",
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects name exceeding 255 characters", () => {
    const result = generateRequestSchema.safeParse({
      name: "A".repeat(256),
      date: "2026-11-27",
      store_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    })
    expect(result.success).toBe(false)
  })

  it("accepts duplicate store_ids at schema level (dedup is route logic)", () => {
    const result = generateRequestSchema.safeParse({
      name: "BF",
      date: "2026-11-27",
      store_ids: [
        "550e8400-e29b-41d4-a716-446655440000",
        "550e8400-e29b-41d4-a716-446655440000",
      ],
    })
    // Schema accepts — deduplication is a business logic concern, not validation
    expect(result.success).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Callback Schema
// ─────────────────────────────────────────────────────────────────────────────

describe("webhookCallbackSchema", () => {
  it("accepts valid callback with all stores done", () => {
    const result = webhookCallbackSchema.safeParse({
      generation_id: "550e8400-e29b-41d4-a716-446655440000",
      drive_folder_id: "abc123",
      drive_folder_url: "https://drive.google.com/drive/folders/abc123",
      stores: [
        { store_id: "550e8400-e29b-41d4-a716-446655440001", status: "done" },
        { store_id: "550e8400-e29b-41d4-a716-446655440002", status: "done" },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("accepts callback with partial errors", () => {
    const result = webhookCallbackSchema.safeParse({
      generation_id: "550e8400-e29b-41d4-a716-446655440000",
      drive_folder_id: "abc123",
      drive_folder_url: "https://drive.google.com/drive/folders/abc123",
      stores: [
        { store_id: "550e8400-e29b-41d4-a716-446655440001", status: "done" },
        { store_id: "550e8400-e29b-41d4-a716-446655440002", status: "error", error_message: "Timeout" },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid generation_id", () => {
    const result = webhookCallbackSchema.safeParse({
      generation_id: "not-a-uuid",
      stores: [],
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid store status", () => {
    const result = webhookCallbackSchema.safeParse({
      generation_id: "550e8400-e29b-41d4-a716-446655440000",
      stores: [
        { store_id: "550e8400-e29b-41d4-a716-446655440001", status: "invalid" },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("accepts callback without drive info (empty stores)", () => {
    const result = webhookCallbackSchema.safeParse({
      generation_id: "550e8400-e29b-41d4-a716-446655440000",
      stores: [],
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing generation_id", () => {
    const result = webhookCallbackSchema.safeParse({
      stores: [],
    })
    expect(result.success).toBe(false)
  })
})
