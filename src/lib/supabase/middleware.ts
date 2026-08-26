import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { logger } from "@/lib/logger"

const log = logger.child("Middleware")

// O fetch do Supabase Auth NÃO tem timeout próprio: com o Supabase fora do
// ar (incidente ago/2026 — Cloudflare 522), o getClaims() pendurava até o
// Vercel matar o middleware aos 25s (MIDDLEWARE_INVOCATION_TIMEOUT) e o
// site INTEIRO respondia 504. 5s é folga suficiente pro refresh de token em
// operação normal.
const AUTH_CHECK_TIMEOUT_MS = 5_000

class AuthCheckTimeoutError extends Error {
  constructor() {
    super("Supabase Auth não respondeu no tempo limite")
    this.name = "AuthCheckTimeoutError"
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new AuthCheckTimeoutError()), ms)),
  ])
}

/** Heurística barata: existe cookie de sessão do Supabase (sb-*-auth-token)? */
function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth"))
}

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

  // Client auth callback - let it handle its own auth flow
  if (request.nextUrl.pathname.startsWith("/client/auth/callback")) {
    return response
  }

  // Admin protected routes. /print (páginas imprimíveis de relatório, fora
  // do chrome do admin) exige a MESMA sessão — sem ela, redirect pro login.
  const isAdminPath =
    request.nextUrl.pathname.startsWith("/admin") ||
    request.nextUrl.pathname.startsWith("/print")

  // Auth routes check (admin)
  const authPaths = ["/login", "/register"]
  const isAuthPath = authPaths.some(path => request.nextUrl.pathname.startsWith(path))

  const isRootPath = request.nextUrl.pathname === "/"

  // Change password route - requires authentication but is not a dashboard route
  const isChangePasswordPath = request.nextUrl.pathname.startsWith("/change-password")

  // Client routes check
  const isClientPath = request.nextUrl.pathname.startsWith("/client")

  // Only call getUser() when necessary
  if (isAdminPath || isAuthPath || isRootPath || isChangePasswordPath || isClientPath) {
    try {
      // getClaims() valida o JWT localmente quando o projeto usa signing keys
      // assimetricas (cai para validacao remota no legado HS256) e ainda
      // dispara o refresh de sessao quando o token expira.
      const { data: claimsData } = await withTimeout(supabase.auth.getClaims(), AUTH_CHECK_TIMEOUT_MS)
      const user = claimsData?.claims ?? null

      // Admin protected routes
      if (isAdminPath && !user) {
        return NextResponse.redirect(new URL("/login", request.url))
      }

      // Change password route requires authentication
      if (isChangePasswordPath && !user) {
        return NextResponse.redirect(new URL("/login", request.url))
      }

      // Admin auth routes - redirect to admin dashboard if already logged in
      if (isAuthPath && user) {
        return NextResponse.redirect(new URL("/admin/dashboard", request.url))
      }

      // Root path handling
      if (isRootPath) {
        if (user) {
          return NextResponse.redirect(new URL("/admin/dashboard", request.url))
        }
        return NextResponse.redirect(new URL("/login", request.url))
      }

      // Client routes - let the client layout handle auth checking
      // This ensures the session cookies are refreshed for client routes
      // The client portal has its own auth logic that checks if user is a portal user
    } catch (error) {
      log.error('Auth error', { error: error instanceof Error ? error.message : error })

      // Indisponibilidade do Supabase (timeout/rede) NÃO é "sem sessão":
      // quem tem cookie de sessão segue adiante — as páginas renderizam e
      // as APIs degradam com 503 (requireAuth). Redirecionar pro /login
      // durante um incidente "deslogava" a empresa inteira numa tela de
      // login que também não funcionaria.
      const isOutage =
        error instanceof AuthCheckTimeoutError ||
        (error instanceof Error && /fetch|network|timeout|522|abort/i.test(error.message))
      if (isOutage && hasSupabaseSessionCookie(request)) {
        return response
      }

      // For protected paths, redirect to login on auth error
      if (isAdminPath || isChangePasswordPath) {
        return NextResponse.redirect(new URL("/login", request.url))
      }
    }
  }

  return response
}
