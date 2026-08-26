import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { cookies } from "next/headers"
import { fetchWithTimeout } from "./admin"

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Mesmo timeout defensivo do admin client — sem ele, Supabase fora
      // do ar pendurava toda rota autenticada até o maxDuration.
      global: { fetch: fetchWithTimeout },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

// Admin client with service role key for admin operations.
// Re-exported from ./admin (which has no `next/headers` dependency) so that
// importing `createAdminClient` from this module stays backward-compatible for
// existing server-side callers. Client-reachable code should import directly
// from "@/lib/supabase/admin" to avoid pulling `next/headers` into the bundle.
export { createAdminClient } from "./admin"
