type LogLevel = "debug" | "info" | "warn" | "error"

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: string
  data?: Record<string, unknown>
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL as LogLevel | undefined
  if (env && env in LOG_LEVELS) return env
  return process.env.NODE_ENV === "production" ? "info" : "debug"
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[getMinLevel()]
}

function formatEntry(entry: LogEntry): string {
  if (process.env.NODE_ENV === "production") {
    return JSON.stringify(entry)
  }

  const prefix = {
    debug: "\x1b[36m[DEBUG]\x1b[0m",
    info: "\x1b[32m[INFO]\x1b[0m",
    warn: "\x1b[33m[WARN]\x1b[0m",
    error: "\x1b[31m[ERROR]\x1b[0m",
  }[entry.level]

  const ctx = entry.context ? ` [${entry.context}]` : ""
  const data = entry.data ? ` ${JSON.stringify(entry.data)}` : ""
  return `${prefix}${ctx} ${entry.message}${data}`
}

function normalizeData(data: unknown): Record<string, unknown> | undefined {
  if (!data) return undefined
  if (data instanceof Error) return { error: data.message, stack: data.stack }
  if (typeof data === "object" && data !== null && !Array.isArray(data)) return data as Record<string, unknown>
  return { value: data }
}

function emit(entry: LogEntry) {
  const formatted = formatEntry(entry)

  switch (entry.level) {
    case "error":
      console.error(formatted)
      break
    case "warn":
      console.warn(formatted)
      break
    default:
      console.log(formatted)
  }
}

function log(level: LogLevel, message: string, data?: Record<string, unknown> | unknown) {
  if (!shouldLog(level)) return

  emit({
    level,
    message,
    timestamp: new Date().toISOString(),
    data: normalizeData(data),
  })
}

function logWithContext(level: LogLevel, message: string, context: string, data?: Record<string, unknown> | unknown) {
  if (!shouldLog(level)) return

  emit({
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
    data: normalizeData(data),
  })
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown> | unknown) => log("debug", message, data),
  info: (message: string, data?: Record<string, unknown> | unknown) => log("info", message, data),
  warn: (message: string, data?: Record<string, unknown> | unknown) => log("warn", message, data),
  error: (message: string, data?: Record<string, unknown> | unknown) => log("error", message, data),

  /** Create a child logger with fixed context */
  child: (context: string) => ({
    debug: (message: string, data?: Record<string, unknown> | unknown) =>
      logWithContext("debug", message, context, data),
    info: (message: string, data?: Record<string, unknown> | unknown) =>
      logWithContext("info", message, context, data),
    warn: (message: string, data?: Record<string, unknown> | unknown) =>
      logWithContext("warn", message, context, data),
    error: (message: string, data?: Record<string, unknown> | unknown) =>
      logWithContext("error", message, context, data),
  }),
}
