/**
 * Multi-language translation for tracking event descriptions.
 *
 * Flow:
 * 1. Detect if source text is Portuguese (Correios) or English (other providers)
 * 2. If source matches target language family → return as-is
 * 3. If source is PT → normalize to English first via PT→EN dict
 * 4. Translate English → target language via dictionary
 * 5. If dictionary fails → Google Translate API fallback (cached in Supabase)
 */

import { exactMatches as ptExact, patterns as ptPatterns } from "./translations/pt-BR"
import { exactMatches as frExact, patterns as frPatterns } from "./translations/fr"
import { exactMatches as esExact, patterns as esPatterns } from "./translations/es"
import { ptToEnExact, ptToEnPatterns, PT_MARKERS } from "./translations/pt-normalize"
import { translateViaAPI } from "./translation-api"
import { logger } from "@/lib/logger"

const log = logger.child("TranslateEvents")

// ─── Language Registry ──────────────────────────────────────────────────────

interface LangDict {
  exactMatches: Record<string, string>
  patterns: Array<{ pattern: RegExp; replacement: string }>
}

const LANG_DICTS: Record<string, LangDict> = {
  "pt-BR": { exactMatches: ptExact, patterns: ptPatterns },
  "pt": { exactMatches: ptExact, patterns: ptPatterns },
  "fr": { exactMatches: frExact, patterns: frPatterns },
  "es": { exactMatches: esExact, patterns: esPatterns },
}

// ─── PT Detection ───────────────────────────────────────────────────────────

/** Strip accents for matching */
function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/** Detect if text is likely Portuguese (from Correios or PT source) */
function isPortuguese(text: string): boolean {
  const normalized = stripAccents(text.toLowerCase())
  return PT_MARKERS.some(marker => normalized.includes(marker))
}

// ─── PT → EN Normalization ──────────────────────────────────────────────────

/** Normalize Portuguese text to English canonical form */
function normalizeToEnglish(text: string): string {
  // Try exact match (case-insensitive)
  const lower = text.toLowerCase()
  if (ptToEnExact[lower]) return ptToEnExact[lower]

  // Try contains-based pattern matching (accent-stripped)
  const normalized = stripAccents(lower)
  for (const { contains, en } of ptToEnPatterns) {
    if (normalized.includes(contains)) return en
  }

  // No match — return as-is
  return text
}

// ─── EN → Target Translation ───────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Translate English text to target language using a language dictionary */
function translateWithDict(text: string, dict: LangDict): string {
  const lowerText = text.toLowerCase()

  // 1. Try exact match
  if (dict.exactMatches[lowerText]) {
    return dict.exactMatches[lowerText]
  }

  // 2. Try pattern-based match
  for (const { pattern, replacement } of dict.patterns) {
    if (pattern.test(text)) {
      return text.replace(pattern, replacement)
    }
  }

  // 3. Try partial matching — only if match covers >75% of the text
  //    to avoid creating half-translated gibberish like "Your pacote has chegou"
  let bestMatch = ""
  let bestTranslation = ""
  for (const [en, localized] of Object.entries(dict.exactMatches)) {
    if (lowerText.includes(en) && en.length > bestMatch.length) {
      bestMatch = en
      bestTranslation = localized
    }
  }
  if (bestMatch && bestTranslation) {
    const coverage = bestMatch.length / lowerText.length
    if (coverage >= 0.75) {
      const regex = new RegExp(escapeRegex(bestMatch), "i")
      return text.replace(regex, bestTranslation)
    }
  }

  return text
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Translate a tracking event description to the target language.
 * Uses dictionary first, falls back to Google Translate API (cached).
 *
 * @param description - Event description (English or Portuguese source)
 * @param targetLang - Target language code (default: "pt-BR")
 */
export async function translateEventDescription(description: string, targetLang = "pt-BR"): Promise<string> {
  if (!description) return ""

  let text = description.trim()

  // Remove trailing period for matching, add back later if needed
  const hadPeriod = text.endsWith(".")
  if (hadPeriod) text = text.slice(0, -1)

  const sourceLang = isPortuguese(text) ? "pt" : "en"

  // Source matches target family → return as-is (no translation needed)
  if (sourceLang === "pt" && (targetLang === "pt-BR" || targetLang === "pt")) {
    return description
  }
  if (sourceLang === "en" && (targetLang === "en" || targetLang === "en-US")) {
    return description
  }

  // If source is PT, normalize to English first
  const enText = sourceLang === "pt" ? normalizeToEnglish(text) : text

  // If target is English, return normalized text
  if (targetLang === "en" || targetLang === "en-US") {
    return enText
  }

  // Translate English → target language via dictionary
  const dict = LANG_DICTS[targetLang]
  if (dict) {
    const translated = translateWithDict(enText, dict)
    if (translated !== enText) {
      return translated
    }
  }

  // Dictionary failed → try Google Translate API (with cache)
  try {
    const apiResult = await translateViaAPI(enText, targetLang)
    if (apiResult) {
      return apiResult
    }
  } catch (err) {
    log.warn("Translation API fallback failed", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // All translation failed — log for debugging
  log.warn("untranslated_event", { text: enText, lang: targetLang })

  if (sourceLang === "pt") {
    return description
  }
  return description
}

/**
 * Translate an array of tracking events.
 */
export async function translateTrackingEvents(
  events: Array<{ date: string; description: string; location?: string; status?: string }>,
  targetLang = "pt-BR"
): Promise<Array<{ date: string; description: string; location?: string; status?: string }>> {
  const translated = await Promise.all(
    events.map(async (event) => ({
      ...event,
      description: await translateEventDescription(event.description, targetLang),
    }))
  )
  return translated
}

/**
 * Translate status_detail and last_event fields of a tracking result.
 */
export async function translateTrackingResult<T extends {
  status_detail?: string
  last_event?: string
  events?: Array<{ date: string; description: string; location?: string; status?: string }>
}>(result: T, targetLang = "pt-BR"): Promise<T> {
  const [status_detail, last_event, events] = await Promise.all([
    result.status_detail ? translateEventDescription(result.status_detail, targetLang) : Promise.resolve(result.status_detail),
    result.last_event ? translateEventDescription(result.last_event, targetLang) : Promise.resolve(result.last_event),
    result.events ? translateTrackingEvents(result.events, targetLang) : Promise.resolve(result.events),
  ])

  return {
    ...result,
    status_detail,
    last_event,
    events,
  }
}
