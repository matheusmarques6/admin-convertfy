import { NextRequest, NextResponse } from "next/server"
import { updateStoreCredentials } from "@/lib/services/credentials.service"
import { AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("MetaCallback")

const META_TOKEN_URL = "https://graph.facebook.com/v18.0/oauth/access_token"
const META_GRAPH_URL = "https://graph.facebook.com/v18.0"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    if (error) {
      const ALLOWED_OAUTH_ERRORS = ["access_denied", "server_error", "invalid_scope"]
      const sanitizedError = ALLOWED_OAUTH_ERRORS.includes(error) ? error : "unknown_error"
      log.error("Meta OAuth error:", { error: sanitizedError })
      return NextResponse.redirect(
        new URL(`/settings/integrations?error=${sanitizedError}`, request.url)
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=missing_params", request.url)
      )
    }

    // Validate state
    const storedState = request.cookies.get("meta_oauth_state")?.value
    if (state !== storedState) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=invalid_state", request.url)
      )
    }

    // Decode state
    let stateData: { user_id: string; scope: string; store_id: string; timestamp: number; org_id?: string }
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

    // Exchange code for short-lived token
    const tokenResponse = await fetch(
      `${META_TOKEN_URL}?` +
        new URLSearchParams({
          client_id: process.env.META_APP_ID!,
          client_secret: process.env.META_APP_SECRET!,
          code,
          redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/meta/callback`,
        }).toString()
    )

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      log.error("Meta token exchange error:", {
        status: tokenResponse.status,
        error: errorData?.error?.message || errorData?.error || "unknown",
      })
      return NextResponse.redirect(
        new URL("/settings/integrations?error=token_exchange_failed", request.url)
      )
    }

    const shortLivedToken = await tokenResponse.json()

    // Exchange for long-lived token
    const longLivedResponse = await fetch(
      `${META_TOKEN_URL}?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: process.env.META_APP_ID!,
          client_secret: process.env.META_APP_SECRET!,
          fb_exchange_token: shortLivedToken.access_token,
        }).toString()
    )

    const longLivedToken = await longLivedResponse.json()
    const accessToken = longLivedToken.access_token || shortLivedToken.access_token

    // Get user info
    const userInfoResponse = await fetch(
      `${META_GRAPH_URL}/me?fields=id,name,email`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const userInfo = await userInfoResponse.json()

    // Get ad accounts if ads scope
    let adAccountId: string | undefined
    if (stateData.scope === "ads" || stateData.scope === "all") {
      const adAccountsResponse = await fetch(
        `${META_GRAPH_URL}/me/adaccounts?fields=id,account_id,name`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const adAccountsData = await adAccountsResponse.json()

      if (adAccountsData.data && adAccountsData.data.length > 0) {
        adAccountId = adAccountsData.data[0].id
      }
    }

    // Get Instagram account if instagram scope
    let instagramAccountId: string | undefined
    if (stateData.scope === "instagram" || stateData.scope === "all") {
      const pagesResponse = await fetch(
        `${META_GRAPH_URL}/me/accounts?fields=id,instagram_business_account`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const pagesData = await pagesResponse.json()

      for (const page of pagesData.data || []) {
        if (page.instagram_business_account) {
          instagramAccountId = page.instagram_business_account.id
          break
        }
      }
    }

    // Extract org_id from state (added in 56.2; may be absent in legacy flows)
    const orgId = stateData.org_id
    if (!orgId) {
      log.warn("[Meta Callback] state missing org_id — skipping org check (legacy flow)")
    }

    // Save credentials to client_stores (unified credential storage)
    if (stateData.store_id) {
      try {
        await updateStoreCredentials(
          stateData.store_id,
          {
            meta_access_token: accessToken,
            meta_page_id: instagramAccountId || "",
            meta_ad_account_id: adAccountId || "",
            meta_instagram_account_id: instagramAccountId || "",
            meta_user_id: userInfo.id,
          },
          "meta",
          orgId ? { orgId } : undefined
        )
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 403) {
          log.error("[Meta Callback] Org mismatch on credential save", {
            storeId: stateData.store_id,
            orgId,
          })
          return NextResponse.redirect(
            new URL("/stores?error=org_mismatch", request.nextUrl.origin)
          )
        }
        throw err
      }

      log.info("Meta credentials saved to client_stores", {
        storeId: stateData.store_id,
        scope: stateData.scope,
      })
    } else {
      log.warn("No store_id in state - Meta credentials not saved to client_stores")
    }

    // Clear state cookie and redirect
    const response = NextResponse.redirect(
      new URL("/settings/integrations?success=meta_connected", request.url)
    )
    response.cookies.delete("meta_oauth_state")

    return response
  } catch (error) {
    log.error("Error in Meta OAuth callback:", {
      message: error instanceof Error ? error.message : "unknown",
    })
    return NextResponse.redirect(
      new URL("/settings/integrations?error=callback_failed", request.url)
    )
  }
}
