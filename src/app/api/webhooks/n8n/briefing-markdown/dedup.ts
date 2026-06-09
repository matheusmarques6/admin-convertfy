/**
 * Lógica pura (testável) do callback briefing-markdown: decide se o markdown
 * recebido é duplicata do `current` do n8n (no-op) e qual a próxima `version`.
 */

export interface BriefingMarkdownRow {
  version: number | null
  briefing_data: { markdown?: string } | null
  generated_by: string | null
  status: string | null
}

export function resolveMarkdownWrite(
  rows: BriefingMarkdownRow[],
  newMarkdown: string,
): { deduped: boolean; nextVersion: number } {
  const maxVersion = rows.reduce((m, r) => Math.max(m, r.version ?? 0), 0)
  const currentMarkdown = rows.find(
    (r) => r.status === "current" && r.generated_by === "n8n:briefing-markdown",
  )?.briefing_data?.markdown
  const deduped = !!currentMarkdown && currentMarkdown === newMarkdown
  return { deduped, nextVersion: maxVersion + 1 }
}
