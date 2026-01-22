import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
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
    let stateData: { user_id: string; shop: string; nonce: string; timestamp: number }
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString())
    } catch {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=invalid_state_format", request.url)
      )
    }

    // Verify shop matches
    if (shop !== stateData.shop) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=shop_mismatch", request.url)
      )
    }

    // Verify HMAC if secret is available
    if (process.env.SHOPIFY_API_SECRET && hmac) {
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

      if (calculatedHmac !== hmac) {
        console.warn("Invalid Shopify HMAC")
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
      console.error("Shopify token exchange error:", errorData)
      return NextResponse.redirect(
        new URL("/settings/integrations?error=token_exchange_failed", request.url)
      )
    }

    const tokenData = await tokenResponse.json()

    // Get shop info
    const shopInfoResponse = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { "X-Shopify-Access-Token": tokenData.access_token },
    })

    const shopInfo = shopInfoResponse.ok
      ? (await shopInfoResponse.json()).shop
      : { name: shop }

    // Save integration to database
    const supabase = await createClient()

    const credentials = {
      access_token: tokenData.access_token,
      store_url: shop,
      api_version: "2024-01",
      scope: tokenData.scope,
      shop_name: shopInfo.name,
      shop_email: shopInfo.email || "",
    }

    // Check if integration already exists
    const { data: existing } = await supabase
      .from("integrations")
      .select("id")
      .eq("type", "shopify")
      .single()

    if (existing) {
      await supabase
        .from("integrations")
        .update({
          credentials,
          is_active: true,
          last_sync: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
    } else {
      await supabase.from("integrations").insert({
        type: "shopify",
        name: `Shopify - ${shopInfo.name}`,
        credentials,
        is_active: true,
        last_sync: new Date().toISOString(),
      })
    }

    // Clear state cookie and redirect
    const response = NextResponse.redirect(
      new URL("/settings/integrations?success=shopify_connected", request.url)
    )
    response.cookies.delete("shopify_oauth_state")

    return response
  } catch (error) {
    console.error("Error in Shopify OAuth callback:", error)
    return NextResponse.redirect(
      new URL("/settings/integrations?error=callback_failed", request.url)
    )
  }
}
