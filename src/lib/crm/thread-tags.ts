/**
 * Normalização das tags de conversa do inbox (crm_threads.tags TEXT[]).
 *
 * Mesmo modelo de deals/leads: array de NOMES; a cor vem da registry
 * global `tags` por lookup de nome na UI. Regras: trim, descarta
 * vazias, dedupe case-insensitive PRESERVANDO a grafia da primeira
 * ocorrência, nome com até 60 chars, máximo de 20 tags por conversa.
 */

export const THREAD_TAG_MAX_LENGTH = 60
export const THREAD_TAGS_MAX_COUNT = 20

export function normalizeThreadTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tags) {
    const name = raw.trim().slice(0, THREAD_TAG_MAX_LENGTH)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(name)
    if (result.length >= THREAD_TAGS_MAX_COUNT) break
  }
  return result
}
