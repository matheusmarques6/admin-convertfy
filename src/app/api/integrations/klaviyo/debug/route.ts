import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { corsHeaders } from "@/lib/cors"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { KLAVIYO_API_URL, KLAVIYO_REVISION } from "@/lib/integrations/klaviyo/client"

/**
 * GET /api/integrations/klaviyo/debug?store_id=XXX
 *
 * Diagnostic endpoint that tests EVERY URL variation the report needs.
 * Tests each Klaviyo endpoint with different parameter combinations
 * to identify exactly which parameters are accepted/rejected.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const storeId = request.nextUrl.searchParams.get("store_id")
    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    // Get API key
    const creds = await getStoreCredentials(storeId)
    const apiKey = creds.klaviyo_private_key || creds.klaviyo_api_key
    if (!apiKey) {
      return NextResponse.json({ error: "No API key" }, { status: 400, headers: corsHeaders(request.headers.get("origin")) })
    }

    const headers = {
      "Authorization": `Klaviyo-API-Key ${apiKey}`,
      "Accept": "application/json",
      "revision": KLAVIYO_REVISION,
    }

    // Helper: test a GET endpoint and return status + item count + preview
    async function testGet(label: string, path: string) {
      try {
        const url = `${KLAVIYO_API_URL}${path}`
        const res = await fetch(url, { headers })
        const text = await res.text()
        let itemCount = 0
        let firstItem = null
        let error = null

        try {
          const json = JSON.parse(text)
          if (Array.isArray(json.data)) {
            itemCount = json.data.length
            firstItem = json.data[0] ? {
              id: json.data[0].id,
              type: json.data[0].type,
              name: json.data[0].attributes?.name || json.data[0].attributes?.status || null,
            } : null
          }
          if (json.errors) {
            error = json.errors[0]?.detail || json.errors[0]?.title || "Unknown error"
          }
        } catch {
          // not JSON
        }

        return {
          label,
          path,
          status: res.status,
          itemCount,
          firstItem,
          error,
          bodyPreview: text.substring(0, 200),
        }
      } catch (e) {
        return { label, path, status: 0, error: String(e) }
      }
    }

    // Helper: test a POST endpoint
    async function testPost(label: string, path: string, body: object) {
      try {
        const url = `${KLAVIYO_API_URL}${path}`
        const res = await fetch(url, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const text = await res.text()
        let resultCount = 0
        let totalRevenue = 0
        let totalDelivered = 0

        try {
          const json = JSON.parse(text)
          const results = json?.data?.attributes?.results || []
          resultCount = results.length
          for (const r of results) {
            totalRevenue += r.statistics?.conversion_value || 0
            totalDelivered += r.statistics?.delivered || 0
          }
        } catch {
          // not JSON
        }

        return {
          label,
          path,
          status: res.status,
          resultCount,
          totalRevenue,
          totalDelivered,
          bodyPreview: text.substring(0, 300),
        }
      } catch (e) {
        return { label, path, status: 0, error: String(e) }
      }
    }

    // Small delay helper
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

    // ============================================
    // TEST ALL URL VARIATIONS
    // ============================================
    const results: Record<string, unknown> = {}

    // --- LISTS ---
    results.lists_simple = await testGet("Lists (simple)", "/lists/")
    await sleep(500)
    results.lists_additional_fields = await testGet("Lists (additional-fields)", "/lists/?additional-fields[list]=profile_count")
    await sleep(500)
    results.lists_page_size = await testGet("Lists (page[size]=10)", "/lists/?page[size]=10")
    await sleep(500)

    // --- SEGMENTS ---
    results.segments_simple = await testGet("Segments (simple)", "/segments/")
    await sleep(500)
    results.segments_additional_fields = await testGet("Segments (additional-fields)", "/segments/?additional-fields[segment]=profile_count")
    await sleep(500)

    // --- FLOWS ---
    results.flows_simple = await testGet("Flows (simple)", "/flows/")
    await sleep(500)
    results.flows_page_size = await testGet("Flows (page[size]=50)", "/flows/?page[size]=50")
    await sleep(500)

    // --- CAMPAIGNS ---
    results.campaigns_email = await testGet("Campaigns email (no slash)", "/campaigns?filter=equals(messages.channel,'email')")
    await sleep(500)
    results.campaigns_email_slash = await testGet("Campaigns email (slash)", "/campaigns/?filter=equals(messages.channel,'email')")
    await sleep(500)

    // --- METRICS ---
    results.metrics_simple = await testGet("Metrics (simple)", "/metrics/")
    await sleep(500)

    // --- PROFILES ---
    results.profiles_page1 = await testGet("Profiles (page[size]=1)", "/profiles/?page[size]=1")
    await sleep(500)

    // --- FLOW VALUES REPORT ---
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const startStr = thirtyDaysAgo.toISOString().split("T")[0]
    const endStr = now.toISOString().split("T")[0]

    results.flow_report = await testPost("Flow Values Report", "/flow-values-reports/", {
      data: {
        type: "flow-values-report",
        attributes: {
          statistics: ["delivered", "conversion_value", "opened_unique", "clicked_unique"],
          timeframe: {
            start: `${startStr}T00:00:00-03:00`,
            end: `${endStr}T23:59:59-03:00`,
          },
          conversion_metric_id: "RuR2Vf",
        },
      },
    })
    await sleep(1500)

    // --- CAMPAIGN VALUES REPORT ---
    results.campaign_report = await testPost("Campaign Values Report", "/campaign-values-reports/", {
      data: {
        type: "campaign-values-report",
        attributes: {
          statistics: ["delivered", "conversion_value", "opened_unique", "clicked_unique"],
          timeframe: {
            start: `${startStr}T00:00:00-03:00`,
            end: `${endStr}T23:59:59-03:00`,
          },
          conversion_metric_id: "RuR2Vf",
        },
      },
    })

    // ============================================
    // SUMMARY
    // ============================================
    const summary: Record<string, string> = {}
    for (const [key, val] of Object.entries(results)) {
      const v = val as { status: number; label: string; itemCount?: number; resultCount?: number; error?: string }
      const count = v.itemCount ?? v.resultCount ?? "?"
      summary[key] = `${v.status} ${v.status === 200 ? "OK" : "FAIL"} (${count} items)${v.error ? ` - ${v.error}` : ""}`
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      storeId,
      storeName: creds.store_name,
      revision: KLAVIYO_REVISION,
      summary,
      details: results,
    }, { headers: corsHeaders(request.headers.get("origin")) })

  } catch (error) {
    return errorResponse(request, error, "IntegrationsKlaviyoDebug")
  }
}
