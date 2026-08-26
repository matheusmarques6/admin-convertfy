import { createClient as createSupabaseClient } from "@supabase/supabase-js"

// Timeout defensivo em TODA request ao Supabase. Sem isso, com o Supabase
// fora do ar (incidente ago/2026 — Cloudflare 522 "Connection timed out"),
// cada query pendurava indefinidamente e os crons morriam no maxDuration
// (60s) sem log útil. 30s cobre com folga upserts grandes legítimos e
// falha rápido quando o serviço está de fato indisponível. Um signal
// explícito do chamador (.abortSignal()) tem precedência.
const SUPABASE_FETCH_TIMEOUT_MS = 30_000

export function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT_MS),
  })
}

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
      fetch: fetchWithTimeout,
    },
  })
}
