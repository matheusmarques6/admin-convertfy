import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

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

  // Protected routes check
  const protectedPaths = ["/dashboard", "/clients", "/pipeline", "/automations", "/settings", "/reports", "/tools"]
  const isProtectedPath = protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))

  // Auth routes check
  const authPaths = ["/login", "/register"]
  const isAuthPath = authPaths.some(path => request.nextUrl.pathname.startsWith(path))

  const isRootPath = request.nextUrl.pathname === "/"

  // Change password route - requires authentication but is not a dashboard route
  const isChangePasswordPath = request.nextUrl.pathname.startsWith("/change-password")

  // Only call getUser() when necessary (protected routes, auth routes, root, or change-password)
  if (isProtectedPath || isAuthPath || isRootPath || isChangePasswordPath) {
    try {
      // Use getUser() with a timeout to prevent long waits
      const { data: { user } } = await supabase.auth.getUser()

      if (isProtectedPath && !user) {
        return NextResponse.redirect(new URL("/login", request.url))
      }

      // Change password route requires authentication
      if (isChangePasswordPath && !user) {
        return NextResponse.redirect(new URL("/login", request.url))
      }

      if (isAuthPath && user) {
        return NextResponse.redirect(new URL("/dashboard", request.url))
      }

      if (isRootPath) {
        if (user) {
          return NextResponse.redirect(new URL("/dashboard", request.url))
        }
        return NextResponse.redirect(new URL("/login", request.url))
      }
    } catch (error) {
      // On error, allow the request to continue
      // The page itself can handle auth state
      console.error('Middleware auth error:', error)

      // For protected paths, redirect to login on auth error
      if (isProtectedPath || isChangePasswordPath) {
        return NextResponse.redirect(new URL("/login", request.url))
      }
    }
  }

  return response
}
