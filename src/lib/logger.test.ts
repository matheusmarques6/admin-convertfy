import { describe, it, expect, vi, beforeEach } from "vitest"
import { logger } from "./logger"

describe("logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("should log info messages", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    logger.info("Test message")
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toContain("Test message")
  })

  it("should log error messages", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    logger.error("Error occurred")
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toContain("Error occurred")
  })

  it("should log warn messages", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    logger.warn("Warning message")
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toContain("Warning message")
  })

  it("should include data in log output", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    logger.info("With data", { userId: "123" })
    expect(spy.mock.calls[0][0]).toContain("userId")
  })

  it("should create child loggers with context", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    const childLogger = logger.child("AuthModule")
    childLogger.info("Auth event")
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toContain("Auth event")
  })
})
