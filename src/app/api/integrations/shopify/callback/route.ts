import { NextRequest, NextResponse } from "next/server"
import { updateStoreCredentials } from "@/lib/services/credentials.service"
import { AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("ShopifyCallback")
import crypto from "crypto"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const shop = searchParams.get("shop")
    const state = searchParams.get("state")
    const hmac = searchParams.get("hmac")

    if (!code || !shop || !state) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=missing_params", request.url)
      )
    }

    // Validate state
    const storedState = request.cookies.get("shopify_oauth_state")?.value
    if (state !== storedState) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=invalid_state", request.url)
      )
    }

    // Decode state
    let stateData: { user_id: string; shop: string; store_id: string; nonce: string; timestamp: number; org_id?: string }
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString())
    } catch {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=invalid_state_format", request.url)
      )
    }

    if (!stateData.store_id) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=missing_store_id", request.url)
      )
    }

    // Verify shop matches
    if (shop !== stateData.shop) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=shop_mismatch", request.url)
      )
    }

    // Verify HMAC — secret MUST be configured, hmac MUST be present
    if (!process.env.SHOPIFY_API_SECRET) {
      log.error("SHOPIFY_API_SECRET is not configured — server misconfiguration")
      return NextResponse.redirect(
        new URL("/settings/integrations?error=server_misconfiguration", request.url)
      )
    }

    if (!hmac) {
      log.warn("Missing hmac parameter in Shopify OAuth callback")
      return NextResponse.redirect(
        new URL("/settings/integrations?error=missing_hmac", request.url)
      )
    }

    {
      const queryParams = new URLSearchParams(request.nextUrl.search)
      queryParams.delete("hmac")
      queryParams.delete("signature")

      // Sort and create query string
      const sortedParams = Array.from(queryParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join("&")

      const calculatedHmac = crypto
        .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
        .update(sortedParams)
        .digest("hex")

      const a = Buffer.from(calculatedHmac, "hex")
      const b = Buffer.from(hmac, "hex")
      if (a.byteLength !== b.byteLength || !crypto.timingSafeEqual(a, b)) {
        log.warn("Invalid Shopify HMAC")
        return NextResponse.redirect(
          new URL("/settings/integrations?error=invalid_hmac", request.url)
        )
      }
    }

    // Exchange code for access token
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      log.error("Shopify token exchange error:", errorData)
      return NextResponse.redirect(
        new URL("/settings/integrations?error=token_exchange_failed", request.url)
      )
    }

    const tokenData = await tokenResponse.json()

    // Extract org_id from state (added in 56.2; may be absent in legacy flows)
    const orgId = stateData.org_id
    if (!orgId) {
      log.warn("[Shopify Callback] state missing org_id — skipping org check (legacy flow)")
    }

    // Save credentials to client_stores (unified credential storage)
    try {
      await updateStoreCredentials(
        stateData.store_id,
        {
          shopify_store_domain: shop,
          shopify_access_token: tokenData.access_token,
        },
        "shopify",
        orgId ? { orgId } : undefined
      )
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 403) {
        log.error("[Shopify Callback] Org mismatch on credential save", {
          storeId: stateData.store_id,
          orgId,
        })
        return NextResponse.redirect(
          new URL("/stores?error=org_mismatch", request.nextUrl.origin)
        )
      }
      throw err
    }

    log.info("Shopify credentials saved to client_stores", {
      storeId: stateData.store_id,
      shop,
    })

    // Clear state cookie and redirect
    const response = NextResponse.redirect(
      new URL("/settings/integrations?success=shopify_connected", request.url)
    )
    response.cookies.delete("shopify_oauth_state")

    return response
  } catch (error) {
    log.error("Error in Shopify OAuth callback:", error)
    return NextResponse.redirect(
      new URL("/settings/integrations?error=callback_failed", request.url)
    )
  }
}
