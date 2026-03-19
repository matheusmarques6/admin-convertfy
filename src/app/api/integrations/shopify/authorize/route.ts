import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireStoreAccess } from "@/lib/api/require-store-access"
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
    const storeId = searchParams.get("store_id")

    if (!shop) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=missing_shop", request.url)
      )
    }

    if (!storeId) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=missing_store_id", request.url)
      )
    }

    // Validate shop format
    const shopDomain = shop.replace(/^https?:\/\//, "").replace(/\/$/, "")
    if (!shopDomain.match(/^[a-z0-9-]+\.myshopify\.com$/i)) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=invalid_shop", request.url)
      )
    }

    // Validate store ownership before initiating OAuth
    let storeAccess
    try {
      storeAccess = await requireStoreAccess(storeId, user.id, "can_edit")
    } catch {
      const redirectUrl = new URL("/stores", request.nextUrl.origin)
      redirectUrl.searchParams.set("error", "store_access_denied")
      return NextResponse.redirect(redirectUrl)
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

    // Store state (includes store_id + org_id for credential routing)
    const state = Buffer.from(
      JSON.stringify({
        user_id: user.id,
        shop: shopDomain,
        store_id: storeId,
        org_id: storeAccess.orgId,
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
