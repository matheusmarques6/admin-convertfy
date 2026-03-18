/**
 * CSV generation utilities with injection protection and UTF-8 BOM support.
 *
 * @module csv
 */

/** UTF-8 BOM prefix for Excel compatibility */
export const UTF8_BOM = "\uFEFF"

/**
 * Sanitize a CSV cell value to prevent formula injection.
 * Values starting with =, +, -, or @ are prefixed with a single quote
 * to prevent Excel/Sheets from interpreting them as formulas.
 */
export function sanitizeCsvValue(value: string): string {
  if (!value) return value
  const trimmed = value.trim()
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${trimmed}`
  }
  return trimmed
}

/**
 * Escape a single CSV field: wrap in quotes if it contains commas,
 * quotes, or newlines. Internal quotes are doubled.
 */
function escapeCsvField(value: string): string {
  const str = String(value ?? "")
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Generate a CSV string from headers and rows.
 * All values are sanitized against injection and properly escaped.
 * Includes UTF-8 BOM prefix for Excel compatibility.
 */
export function generateCsv(headers: string[], rows: string[][]): string {
  const headerLine = headers.map((h) => escapeCsvField(sanitizeCsvValue(h))).join(",")

  const dataLines = rows.map((row) =>
    row.map((cell) => escapeCsvField(sanitizeCsvValue(cell))).join(",")
  )

  return UTF8_BOM + [headerLine, ...dataLines].join("\r\n") + "\r\n"
}
