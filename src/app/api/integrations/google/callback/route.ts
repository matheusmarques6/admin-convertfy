import { NextRequest, NextResponse } from "next/server"
import { updateStoreCredentials } from "@/lib/services/credentials.service"
import { saveTokens } from "@/lib/services/google-auth.service"
import { logger } from "@/lib/logger"

const log = logger.child("GoogleCallback")

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

interface OAuthStateData {
  user_id: string
  user_type: "profile" | "portal_user" | "org"
  scope: string
  org_id: string
  store_id: string
  target?: string
  return_to?: string
  nonce: string
  timestamp: number
  context: string
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    if (error) {
      const ALLOWED_OAUTH_ERRORS = ["access_denied", "server_error", "invalid_scope"]
      const sanitizedError = ALLOWED_OAUTH_ERRORS.includes(error) ? error : "unknown_error"
      log.error("Google OAuth error:", { error: sanitizedError })
      return NextResponse.redirect(
        new URL(`/settings/integrations?error=${sanitizedError}`, request.url)
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=missing_params", request.url)
      )
    }

    // Validate state against cookie
    const storedState = request.cookies.get("google_oauth_state")?.value
    if (!storedState) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=missing_state_cookie", request.url)
      )
    }

    // AC 42.3.4 — Decode both states and validate nonce field-by-field
    let stateData: OAuthStateData
    let storedStateData: OAuthStateData
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString())
      storedStateData = JSON.parse(Buffer.from(storedState, "base64").toString())
    } catch {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=invalid_state_format", request.url)
      )
    }

    // Validate nonce (C2 anti-CSRF)
    if (!stateData.nonce || stateData.nonce !== storedStateData.nonce) {
      log.warn("Nonce mismatch in OAuth state", {
        receivedNonce: stateData.nonce,
        expectedNonce: storedStateData.nonce,
      })
      return NextResponse.redirect(
        new URL("/settings/integrations?error=invalid_state", request.url)
      )
    }

    // Check state expiration (10 minutes)
    if (Date.now() - stateData.timestamp > 600000) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=state_expired", request.url)
      )
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`,
      }).toString(),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      log.error("Google token exchange error:", {
        status: tokenResponse.status,
        error: errorData?.error || "unknown",
      })
      return NextResponse.redirect(
        new URL(buildRedirectUrl(stateData, "token_exchange_failed"), request.url)
      )
    }

    const tokens = await tokenResponse.json()

    // Get user info from Google
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    )

    const userInfo = await userInfoResponse.json()

    // AC 42.3.5 + AC 42.3.7: Route based on scope
    if (stateData.scope === "calendar") {
      // Calendar flow: save to user_google_tokens via google-auth.service
      await saveTokens(
        stateData.user_id,
        stateData.user_type || "profile",
        stateData.org_id,
        {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: tokens.token_type,
          expires_in: tokens.expires_in,
          scope: tokens.scope || "",
        },
        {
          email: userInfo.email,
          id: userInfo.id,
        }
      )

      log.info("Google Calendar tokens saved to user_google_tokens", {
        userId: stateData.user_id,
        userType: stateData.user_type,
        googleEmail: userInfo.email,
        hasRefreshToken: !!tokens.refresh_token,
      })
    } else if (stateData.store_id) {
      // AC 42.3.7: Existing flow — save to client_stores (Ads/per-store)
      const integrationKey = stateData.scope === "calendar" ? "google_calendar" : "google_ads" as const
      const credentialField = integrationKey === "google_calendar"
        ? "google_calendar_credentials"
        : "google_ads_credentials"

      await updateStoreCredentials(
        stateData.store_id,
        {
          [credentialField]: {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_type: tokens.token_type,
            expires_in: tokens.expires_in.toString(),
            email: userInfo.email,
          },
        },
        integrationKey
      )

      log.info("Google credentials saved to client_stores", {
        storeId: stateData.store_id,
        type: integrationKey,
      })
    } else {
      log.warn("No store_id in state for non-calendar scope — credentials not saved", {
        scope: stateData.scope,
      })
    }

    // AC 42.3.8: Context-based redirect
    const redirectUrl = buildRedirectUrl(stateData)

    const response = NextResponse.redirect(
      new URL(redirectUrl, request.url)
    )
    response.cookies.delete("google_oauth_state")

    return response
  } catch (error) {
    log.error("Error in Google OAuth callback:", {
      message: error instanceof Error ? error.message : "unknown",
    })
    return NextResponse.redirect(
      new URL("/settings/integrations?error=callback_failed", request.url)
    )
  }
}

/**
 * Build redirect URL based on state context and scope.
 * AC 42.3.8:
 * - calendar + admin → /admin/settings?tab=integrations&success=google_calendar_connected
 * - calendar + portal → /client/settings?success=google_calendar_connected
 * - ads → /settings/integrations?success=google_connected (existing behavior)
 */
function buildRedirectUrl(stateData: OAuthStateData, error?: string): string {
  if (stateData.scope === "calendar") {
    if (stateData.context === "portal") {
      return error
        ? `/client/settings?error=${error}`
        : "/client/settings?success=google_calendar_connected"
    }

    // admin: volta pra pagina de origem com o modal de Integracoes aberto,
    // preservando o contexto do app (as Configuracoes viraram modal via
    // ?settings=integrations). Fallback para uma pagina admin quando nao ha
    // return_to valido.
    const validReturn =
      stateData.return_to &&
      (stateData.return_to.startsWith("/admin") || stateData.return_to.startsWith("/client"))
        ? stateData.return_to
        : ""

    const url = new URL(validReturn || "/admin/dashboard", "http://local")
    // Abre o modal de Integracoes apenas quando o retorno JA aponta pra ele
    // (fluxo das Configuracoes) ou quando nao ha return_to valido (fallback).
    // Retornos de paginas normais (ex.: /admin/meetings) NAO abrem o modal —
    // a confirmacao acontece na propria pagina.
    const wantsSettingsModal =
      !validReturn || url.searchParams.get("settings") === "integrations"
    if (wantsSettingsModal) url.searchParams.set("settings", "integrations")
    const successVal =
      stateData.target === "org"
        ? "google_org_calendar_connected"
        : "google_calendar_connected"
    if (error) url.searchParams.set("error", error)
    else url.searchParams.set("success", successVal)
    // Remove params sensiveis/obsoletos que possam ter vindo do return_to
    url.searchParams.delete("tab")
    return url.pathname + url.search
  }

  // Existing behavior for ads/other scopes
  return error
    ? `/settings/integrations?error=${error}`
    : "/settings/integrations?success=google_connected"
}
