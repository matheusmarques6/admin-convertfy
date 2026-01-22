import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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

    // Generate state for CSRF protection
    const state = Buffer.from(
      JSON.stringify({
        user_id: user.id,
        scope,
        timestamp: Date.now(),
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
          prompt: "consent",
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
    console.error("Error initiating Google OAuth:", error)
    return NextResponse.redirect(
      new URL("/settings/integrations?error=oauth_init_failed", request.url)
    )
  }
}
