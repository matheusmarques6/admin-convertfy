import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { logger } from "@/lib/logger"

const log = logger.child("MetaAuthorize")

const META_AUTH_URL = "https://www.facebook.com/v18.0/dialog/oauth"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.redirect(new URL("/login", request.url))
    }

    const searchParams = request.nextUrl.searchParams
    const scope = searchParams.get("scope") || "ads"
    const storeId = searchParams.get("store_id")

    // Reject missing store_id
    if (!storeId) {
      return NextResponse.redirect(
        new URL("/stores?error=missing_store_id", request.nextUrl.origin)
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

    // Define scopes based on integration type
    const scopes: string[] = [
      "public_profile",
      "email",
    ]

    if (scope === "ads" || scope === "all") {
      scopes.push(
        "ads_management",
        "ads_read",
        "business_management",
        "read_insights"
      )
    }

    if (scope === "instagram" || scope === "all") {
      scopes.push(
        "instagram_basic",
        "instagram_manage_insights",
        "pages_show_list",
        "pages_read_engagement"
      )
    }

    // Generate state for CSRF protection (includes store_id + org_id for credential routing)
    const state = Buffer.from(
      JSON.stringify({
        user_id: user.id,
        scope,
        store_id: storeId,
        org_id: storeAccess.orgId,
        timestamp: Date.now(),
      })
    ).toString("base64")

    // Store state in cookie for validation
    const response = NextResponse.redirect(
      `${META_AUTH_URL}?` +
        new URLSearchParams({
          client_id: process.env.META_APP_ID!,
          redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/meta/callback`,
          response_type: "code",
          scope: scopes.join(","),
          state,
        }).toString()
    )

    response.cookies.set("meta_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
    })

    return response
  } catch (error) {
    log.error("Error initiating Meta OAuth:", error)
    return NextResponse.redirect(
      new URL("/settings/integrations?error=oauth_init_failed", request.url)
    )
  }
}
