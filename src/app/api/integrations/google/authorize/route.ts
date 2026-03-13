import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("GoogleAuthorize")

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"

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
    const context = searchParams.get("context") || "admin" // AC 42.3.1

    // Define scopes based on integration type
    const scopes: string[] = [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ]

    if (scope === "calendar" || scope === "all") {
      scopes.push(
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events"
      )
    }

    if (scope === "ads" || scope === "all") {
      scopes.push("https://www.googleapis.com/auth/adwords")
    }

    // [M1] Resolve org_id conditionally based on context
    let orgId = ""
    if (context === "portal") {
      // Portal users are NOT in org_members — resolve via client_portal_users -> clients
      const adminClient = createAdminClient()
      const { data: portalUser } = await adminClient
        .from("client_portal_users")
        .select("clients(org_id)")
        .eq("auth_user_id", user.id)
        .single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orgId = (portalUser?.clients as any)?.org_id || ""
    } else {
      const { data: orgMember } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .single()
      orgId = orgMember?.org_id || ""
    }

    // Generate state for CSRF protection with cryptographic nonce (C2)
    const state = Buffer.from(
      JSON.stringify({
        user_id: user.id,
        user_type: context === "portal" ? "portal_user" : "profile",
        scope,
        org_id: orgId,
        store_id: storeId || "",
        nonce: crypto.randomUUID(), // AC 42.3.2 — C2 anti-CSRF nonce
        timestamp: Date.now(),
        context,
      })
    ).toString("base64")

    // Store state in cookie for validation
    const response = NextResponse.redirect(
      `${GOOGLE_AUTH_URL}?` +
        new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`,
          response_type: "code",
          scope: scopes.join(" "),
          access_type: "offline",
          prompt: "consent", // AC 42.3.6 — ensures refresh_token
          state,
        }).toString()
    )

    response.cookies.set("google_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
    })

    return response
  } catch (error) {
    log.error("Error initiating Google OAuth:", error)
    return NextResponse.redirect(
      new URL("/settings/integrations?error=oauth_init_failed", request.url)
    )
  }
}
