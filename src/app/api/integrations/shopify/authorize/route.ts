import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("ShopifyAuthorize")
import crypto from "crypto"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.redirect(new URL("/login", request.url))
    }

    const searchParams = request.nextUrl.searchParams
    const shop = searchParams.get("shop")

    if (!shop) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=missing_shop", request.url)
      )
    }

    // Validate shop format
    const shopDomain = shop.replace(/^https?:\/\//, "").replace(/\/$/, "")
    if (!shopDomain.match(/^[a-z0-9-]+\.myshopify\.com$/i)) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=invalid_shop", request.url)
      )
    }

    // Generate nonce for CSRF protection
    const nonce = crypto.randomBytes(16).toString("hex")

    // Shopify OAuth scopes
    const scopes = [
      "read_products",
      "read_orders",
      "read_customers",
      "read_inventory",
      "read_analytics",
    ].join(",")

    // Store state
    const state = Buffer.from(
      JSON.stringify({
        user_id: user.id,
        shop: shopDomain,
        nonce,
        timestamp: Date.now(),
      })
    ).toString("base64")

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/shopify/callback`

    // Build Shopify authorization URL
    const authUrl =
      `https://${shopDomain}/admin/oauth/authorize?` +
      new URLSearchParams({
        client_id: process.env.SHOPIFY_API_KEY || "",
        scope: scopes,
        redirect_uri: redirectUri,
        state,
      }).toString()

    const response = NextResponse.redirect(authUrl)

    response.cookies.set("shopify_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
    })

    return response
  } catch (error) {
    log.error("Error initiating Shopify OAuth:", error)
    return NextResponse.redirect(
      new URL("/settings/integrations?error=oauth_init_failed", request.url)
    )
  }
}
