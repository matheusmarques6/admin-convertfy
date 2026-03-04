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

  it("should serialize Error objects with error and stack fields (AC 16.2.4)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    logger.error("msg", new Error("test"))
    expect(spy).toHaveBeenCalledTimes(1)
    const output = spy.mock.calls[0][0] as string
    expect(output).toContain("error")
    expect(output).toContain("stack")
    expect(output).toContain("test")
  })

  it("should serialize TypeError (Error subclass) with error and stack fields", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    logger.error("type error occurred", new TypeError("bad type"))
    expect(spy).toHaveBeenCalledTimes(1)
    const output = spy.mock.calls[0][0] as string
    expect(output).toContain("error")
    expect(output).toContain("stack")
    expect(output).toContain("bad type")
  })

  it("should keep plain objects unchanged", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    logger.info("msg", { foo: "bar" })
    expect(spy.mock.calls[0][0]).toContain("foo")
    expect(spy.mock.calls[0][0]).toContain("bar")
  })

  it("should wrap string values under value field", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    logger.info("msg", "string value")
    expect(spy.mock.calls[0][0]).toContain("value")
    expect(spy.mock.calls[0][0]).toContain("string value")
  })

  it("should omit data field when called without data", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    logger.error("no data call")
    expect(spy).toHaveBeenCalledTimes(1)
    const output = spy.mock.calls[0][0] as string
    expect(output).not.toContain('"data"')
  })
})
