import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { UserRole } from "@/types"

// Route access configuration by role
const routeRoleAccess: Record<string, UserRole[]> = {
  "/settings/users": ["admin"],
  "/automations": ["admin", "manager"],
  "/financial": ["admin", "manager", "financial"],
}

export async function updateSession(request: NextRequest) {
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

  const pathname = request.nextUrl.pathname

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser()

  // Protected routes - redirect to login if not authenticated
  const protectedPaths = [
    "/dashboard",
    "/clients",
    "/pipeline",
    "/automations",
    "/settings",
    "/reports",
    "/tools",
    "/financial",
    "/meetings"
  ]
  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path))

  if (isProtectedPath && !user) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Role-based access control for authenticated users
  if (isProtectedPath && user) {
    // Check if this route has role restrictions
    for (const [route, allowedRoles] of Object.entries(routeRoleAccess)) {
      if (pathname.startsWith(route)) {
        // Fetch user profile with role
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single()

        const userRole = profile?.role as UserRole | undefined

        if (!userRole || !allowedRoles.includes(userRole)) {
          // User doesn't have permission, redirect to dashboard
          return NextResponse.redirect(new URL("/dashboard", request.url))
        }
        break
      }
    }
  }

  // Auth routes - redirect to dashboard if already authenticated
  const authPaths = ["/login", "/register"]
  const isAuthPath = authPaths.some(path => pathname.startsWith(path))

  if (isAuthPath && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  // Redirect root to dashboard or login
  if (pathname === "/") {
    if (user) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return response
}
