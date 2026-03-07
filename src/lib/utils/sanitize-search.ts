/**
 * Sanitize search input for Supabase .ilike() / .or() interpolation.
 * Escapes special ILIKE characters (%, _, \) and PostgREST filter
 * syntax characters (comma, parentheses) to prevent filter injection.
 *
 * Reference: src/app/api/stores/control/route.ts (original inline version)
 */
export function sanitizeSearch(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, '\\,')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}
