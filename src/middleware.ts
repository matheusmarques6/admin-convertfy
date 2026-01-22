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
     * - Auth routes (login, register)
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
    "/login",
    "/register",
    "/portal/:path*",
  ],
}
