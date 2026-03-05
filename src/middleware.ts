import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

// Routes that must be embeddable in iframes (widget preview + external stores)
const EMBEDDABLE_ROUTES = ["/tracking/embed", "/api/script/"]

function isEmbeddableRoute(pathname: string): boolean {
  return EMBEDDABLE_ROUTES.some((route) => pathname.startsWith(route))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Embeddable routes — skip auth, allow iframes
  if (isEmbeddableRoute(pathname)) {
    const response = NextResponse.next()
    response.headers.set(
      "Content-Security-Policy",
      "frame-ancestors *"
    )
    return response
  }

  // All other routes — block iframes
  const response = await updateSession(request)
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'"
  )
  return response
}

export const config = {
  matcher: [
    /*
     * Match paths that need auth checking + embeddable routes for frame headers.
     * Excludes: static files (_next/static, _next/image, favicon.ico)
     */
    "/",
    "/dashboard/:path*",
    "/clients/:path*",
    "/pipeline/:path*",
    "/automations/:path*",
    "/settings/:path*",
    "/reports/:path*",
    "/tools/:path*",
    "/team/:path*",
    "/stores/:path*",
    "/financial/:path*",
    "/meetings/:path*",
    "/onboarding/:path*",
    "/notifications/:path*",
    "/campaigns/:path*",
    "/login",
    "/register",
    "/change-password",
    "/portal/:path*",
    "/public/:path*",
    "/track/:path*",
    "/tracking/embed",
    "/api/script/:path*",
  ],
}
