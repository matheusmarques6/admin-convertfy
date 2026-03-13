import { NextRequest, NextResponse } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/ssr"

/**
 * Auth callback for Supabase invite links.
 * When a client clicks the invite email link, Supabase verifies the token
 * and redirects here with a `code` parameter.
 * We exchange the code for a session and redirect to /client/change-password
 * so the user can set their password.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const next = "/client/change-password"

  if (!code) {
    return NextResponse.redirect(
      new URL("/client/login?error=link_invalido", request.url)
    )
  }

  const response = NextResponse.redirect(new URL(next, request.url))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error("[Portal Auth Callback] Error exchanging code:", error.message)
    return NextResponse.redirect(
      new URL("/client/login?error=link_expirado", request.url)
    )
  }

  return response
}
