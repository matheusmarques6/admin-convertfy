/**
 * Cron: Sync Omnisend Reports
 *
 * GET /api/cron/sync-omnisend
 *
 * Fetches campaign metrics, automation metrics, audience data,
 * and revenue data from Omnisend for all stores with Omnisend credentials.
 *
 * Stores results in store_revenue_summary (reusing existing table).
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"
import { getStoreCredentials, OMNISEND_CREDENTIALS_FILTER } from "@/lib/services/credentials.service"
import { syncOmnisendForStore } from "@/lib/services/omnisend-sync.service"
import { upsertOmnisendSyncResults } from "@/lib/services/sync-persistence.service"
import { sleep } from "@/lib/integrations/omnisend/client"

const log = logger.child("CronSyncOmnisend")

export const maxDuration = 300
export const dynamic = "force-dynamic"

const MAX_DURATION_MS = 270_000 // 90% of 300s (deixa margem para finalizar graciosamente)

interface SyncResult {
  storeId: string
  storeName: string
  status: "ok" | "error" | "skipped"
  error?: string
  campaigns?: number
  automations?: number
  revenue?: number
}

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  const startTime = Date.now()
  const results: SyncResult[] = []
  // Entry log: se "[CronSyncOmnisend] start" aparecer e "[CronSyncOmnisend] done"
  // nunca aparecer, o crash e silencioso e sabemos investigar travamento/timeout
  // em vez de adivinhar.
  log.info("[CronSyncOmnisend] start", { timestamp: new Date().toISOString() })

  try {
    const adminClient = createAdminClient()

    // Fetch all stores with Omnisend credentials
    const { data: stores, error } = await adminClient
      .from("client_stores")
      .select("id, store_name, org_id, omnisend_validated_at, omnisend_validation_error")
      .or(OMNISEND_CREDENTIALS_FILTER)
      .eq("is_active", true)
      .order("store_name")

    if (error) {
      log.error("Failed to fetch stores", { error })
      return NextResponse.json({ error: "Failed to fetch stores" }, { status: 500 })
    }

    if (!stores || stores.length === 0) {
      log.info("No stores with Omnisend credentials found")
      return NextResponse.json({ message: "No stores to sync", results: [] })
    }

    log.info(`Found ${stores.length} stores with Omnisend credentials`)

    for (const store of stores) {
      // Check time budget
      if (Date.now() - startTime > MAX_DURATION_MS) {
        log.warn("Time budget exhausted, stopping sync")
        break
      }

      // Skip stores with validation errors (API key issue)
      if (store.omnisend_validation_error && !store.omnisend_validated_at) {
        results.push({
          storeId: store.id,
          storeName: store.store_name,
          status: "skipped",
          error: "Credentials not validated",
        })
        continue
      }

      try {
        // Get decrypted credentials
        const credentials = await getStoreCredentials(store.id, store.org_id)
        const apiKey = credentials.omnisend_api_key

        if (!apiKey) {
          results.push({
            storeId: store.id,
            storeName: store.store_name,
            status: "skipped",
            error: "No API key found",
          })
          continue
        }

        log.info(`Syncing Omnisend for ${store.store_name}`, { storeId: store.id })

        // Lista de periods a sincronizar. Padrao: so 30d (cada 30min).
        // Quando ?periods=1d,7d,30d,90d e passado (cron diario), roda
        // todos pra dashboard ter "Hoje" e "7D" funcionais. Limite oficial:
        // 55 calls/dia/brand. Estimativa: 48×30d + 3×{1d,7d,90d} = 51/dia/loja.
        const periodsParam = request.nextUrl.searchParams.get("periods")
        const periodsToSync: Array<{ label: string; days: number }> = periodsParam
          ? periodsParam.split(",").map((p) => p.trim()).filter(Boolean).map((p) => {
              if (p === "today" || p === "1d") return { label: "1d", days: 1 }
              if (p === "7d") return { label: "7d", days: 7 }
              if (p === "30d") return { label: "30d", days: 30 }
              if (p === "90d") return { label: "90d", days: 90 }
              return { label: "30d", days: 30 }
            })
          : [{ label: "30d", days: 30 }]

        let syncedCount = 0
        let lastSyncResult: Awaited<ReturnType<typeof syncOmnisendForStore>> | null = null
        for (const period of periodsToSync) {
          const syncResult = await syncOmnisendForStore({
            storeId: store.id,
            orgId: store.org_id,
            apiKey,
            periodDays: period.days,
          })

          if (!syncResult.ok || !syncResult.data) {
            log.warn(`[CronSyncOmnisend] sync failed for ${store.store_name}/${period.label}`, {
              error: syncResult.error,
            })
            continue
          }

          await upsertOmnisendSyncResults(
            adminClient,
            { id: store.id, org_id: store.org_id },
            syncResult.data,
            period.label,
          )
          syncedCount++
          lastSyncResult = syncResult

          // Espaca chamadas entre periods da mesma loja (rate limit Statistics)
          if (periodsToSync.length > 1) await sleep(8000)
        }

        if (syncedCount === 0 || !lastSyncResult?.data) {
          results.push({
            storeId: store.id,
            storeName: store.store_name,
            status: "error",
            error: lastSyncResult?.error || "All period syncs failed",
          })
          continue
        }

        const data = lastSyncResult.data

        results.push({
          storeId: store.id,
          storeName: store.store_name,
          status: "ok",
          campaigns: data.campaignRows.length,
          automations: data.automationRows.length,
          revenue: data.totalStoreRevenue,
        })

        log.info(`Omnisend sync complete for ${store.store_name}`, {
          campaigns: data.campaignRows.length,
          automations: data.automationRows.length,
          revenue: data.totalStoreRevenue,
          contacts: data.totalContacts,
        })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        log.error(`Failed to sync ${store.store_name}`, { error: errMsg })
        results.push({
          storeId: store.id,
          storeName: store.store_name,
          status: "error",
          error: errMsg,
        })
      }

      // Rate limit spacing between stores
      await sleep(1500)
    }

    const okCount = results.filter((r) => r.status === "ok").length
    const errorCount = results.filter((r) => r.status === "error").length

    log.info("Omnisend cron sync complete", {
      total: stores.length,
      ok: okCount,
      errors: errorCount,
      duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
    })

    log.info("[CronSyncOmnisend] done", {
      duration: Date.now() - startTime,
      totalStores: stores.length,
      ok: okCount,
      errors: errorCount,
    })
    return NextResponse.json({
      message: `Synced ${okCount}/${stores.length} stores`,
      duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      results,
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    log.error("[CronSyncOmnisend] crashed", { error: errMsg, duration: Date.now() - startTime })
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
