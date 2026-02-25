import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { logger } from "@/lib/logger"

const log = logger.child("Middleware")

export async function updateSession(request: NextRequest) {
  // Skip middleware for API routes to avoid timeout issues
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Public routes - skip auth entirely
  const isPublicPath = request.nextUrl.pathname.startsWith("/public")
  if (isPublicPath) {
    return response
  }

  // Protected routes check (admin)
  const protectedPaths = ["/dashboard", "/clients", "/pipeline", "/automations", "/settings", "/reports", "/tools", "/team", "/financial", "/meetings", "/stores", "/onboarding", "/notifications", "/campaigns"]
  const isProtectedPath = protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))

  // Auth routes check (admin)
  const authPaths = ["/login", "/register"]
  const isAuthPath = authPaths.some(path => request.nextUrl.pathname.startsWith(path))

  const isRootPath = request.nextUrl.pathname === "/"

  // Change password route - requires authentication but is not a dashboard route
  const isChangePasswordPath = request.nextUrl.pathname.startsWith("/change-password")

  // Portal routes check
  const isPortalPath = request.nextUrl.pathname.startsWith("/portal")

  // Only call getUser() when necessary
  if (isProtectedPath || isAuthPath || isRootPath || isChangePasswordPath || isPortalPath) {
    try {
      // Use getUser() with a timeout to prevent long waits
      const { data: { user } } = await supabase.auth.getUser()

      // Admin protected routes
      if (isProtectedPath && !user) {
        return NextResponse.redirect(new URL("/login", request.url))
      }

      // Change password route requires authentication
      if (isChangePasswordPath && !user) {
        return NextResponse.redirect(new URL("/login", request.url))
      }

      // Admin auth routes - redirect to dashboard if already logged in
      if (isAuthPath && user) {
        return NextResponse.redirect(new URL("/dashboard", request.url))
      }

      // Root path handling
      if (isRootPath) {
        if (user) {
          return NextResponse.redirect(new URL("/dashboard", request.url))
        }
        return NextResponse.redirect(new URL("/login", request.url))
      }

      // Portal routes - let the portal layout handle auth checking
      // This ensures the session cookies are refreshed for portal routes
      // The portal has its own auth logic that checks if user is a portal user
    } catch (error) {
      // On error, allow the request to continue
      // The page itself can handle auth state
      log.error('Auth error', { error: error instanceof Error ? error.message : error })

      // For protected paths, redirect to login on auth error
      if (isProtectedPath || isChangePasswordPath) {
        return NextResponse.redirect(new URL("/login", request.url))
      }
    }
  }

  return response
}
