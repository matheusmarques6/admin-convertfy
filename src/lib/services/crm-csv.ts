/**
 * Geração de CSV no client (export de negócios e leads).
 *
 * Decisões pensadas pro destino real — Excel/Sheets em pt-BR:
 *   - separador ";" (vírgula é decimal em pt-BR; "," quebraria colunas)
 *   - BOM UTF-8 (sem ele o Excel Windows lê acento como mojibake)
 *   - célula é escapada quando contém ; " quebra de linha
 *   - fórmulas neutralizadas (= + - @ no início viram texto com ')
 *     — CSV injection é vetor real em export de CRM
 */

export const CSV_SEPARATOR = ";"
export const CSV_BOM = "﻿"

export function csvCell(value: unknown): string {
  if (value == null) return ""
  let s = String(value)
  // Neutraliza injeção de fórmula ANTES do quoting.
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  if (s.includes(CSV_SEPARATOR) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Monta o arquivo: header + linhas. Valores numéricos com vírgula decimal. */
export function toCsv(
  header: string[],
  rows: Array<Array<unknown>>,
): string {
  const lines = [header.map(csvCell).join(CSV_SEPARATOR)]
  for (const row of rows) {
    lines.push(row.map(csvCell).join(CSV_SEPARATOR))
  }
  return CSV_BOM + lines.join("\r\n")
}

/** Número no formato que o Excel pt-BR entende como número (vírgula). */
export function csvNumber(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return ""
  return String(v).replace(".", ",")
}

/** Data ISO → dd/mm/aaaa (vazio quando nula). */
export function csvDate(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("pt-BR")
}

/** Dispara o download no browser. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
