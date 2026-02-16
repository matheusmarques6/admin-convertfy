import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { encryptCredentialsJson } from "@/lib/crypto"
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
      log.error("Meta OAuth error:", error)
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
    const storedState = request.cookies.get("meta_oauth_state")?.value
    if (state !== storedState) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=invalid_state", request.url)
      )
    }

    // Decode state
    let stateData: { user_id: string; scope: string; timestamp: number }
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
      log.error("Meta token exchange error:", errorData)
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
      `${META_GRAPH_URL}/me?fields=id,name,email&access_token=${accessToken}`
    )
    const userInfo = await userInfoResponse.json()

    // Get ad accounts if ads scope
    let adAccountId: string | undefined
    if (stateData.scope === "ads" || stateData.scope === "all") {
      const adAccountsResponse = await fetch(
        `${META_GRAPH_URL}/me/adaccounts?fields=id,account_id,name&access_token=${accessToken}`
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
        `${META_GRAPH_URL}/me/accounts?fields=id,instagram_business_account&access_token=${accessToken}`
      )
      const pagesData = await pagesResponse.json()

      for (const page of pagesData.data || []) {
        if (page.instagram_business_account) {
          instagramAccountId = page.instagram_business_account.id
          break
        }
      }
    }

    // Determine integration type
    const integrationType = stateData.scope === "instagram" ? "instagram" : "meta_ads"

    // Save integration to database
    const supabase = await createClient()

    const credentials: Record<string, string> = {
      access_token: accessToken,
      user_id: userInfo.id,
      email: userInfo.email || "",
    }

    if (adAccountId) {
      credentials.ad_account_id = adAccountId
    }
    if (instagramAccountId) {
      credentials.instagram_account_id = instagramAccountId
    }
    const encryptedCredentials = encryptCredentialsJson(credentials)

    // Check if integration already exists
    const { data: existing } = await supabase
      .from("integrations")
      .select("id")
      .eq("type", integrationType)
      .single()

    if (existing) {
      await supabase
        .from("integrations")
        .update({
          credentials: encryptedCredentials,
          is_active: true,
          last_sync: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
    } else {
      await supabase.from("integrations").insert({
        type: integrationType,
        name: integrationType === "instagram" ? "Instagram" : "Meta Ads",
        credentials,
        is_active: true,
        last_sync: new Date().toISOString(),
      })
    }

    // Clear state cookie and redirect
    const response = NextResponse.redirect(
      new URL("/settings/integrations?success=meta_connected", request.url)
    )
    response.cookies.delete("meta_oauth_state")

    return response
  } catch (error) {
    log.error("Error in Meta OAuth callback:", error)
    return NextResponse.redirect(
      new URL("/settings/integrations?error=callback_failed", request.url)
    )
  }
}
