import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { cleanExpiredCache, setCache } from "@/lib/cache"
import { logger } from "@/lib/logger"
import { decrypt } from "@/lib/crypto"
import {
  klaviyoRequest,
  parseDateRange,
  formatDateStr,
  getAccountInfo,
  getTimezoneOffset,
  findPlacedOrderMetric,
  MIN_REQUEST_INTERVAL,
  sleep,
  KLAVIYO_API_URL,
} from "@/lib/integrations/klaviyo"

const log = logger.child("CronSyncReports")

export const maxDuration = 300
export const dynamic = "force-dynamic"

function decryptField(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.startsWith("enc:v1:")) {
    try {
      return decrypt(value)
    } catch {
      return null
    }
  }
  return value
}

export async function GET(request: NextRequest) {
  try {
    // Verify CRON_SECRET
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createAdminClient()
    const startTime = Date.now()

    log.info("[Cron] Starting sync-reports...")

    // Clean expired cache entries first
    const cleanedCount = await cleanExpiredCache(supabase)
    log.info(`[Cron] Cleaned ${cleanedCount} expired cache entries`)

    // Get all stores with Klaviyo credentials
    const { data: stores, error: storesError } = await supabase
      .from("client_stores")
      .select("id, store_name, klaviyo_api_key, klaviyo_private_key")
      .not("klaviyo_private_key", "is", null)

    if (storesError || !stores) {
      log.error("[Cron] Failed to fetch stores:", storesError)
      return NextResponse.json({ error: "Failed to fetch stores" }, { status: 500 })
    }

    // Filter stores that actually have a valid Klaviyo key
    const validStores = stores.filter(s => {
      const key = decryptField(s.klaviyo_private_key) || decryptField(s.klaviyo_api_key)
      return !!key
    })

    log.info(`[Cron] Found ${validStores.length} stores with Klaviyo credentials`)

    const results: Array<{ storeId: string; storeName: string; status: string; error?: string }> = []

    for (const store of validStores) {
      const storeStart = Date.now()
      try {
        const apiKey = decryptField(store.klaviyo_private_key) || decryptField(store.klaviyo_api_key)
        if (!apiKey) {
          results.push({ storeId: store.id, storeName: store.store_name, status: "skipped", error: "No valid API key" })
          continue
        }

        log.info(`[Cron] Syncing store: ${store.store_name} (${store.id})`)

        // Get account info
        const accountInfo = await getAccountInfo(apiKey)
        const timezoneOffset = getTimezoneOffset(accountInfo.timezone)

        // Sync for default period (30d)
        const { startDate, endDate } = parseDateRange("30d", null, null)
        const startDateStr = formatDateStr(startDate)
        const endDateStr = formatDateStr(endDate)

        // Find placed order metric
        const metricId = await findPlacedOrderMetric(apiKey)
        if (!metricId) {
          results.push({ storeId: store.id, storeName: store.store_name, status: "skipped", error: "No Placed Order metric" })
          continue
        }

        // Fetch flow metrics
        await sleep(MIN_REQUEST_INTERVAL)
        const flowResponse = await klaviyoRequest<{
          data: {
            attributes: {
              results: Array<{
                groupings: { flow_id: string; send_channel: string; flow_message_id: string }
                statistics: Record<string, number | undefined>
              }>
            }
          }
        }>(apiKey, "/flow-values-reports/", {
          method: "POST",
          body: {
            data: {
              type: "flow-values-report",
              attributes: {
                timeframe: {
                  start: `${startDateStr}T00:00:00${timezoneOffset}`,
                  end: `${endDateStr}T23:59:59${timezoneOffset}`,
                },
                conversion_metric_id: metricId,
                statistics: [
                  "average_order_value", "bounce_rate", "bounced", "click_rate",
                  "click_to_open_rate", "clicks", "clicks_unique", "conversion_rate",
                  "conversion_uniques", "conversion_value", "conversions", "delivered",
                  "delivery_rate", "open_rate", "opens", "opens_unique", "recipients",
                  "revenue_per_recipient", "unsubscribe_rate", "unsubscribed",
                ],
              },
            },
          },
        })

        // Aggregate flow metrics by flow_id and get flow names
        if (flowResponse?.data?.attributes?.results) {
          const flowAgg = new Map<string, Record<string, number>>()
          for (const r of flowResponse.data.attributes.results) {
            const fid = r.groupings.flow_id
            const s = r.statistics
            const ex = flowAgg.get(fid) || {}
            flowAgg.set(fid, {
              recipients: (ex.recipients || 0) + (s.recipients || 0),
              delivered: (ex.delivered || 0) + (s.delivered || 0),
              delivery_rate: s.delivery_rate ?? ex.delivery_rate ?? 0,
              opened: (ex.opened || 0) + (s.opens_unique || 0),
              open_rate: s.open_rate ?? ex.open_rate ?? 0,
              clicked: (ex.clicked || 0) + (s.clicks_unique || 0),
              click_rate: s.click_rate ?? ex.click_rate ?? 0,
              click_to_open_rate: s.click_to_open_rate ?? ex.click_to_open_rate ?? 0,
              conversions: (ex.conversions || 0) + (s.conversions || 0),
              conversion_rate: s.conversion_rate ?? ex.conversion_rate ?? 0,
              conversion_value: (ex.conversion_value || 0) + (s.conversion_value || 0),
              revenue_per_recipient: s.revenue_per_recipient ?? ex.revenue_per_recipient ?? 0,
              average_order_value: s.average_order_value ?? ex.average_order_value ?? 0,
              bounced: (ex.bounced || 0) + (s.bounced || 0),
              bounce_rate: s.bounce_rate ?? ex.bounce_rate ?? 0,
              unsubscribed: (ex.unsubscribed || 0) + (s.unsubscribed || 0),
              unsubscribe_rate: s.unsubscribe_rate ?? ex.unsubscribe_rate ?? 0,
            })
          }

          // Get flow names
          type FlowListResp = {
            data: Array<{ id: string; attributes: { name: string; status: string; trigger_type: string } }>
            links?: { next?: string }
          }
          const flowNames = new Map<string, { name: string; status: string; trigger_type: string }>()
          let flowPage: string | null = "/flows/"
          while (flowPage) {
            const resp: FlowListResp | null = await klaviyoRequest<FlowListResp>(apiKey, flowPage)
            if (!resp?.data) break
            for (const f of resp.data) {
              flowNames.set(f.id, { name: f.attributes.name, status: f.attributes.status, trigger_type: f.attributes.trigger_type })
            }
            flowPage = resp.links?.next ? resp.links.next.replace(KLAVIYO_API_URL, "") : null
            if (flowPage) await sleep(500)
          }

          // Upsert flow metrics
          const flowRows = Array.from(flowAgg.entries()).map(([flowId, m]) => ({
            store_id: store.id,
            flow_id: flowId,
            flow_name: flowNames.get(flowId)?.name || "Unknown",
            flow_status: flowNames.get(flowId)?.status || "unknown",
            trigger_type: flowNames.get(flowId)?.trigger_type || "unknown",
            period_start: startDateStr,
            period_end: endDateStr,
            recipients: m.recipients,
            delivered: m.delivered,
            delivery_rate: m.delivery_rate,
            opened: m.opened,
            open_rate: m.open_rate,
            clicked: m.clicked,
            click_rate: m.click_rate,
            click_to_open_rate: m.click_to_open_rate,
            conversions: m.conversions,
            conversion_rate: m.conversion_rate,
            conversion_value: m.conversion_value,
            revenue_per_recipient: m.revenue_per_recipient,
            average_order_value: m.average_order_value,
            bounced: m.bounced,
            bounce_rate: m.bounce_rate,
            unsubscribed: m.unsubscribed,
            unsubscribe_rate: m.unsubscribe_rate,
            fetched_at: new Date().toISOString(),
          }))

          if (flowRows.length > 0) {
            await supabase
              .from("klaviyo_flow_metrics")
              .upsert(flowRows, { onConflict: "store_id,flow_id,period_start,period_end" })
          }

          log.info(`[Cron] Synced ${flowRows.length} flow metrics for ${store.store_name}`)
        }

        // Fetch campaign metrics
        await sleep(MIN_REQUEST_INTERVAL)
        const campaignResponse = await klaviyoRequest<{
          data: {
            attributes: {
              results: Array<{
                groupings: { campaign_id: string; send_channel: string }
                statistics: Record<string, number | undefined>
              }>
            }
          }
        }>(apiKey, "/campaign-values-reports/", {
          method: "POST",
          body: {
            data: {
              type: "campaign-values-report",
              attributes: {
                timeframe: {
                  start: `${startDateStr}T00:00:00${timezoneOffset}`,
                  end: `${endDateStr}T23:59:59${timezoneOffset}`,
                },
                conversion_metric_id: metricId,
                statistics: [
                  "average_order_value", "bounce_rate", "bounced", "click_rate",
                  "click_to_open_rate", "clicks", "clicks_unique", "conversion_rate",
                  "conversion_uniques", "conversion_value", "conversions", "delivered",
                  "delivery_rate", "open_rate", "opens", "opens_unique", "recipients",
                  "revenue_per_recipient", "unsubscribe_rate", "unsubscribed", "spam_complaints",
                ],
              },
            },
          },
        })

        if (campaignResponse?.data?.attributes?.results) {
          const campAgg = new Map<string, Record<string, number>>()
          for (const r of campaignResponse.data.attributes.results) {
            const cid = r.groupings.campaign_id
            const s = r.statistics
            const ex = campAgg.get(cid) || {}
            campAgg.set(cid, {
              recipients: (ex.recipients || 0) + (s.recipients || 0),
              delivered: (ex.delivered || 0) + (s.delivered || 0),
              delivery_rate: s.delivery_rate ?? ex.delivery_rate ?? 0,
              opened: (ex.opened || 0) + (s.opens_unique || 0),
              open_rate: s.open_rate ?? ex.open_rate ?? 0,
              clicked: (ex.clicked || 0) + (s.clicks_unique || 0),
              click_rate: s.click_rate ?? ex.click_rate ?? 0,
              click_to_open_rate: s.click_to_open_rate ?? ex.click_to_open_rate ?? 0,
              conversions: (ex.conversions || 0) + (s.conversions || 0),
              conversion_rate: s.conversion_rate ?? ex.conversion_rate ?? 0,
              conversion_value: (ex.conversion_value || 0) + (s.conversion_value || 0),
              revenue_per_recipient: s.revenue_per_recipient ?? ex.revenue_per_recipient ?? 0,
              average_order_value: s.average_order_value ?? ex.average_order_value ?? 0,
              bounced: (ex.bounced || 0) + (s.bounced || 0),
              bounce_rate: s.bounce_rate ?? ex.bounce_rate ?? 0,
              unsubscribed: (ex.unsubscribed || 0) + (s.unsubscribed || 0),
              unsubscribe_rate: s.unsubscribe_rate ?? ex.unsubscribe_rate ?? 0,
              spam_complaints: (ex.spam_complaints || 0) + (s.spam_complaints || 0),
            })
          }

          // Get campaign names
          type CampListResp = {
            data: Array<{
              id: string
              attributes: {
                name: string; status: string; send_time: string | null
                channel?: string; send_options?: { subject?: string }; message?: { subject?: string }
              }
            }>
            links?: { next?: string }
          }
          const campNames = new Map<string, { name: string; status: string; send_time: string | null; channel: string; subject: string | null }>()
          for (const channel of ["email", "sms"]) {
            let campPage: string | null = `/campaigns?filter=equals(messages.channel,'${channel}')`
            while (campPage) {
              const resp: CampListResp | null = await klaviyoRequest<CampListResp>(apiKey, campPage)
              if (!resp?.data) break
              for (const c of resp.data) {
                campNames.set(c.id, {
                  name: c.attributes.name,
                  status: c.attributes.status,
                  send_time: c.attributes.send_time,
                  channel: c.attributes.channel || channel,
                  subject: c.attributes.send_options?.subject || c.attributes.message?.subject || null,
                })
              }
              campPage = resp.links?.next ? resp.links.next.replace(KLAVIYO_API_URL, "") : null
              if (campPage) await sleep(500)
            }
          }

          // Upsert campaign metrics (only sent campaigns)
          const campRows = Array.from(campAgg.entries())
            .filter(([cid]) => {
              const info = campNames.get(cid)
              return !info || info.status === "sent"
            })
            .map(([campaignId, m]) => {
              const info = campNames.get(campaignId)
              return {
                store_id: store.id,
                campaign_id: campaignId,
                campaign_name: info?.name || "Unknown",
                campaign_status: info?.status || "sent",
                send_time: info?.send_time || null,
                subject: info?.subject || null,
                channel: info?.channel || "email",
                period_start: startDateStr,
                period_end: endDateStr,
                recipients: m.recipients,
                delivered: m.delivered,
                delivery_rate: m.delivery_rate,
                opened: m.opened,
                open_rate: m.open_rate,
                clicked: m.clicked,
                click_rate: m.click_rate,
                click_to_open_rate: m.click_to_open_rate,
                conversions: m.conversions,
                conversion_rate: m.conversion_rate,
                conversion_value: m.conversion_value,
                revenue_per_recipient: m.revenue_per_recipient,
                average_order_value: m.average_order_value,
                bounced: m.bounced,
                bounce_rate: m.bounce_rate,
                unsubscribed: m.unsubscribed,
                unsubscribe_rate: m.unsubscribe_rate,
                spam_complaints: m.spam_complaints,
                fetched_at: new Date().toISOString(),
              }
            })

          if (campRows.length > 0) {
            await supabase
              .from("klaviyo_campaign_metrics")
              .upsert(campRows, { onConflict: "store_id,campaign_id,period_start,period_end" })
          }

          log.info(`[Cron] Synced ${campRows.length} campaign metrics for ${store.store_name}`)
        }

        // Update sync status
        await supabase
          .from("klaviyo_sync_config")
          .upsert({
            store_id: store.id,
            last_sync_at: new Date().toISOString(),
            last_sync_status: "success",
          }, { onConflict: "store_id" })

        const elapsed = Date.now() - storeStart
        results.push({ storeId: store.id, storeName: store.store_name, status: "success" })
        log.info(`[Cron] Store ${store.store_name} synced in ${elapsed}ms`)

      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error"
        log.error(`[Cron] Error syncing store ${store.store_name}:`, error)
        results.push({ storeId: store.id, storeName: store.store_name, status: "error", error: msg })

        // Update sync status with error
        await supabase
          .from("klaviyo_sync_config")
          .upsert({
            store_id: store.id,
            last_sync_at: new Date().toISOString(),
            last_sync_status: `error: ${msg}`,
          }, { onConflict: "store_id" })
      }
    }

    const totalElapsed = Date.now() - startTime
    log.info(`[Cron] Sync completed in ${totalElapsed}ms. ${results.filter(r => r.status === "success").length}/${validStores.length} stores synced.`)

    return NextResponse.json({
      success: true,
      elapsed: `${totalElapsed}ms`,
      cleanedCacheEntries: cleanedCount,
      stores: results,
    })

  } catch (error) {
    log.error("[Cron] Fatal error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    )
  }
}
