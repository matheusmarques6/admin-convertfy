import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { decrypt } from "@/lib/crypto"
import { trackWithBestProvider, type CarrierKeys, detectCarrierProvider } from "@/lib/tracking/carriers"
import { trackVia17track } from "@/lib/services/tracking.service"

/**
 * Debug endpoint to test live tracking for a tracking number.
 * GET /api/tracking/debug-live?q=WNBAA0436613681YQ&store=5d543cd3-...
 */
export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  const query = request.nextUrl.searchParams.get("q")?.trim()
  const storeId = request.nextUrl.searchParams.get("store")?.trim()

  if (!query) return NextResponse.json({ error: "Missing q param" }, { status: 400 })

  const steps: Record<string, unknown>[] = []

  try {
    // Step 1: Detect carrier
    const carrier = detectCarrierProvider(query)
    steps.push({ step: "detect_carrier", carrier })

    // Step 2: Resolve keys
    let keys: CarrierKeys = { cainiao: true }

    if (storeId) {
      const admin = createAdminClient()
      const { data: store, error } = await admin
        .from("tracking_stores")
        .select("seventeen_track_api_key, carrier_api_keys")
        .eq("id", storeId)
        .single()

      steps.push({ step: "store_lookup", found: !!store, error: error?.message })

      if (store) {
        const storeKeys = (store.carrier_api_keys ?? {}) as Record<string, string | boolean | undefined>

        let seventeenKey: string | undefined
        try {
          seventeenKey = store.seventeen_track_api_key ? decrypt(store.seventeen_track_api_key) : undefined
          steps.push({ step: "decrypt_17track", success: true, keyLength: seventeenKey?.length })
        } catch (err) {
          steps.push({ step: "decrypt_17track", success: false, error: err instanceof Error ? err.message : String(err) })
        }

        let tmKey: string | undefined
        try {
          tmKey = typeof storeKeys.trackingmore === "string" ? decrypt(storeKeys.trackingmore) : undefined
          steps.push({ step: "decrypt_trackingmore", success: true, keyLength: tmKey?.length })
        } catch (err) {
          steps.push({ step: "decrypt_trackingmore", success: false, error: err instanceof Error ? err.message : String(err) })
        }

        keys = {
          seventeen_track: seventeenKey || process.env.SEVENTEEN_TRACK_API_KEY,
          trackingmore: tmKey,
          cainiao: storeKeys.cainiao !== false,
        }
      }
    }

    const globalKey = process.env.SEVENTEEN_TRACK_API_KEY
    steps.push({
      step: "resolved_keys",
      has_17track: !!keys.seventeen_track,
      has_trackingmore: !!keys.trackingmore,
      cainiao: keys.cainiao,
      has_global_17track: !!globalKey,
    })

    // Step 3: Track
    const t0 = Date.now()
    const result = await trackWithBestProvider(query, keys, trackVia17track)
    const durationMs = Date.now() - t0

    steps.push({
      step: "track_result",
      found: !!result,
      durationMs,
      status: result?.status,
      carrier: result?.carrier_name,
      eventsCount: result?.events.length ?? 0,
    })

    return NextResponse.json({ steps, result })
  } catch (err) {
    steps.push({ step: "error", message: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ steps, error: "Failed" }, { status: 500 })
  }
}
