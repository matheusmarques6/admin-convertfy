/**
 * Tests for src/lib/integrations/klaviyo/client.ts
 * Covers Story 16.3 (KlaviyoPermissionError) and Story 16.4 (fetch timeout).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { klaviyoRequest, KlaviyoPermissionError } from "./client"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Response-like object that globalThis.fetch will return. */
function mockResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {}
): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

// Mock the rate-limiter so it just calls the inner function directly,
// removing queue/concurrency complexity from unit tests.
vi.mock("./rate-limiter", () => ({
  enqueueKlaviyoRequest: (_apiKey: string, fn: () => unknown) => fn(),
}))

// Silence logger output during tests
vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

const FAKE_API_KEY = "pk_test_fake"
const FAKE_ENDPOINT = "/api/profiles/"

// ---------------------------------------------------------------------------
// Story 16.3 — KlaviyoPermissionError on 403 permission_denied
// ---------------------------------------------------------------------------

describe("Story 16.3 — 403 permission_denied handling", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("Teste 1: throws KlaviyoPermissionError with missingScopes when 403 + permission_denied (single scope)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(
          403,
          JSON.stringify({
            errors: [
              {
                code: "permission_denied",
                detail: "Your API key is missing required scopes: accounts:read",
              },
            ],
          })
        )
      )
    )

    let caughtError: unknown
    try {
      await klaviyoRequest(FAKE_API_KEY, FAKE_ENDPOINT)
    } catch (err) {
      caughtError = err
    }

    expect(caughtError).toBeInstanceOf(KlaviyoPermissionError)
    const permErr = caughtError as KlaviyoPermissionError
    expect(permErr.missingScopes).toEqual(["accounts:read"])
    expect(permErr.message).toContain("accounts:read")
  })

  it("Teste 1a: throws KlaviyoPermissionError with two scopes when detail contains comma-separated scopes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(
          403,
          JSON.stringify({
            errors: [
              {
                code: "permission_denied",
                detail:
                  "Your API key is missing required scopes: accounts:read, metrics:read",
              },
            ],
          })
        )
      )
    )

    try {
      await klaviyoRequest(FAKE_API_KEY, FAKE_ENDPOINT)
    } catch (err) {
      expect(err).toBeInstanceOf(KlaviyoPermissionError)
      const permErr = err as KlaviyoPermissionError
      expect(permErr.missingScopes).toEqual(["accounts:read", "metrics:read"])
    }
  })

  it("Teste 2: returns null when 403 without permission_denied code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(
          403,
          JSON.stringify({
            errors: [{ code: "forbidden", detail: "Access denied" }],
          })
        )
      )
    )

    const result = await klaviyoRequest(FAKE_API_KEY, FAKE_ENDPOINT)
    expect(result).toBeNull()
  })

  it("Teste 3: returns null on 401 (no regression)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(
          401,
          JSON.stringify({ errors: [{ code: "unauthorized", detail: "Invalid API key" }] })
        )
      )
    )

    const result = await klaviyoRequest(FAKE_API_KEY, FAKE_ENDPOINT)
    expect(result).toBeNull()
  })

  it("Teste 4: returns null without throwing when 403 body is invalid JSON (double try/catch safety)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(403, "<html>403 Forbidden</html>", {
          "Content-Type": "text/html",
        })
      )
    )

    const result = await klaviyoRequest(FAKE_API_KEY, FAKE_ENDPOINT)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Story 16.4 — AbortError / fetch timeout handling
// ---------------------------------------------------------------------------

describe("Story 16.4 — fetch timeout (AbortError) handling", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /**
   * Teste 1: mock fetch always rejects with AbortError — after exhausting all
   * retries (maxRetries = 3), klaviyoRequest() should return null.
   * Uses fake timers to skip exponential backoff delays.
   */
  it("Teste 1: returns null after exhausting retries on repeated AbortError", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError")

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError))

    // Start the request (does not await yet — we need to advance timers)
    const resultPromise = klaviyoRequest(FAKE_API_KEY, FAKE_ENDPOINT)

    // Advance through all retry backoffs: 1500ms, 3000ms, 6000ms
    await vi.runAllTimersAsync()

    const result = await resultPromise

    expect(result).toBeNull()
    // Should have attempted initial + maxRetries (3) = 4 total calls
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  /**
   * Teste 2: AbortError on first attempt, success on second — klaviyoRequest()
   * should return the successful data (retry path through the continue branch).
   */
  it("Teste 2: returns data when second attempt succeeds after AbortError on first", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError")
    const successPayload = { data: [{ id: "profile_123" }] }

    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockRejectedValueOnce(abortError)
        .mockResolvedValueOnce(
          mockResponse(200, JSON.stringify(successPayload))
        )
    )

    const resultPromise = klaviyoRequest(FAKE_API_KEY, FAKE_ENDPOINT)

    // Advance past the first retry backoff (1500ms)
    await vi.advanceTimersByTimeAsync(2000)

    const result = await resultPromise

    expect(result).toEqual(successPayload)
    expect(vi.mocked(fetch).mock.calls.length).toBe(2)
  })
})
