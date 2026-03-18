/**
 * Credential Validator Service
 *
 * Validates Shopify and Klaviyo credentials by making real API calls.
 * Used during credential save and manual revalidation.
 */

import { logger } from "@/lib/logger"
import { KLAVIYO_REVISION } from "@/lib/integrations/klaviyo/client"

const log = logger.child("CredentialValidator")

const VALIDATION_TIMEOUT_MS = 10_000

export interface ValidationResult {
  valid: boolean
  error?: string
  tested_at: string // ISO 8601
  missingScopes?: string[]
  hasReportingAccess?: boolean
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

const KLAVIYO_SCOPE_CHECKS: { scope: string; url: string }[] = [
  { scope: "accounts:read", url: "https://a.klaviyo.com/api/accounts/" },
  { scope: "campaigns:read", url: "https://a.klaviyo.com/api/campaigns/" },
  { scope: "flows:read", url: "https://a.klaviyo.com/api/flows/" },
]

/**
 * Check which Klaviyo scopes are missing by probing each endpoint in parallel.
 * Returns an array of missing scope names.
 */
async function checkKlaviyoScopes(apiKey: string): Promise<string[]> {
  const results = await Promise.allSettled(
    KLAVIYO_SCOPE_CHECKS.map(async ({ scope, url }) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS)

      try {
        const res = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Klaviyo-API-Key ${apiKey}`,
            revision: KLAVIYO_REVISION,
            Accept: "application/json",
          },
          signal: controller.signal,
        })

        clearTimeout(timeout)

        if (res.status === 403) {
          return scope // missing
        }
        // 200 = scope OK, 429 = rate limited (skip)
        return null
      } catch {
        clearTimeout(timeout)
        log.warn("Klaviyo scope check failed", { scope, url })
        return null // Timeout or network error — don't report as missing
      }
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value)
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

  const url = "https://a.klaviyo.com/api/metrics/"

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS)

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: KLAVIYO_REVISION,
        Accept: "application/json",
      },
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (response.ok) {
      log.info("Klaviyo credentials valid, checking scopes...")
      const missingScopes = await checkKlaviyoScopes(apiKey)
      if (missingScopes.length > 0) {
        log.warn("Klaviyo missing scopes", { missingScopes })
      }
      return {
        valid: true,
        tested_at: testedAt,
        hasReportingAccess: true, // metrics:read confirmed (this endpoint succeeded)
        missingScopes: missingScopes.length > 0 ? missingScopes : undefined,
      }
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
        error: "Scopes insuficientes: a chave não tem permissão 'metrics:read'. No Klaviyo, vá em Settings → API Keys, edite a chave e ative os scopes necessários.",
        missingScopes: ["metrics:read"],
        tested_at: testedAt,
      }
    }

    if (response.status === 429) {
      // Rate limited — the key IS valid, just temporarily throttled.
      // Treating as invalid would cause a persistent false "connection error".
      log.warn("Klaviyo validation rate limited — treating as valid (key works, just throttled)")
      return {
        valid: true,
        error: "API Klaviyo temporariamente limitada (rate limit). Dados podem demorar a carregar.",
        tested_at: testedAt,
      }
    }

    // Log response body for unexpected status codes to aid debugging
    const responseText = await response.text().catch(() => "(failed to read body)")
    log.error("Klaviyo validation unexpected status", {
      status: response.status,
      apiKeyPrefix: apiKey.substring(0, 10) + "...",
      apiKeyLength: apiKey.length,
      responseBody: responseText.substring(0, 500),
    })

    // Try to detect scope errors in the response body (e.g. HTTP 400 with scope detail)
    const scopeMatch = responseText.match(/missing required scopes[:\s]+([^\\"]+)/i)
    if (scopeMatch) {
      const scopes = scopeMatch[1].trim().split(/[\s,]+/).filter(Boolean)
      return {
        valid: false,
        error: `Scopes insuficientes: ${scopes.join(", ")}. No Klaviyo, vá em Settings → API Keys e ative os scopes necessários.`,
        missingScopes: scopes,
        tested_at: testedAt,
      }
    }

    return {
      valid: false,
      error: `Erro na API Klaviyo (HTTP ${response.status}). Verifique se a chave é uma Private API Key válida.`,
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
