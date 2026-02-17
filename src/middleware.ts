import { type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match only paths that need auth checking:
     * - Root path
     * - Protected routes (dashboard, clients, etc.)
     * - Auth routes (login, register, change-password)
     * - Portal routes (client portal)
     * Excludes: static files, api routes, images, etc.
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
  ],
}
