/**
 * Google Translate API fallback for tracking event translations.
 * Uses the free v2 endpoint with API key.
 * Results are cached in Supabase `tracking_translations` table.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import crypto from "crypto"

const log = logger.child("TranslationAPI")

const GOOGLE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || ""
const GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2"

/** In-memory cache to avoid repeated DB lookups within same instance */
const memoryCache = new Map<string, string>()
const MAX_MEMORY_CACHE = 2000

function hashText(text: string, lang: string): string {
  return crypto.createHash("sha256").update(`${lang}:${text.toLowerCase().trim()}`).digest("hex")
}

/**
 * Translate text using Google Translate API with Supabase cache.
 * Returns null if translation is unavailable (no API key, error, etc.)
 */
export async function translateViaAPI(
  text: string,
  targetLang: string
): Promise<string | null> {
  if (!GOOGLE_API_KEY || !text.trim()) return null

  const normalizedText = text.trim()
  const hash = hashText(normalizedText, targetLang)

  // 1. Check in-memory cache
  const memKey = `${hash}`
  if (memoryCache.has(memKey)) {
    return memoryCache.get(memKey)!
  }

  // 2. Check Supabase cache
  try {
    const admin = createAdminClient()
    const { data: cached } = await admin
      .from("tracking_translations")
      .select("translated_text")
      .eq("source_hash", hash)
      .eq("target_lang", targetLang)
      .single()

    if (cached) {
      if (memoryCache.size < MAX_MEMORY_CACHE) {
        memoryCache.set(memKey, cached.translated_text)
      }
      return cached.translated_text
    }
  } catch {
    // Cache miss — continue to API
  }

  // 3. Call Google Translate API
  // Map language codes to Google format
  const googleLang = targetLang === "pt-BR" ? "pt" : targetLang
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(
      `${GOOGLE_TRANSLATE_URL}?key=${encodeURIComponent(GOOGLE_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: normalizedText,
          source: "en",
          target: googleLang,
          format: "text",
        }),
        signal: controller.signal,
      }
    )
    clearTimeout(timeout)

    if (!response.ok) {
      log.warn("Google Translate API error", { status: response.status })
      return null
    }

    const data = await response.json()
    const translated = data?.data?.translations?.[0]?.translatedText

    if (!translated) {
      log.warn("Google Translate returned empty result", { text: normalizedText })
      return null
    }

    // 4. Cache in memory
    if (memoryCache.size < MAX_MEMORY_CACHE) {
      memoryCache.set(memKey, translated)
    }

    // 5. Cache in Supabase (fire and forget)
    try {
      const admin = createAdminClient()
      await admin
        .from("tracking_translations")
        .upsert(
          {
            source_hash: hash,
            source_text: normalizedText,
            target_lang: targetLang,
            translated_text: translated,
          },
          { onConflict: "source_hash,target_lang" }
        )
    } catch (err) {
      log.warn("Failed to cache translation", {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    log.info("Translated via Google API", {
      source: normalizedText.slice(0, 60),
      translated: translated.slice(0, 60),
      lang: targetLang,
    })

    return translated
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      log.warn("Google Translate timeout")
    } else {
      log.warn("Google Translate error", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return null
  }
}
