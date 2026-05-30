import { createClient as createSupabaseClient } from "@supabase/supabase-js"

// Admin client with the service role key for server-side admin operations
// (e.g. background runners, cron, pipeline contexts that bypass RLS).
//
// Kept in its OWN module — deliberately free of `next/headers` — so that code
// reachable from "use client" components (e.g. services re-exported by the
// `@/lib/services` barrel) can import it without leaking `next/headers` into
// the client bundle, which breaks the build.
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not defined")
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}
