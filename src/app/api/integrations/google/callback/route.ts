import { NextRequest, NextResponse } from "next/server"
import { updateStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"

const log = logger.child("GoogleCallback")

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    if (error) {
      log.error("Google OAuth error:", error)
      return NextResponse.redirect(
        new URL(`/settings/integrations?error=${error}`, request.url)
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=missing_params", request.url)
      )
    }

    // Validate state
    const storedState = request.cookies.get("google_oauth_state")?.value
    if (state !== storedState) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=invalid_state", request.url)
      )
    }

    // Decode state
    let stateData: { user_id: string; scope: string; store_id: string; timestamp: number }
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString())
    } catch {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=invalid_state_format", request.url)
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
      log.error("Google token exchange error:", errorData)
      return NextResponse.redirect(
        new URL("/settings/integrations?error=token_exchange_failed", request.url)
      )
    }

    const tokens = await tokenResponse.json()

    // Get user info to verify
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    )

    const userInfo = await userInfoResponse.json()

    // Determine integration type based on scope
    const integrationKey = stateData.scope === "calendar" ? "google_calendar" : "google_ads" as const

    // Save credentials to client_stores (unified credential storage)
    if (stateData.store_id) {
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
      log.warn("No store_id in state - Google credentials not saved to client_stores")
    }

    // Clear state cookie and redirect
    const response = NextResponse.redirect(
      new URL("/settings/integrations?success=google_connected", request.url)
    )
    response.cookies.delete("google_oauth_state")

    return response
  } catch (error) {
    log.error("Error in Google OAuth callback:", error)
    return NextResponse.redirect(
      new URL("/settings/integrations?error=callback_failed", request.url)
    )
  }
}
