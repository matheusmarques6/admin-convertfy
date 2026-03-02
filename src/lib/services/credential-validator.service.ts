/**
 * Credential Validator Service
 *
 * Validates Shopify and Klaviyo credentials by making real API calls.
 * Used during credential save and manual revalidation.
 */

import { logger } from "@/lib/logger"

const log = logger.child("CredentialValidator")

const VALIDATION_TIMEOUT_MS = 10_000

export interface ValidationResult {
  valid: boolean
  error?: string
  tested_at: string // ISO 8601
}

/**
 * Normalize a Shopify domain to the canonical .myshopify.com format.
 * Strips protocol, trailing slashes, and appends .myshopify.com if missing.
 */
export function normalizeShopifyDomain(domain: string): string {
  let clean = domain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")

  if (!clean.includes(".myshopify.com")) {
    clean = clean.replace(/\.(com|com\.br|net|org|store|shop)$/i, "")
    clean = `${clean}.myshopify.com`
  }

  return clean
}

/**
 * Validate Shopify credentials by calling GET /admin/api/2024-10/shop.json
 */
export async function validateShopifyCredentials(
  domain: string,
  accessToken: string
): Promise<ValidationResult> {
  const testedAt = new Date().toISOString()

  if (!domain || !accessToken) {
    return { valid: false, error: "Domínio e Access Token são obrigatórios", tested_at: testedAt }
  }

  const cleanDomain = normalizeShopifyDomain(domain)

  const url = `https://${cleanDomain}/admin/api/2024-10/shop.json`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS)

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (response.ok) {
      log.info("Shopify credentials valid", { domain: cleanDomain })
      return { valid: true, tested_at: testedAt }
    }

    if (response.status === 401 || response.status === 403) {
      return {
        valid: false,
        error: "Access Token inválido ou sem permissões necessárias",
        tested_at: testedAt,
      }
    }

    if (response.status === 404) {
      return {
        valid: false,
        error: `Loja não encontrada: ${cleanDomain}`,
        tested_at: testedAt,
      }
    }

    return {
      valid: false,
      error: `Erro Shopify API: HTTP ${response.status}`,
      tested_at: testedAt,
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      log.warn("Shopify validation timeout", { domain: cleanDomain })
      return {
        valid: false,
        error: "Timeout: API Shopify não respondeu em 10 segundos",
        tested_at: testedAt,
      }
    }

    log.error("Shopify validation network error", { domain: cleanDomain, error: err })
    return {
      valid: false,
      error: "Erro de conexão com a API Shopify",
      tested_at: testedAt,
    }
  }
}

/**
 * Validate Klaviyo credentials by calling GET /api/metrics/?page[size]=1
 * Uses metrics:read scope (minimum scope the app needs) instead of accounts:read.
 */
export async function validateKlaviyoCredentials(
  apiKey: string
): Promise<ValidationResult> {
  const testedAt = new Date().toISOString()

  if (!apiKey) {
    return { valid: false, error: "API Key é obrigatória", tested_at: testedAt }
  }

  const url = "https://a.klaviyo.com/api/metrics/?page[size]=1"

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS)

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: "2024-10-15",
        Accept: "application/json",
      },
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (response.ok) {
      log.info("Klaviyo credentials valid")
      return { valid: true, tested_at: testedAt }
    }

    if (response.status === 401) {
      return {
        valid: false,
        error: "API Key inválida. Verifique e tente novamente.",
        tested_at: testedAt,
      }
    }

    if (response.status === 403) {
      return {
        valid: false,
        error: "API Key válida, mas sem permissão 'metrics:read'. Verifique os scopes da chave.",
        tested_at: testedAt,
      }
    }

    if (response.status === 429) {
      // Rate limited — credentials might be valid, treat as inconclusive
      log.warn("Klaviyo validation rate limited")
      return {
        valid: false,
        error: "Rate limit da API Klaviyo. Tente novamente em alguns minutos",
        tested_at: testedAt,
      }
    }

    return {
      valid: false,
      error: `Erro Klaviyo API: HTTP ${response.status}`,
      tested_at: testedAt,
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      log.warn("Klaviyo validation timeout")
      return {
        valid: false,
        error: "Timeout: API Klaviyo não respondeu em 10 segundos",
        tested_at: testedAt,
      }
    }

    log.error("Klaviyo validation network error", { error: err })
    return {
      valid: false,
      error: "Erro de conexão com a API Klaviyo",
      tested_at: testedAt,
    }
  }
}
