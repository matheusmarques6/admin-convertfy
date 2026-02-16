import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { decryptCredentialsJson } from "@/lib/crypto"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationsGoogleAnalyticsReport")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// Google Analytics Data API v1
const GA_API_URL = "https://analyticsdata.googleapis.com/v1beta"

// CORS headers helper


// Handle OPTIONS preflight requests


interface GACredentials {
  client_email: string
  private_key: string
}

// Get access token from service account credentials
async function getAccessToken(credentials: GACredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const expiry = now + 3600

  // Create JWT header
  const header = {
    alg: "RS256",
    typ: "JWT",
  }

  // Create JWT claims
  const claims = {
    iss: credentials.client_email,
    sub: credentials.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: expiry,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
  }

  // Encode header and claims
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url")
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString("base64url")

  // Sign with private key
  const crypto = await import("crypto")
  const sign = crypto.createSign("RSA-SHA256")
  sign.update(`${encodedHeader}.${encodedClaims}`)
  const signature = sign.sign(credentials.private_key, "base64url")

  const jwt = `${encodedHeader}.${encodedClaims}.${signature}`

  // Exchange JWT for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text()
    log.error("Token error:", error)
    throw new Error("Failed to get access token")
  }

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

// Make GA4 Data API request
async function gaRequest<T>(
  propertyId: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<T> {
  const url = `${GA_API_URL}/properties/${propertyId}:runReport`

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    log.error(`GA API error: ${response.status}`, errorText)
    throw new Error(`GA API error: ${response.status}`)
  }

  return response.json()
}

interface GAReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value: string }>
    metricValues?: Array<{ value: string }>
  }>
  rowCount?: number
}

// Get traffic overview
async function getTrafficOverview(
  propertyId: string,
  accessToken: string,
  dateRange: { start: string; end: string }
) {
  try {
    const response = await gaRequest<GAReportResponse>(propertyId, accessToken, {
      dateRanges: [
        {
          startDate: dateRange.start.split("T")[0],
          endDate: dateRange.end.split("T")[0],
        },
      ],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "newUsers" },
        { name: "screenPageViews" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
        { name: "engagedSessions" },
        { name: "engagementRate" },
      ],
    })

    const row = response.rows?.[0]
    const metrics = row?.metricValues || []

    return {
      sessions: parseInt(metrics[0]?.value || "0"),
      totalUsers: parseInt(metrics[1]?.value || "0"),
      newUsers: parseInt(metrics[2]?.value || "0"),
      pageViews: parseInt(metrics[3]?.value || "0"),
      bounceRate: parseFloat(metrics[4]?.value || "0") * 100,
      avgSessionDuration: parseFloat(metrics[5]?.value || "0"),
      engagedSessions: parseInt(metrics[6]?.value || "0"),
      engagementRate: parseFloat(metrics[7]?.value || "0") * 100,
    }
  } catch (error) {
    log.error("Error fetching traffic overview:", error)
    return {
      sessions: 0,
      totalUsers: 0,
      newUsers: 0,
      pageViews: 0,
      bounceRate: 0,
      avgSessionDuration: 0,
      engagedSessions: 0,
      engagementRate: 0,
    }
  }
}

// Get traffic by source
async function getTrafficBySource(
  propertyId: string,
  accessToken: string,
  dateRange: { start: string; end: string }
) {
  try {
    const response = await gaRequest<GAReportResponse>(propertyId, accessToken, {
      dateRanges: [
        {
          startDate: dateRange.start.split("T")[0],
          endDate: dateRange.end.split("T")[0],
        },
      ],
      dimensions: [{ name: "sessionSource" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "engagementRate" },
      ],
      limit: 10,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    })

    const sources = (response.rows || []).map(row => ({
      source: row.dimensionValues?.[0]?.value || "Unknown",
      sessions: parseInt(row.metricValues?.[0]?.value || "0"),
      users: parseInt(row.metricValues?.[1]?.value || "0"),
      engagementRate: parseFloat(row.metricValues?.[2]?.value || "0") * 100,
    }))

    return sources
  } catch (error) {
    log.error("Error fetching traffic by source:", error)
    return []
  }
}

// Get top pages
async function getTopPages(
  propertyId: string,
  accessToken: string,
  dateRange: { start: string; end: string }
) {
  try {
    const response = await gaRequest<GAReportResponse>(propertyId, accessToken, {
      dateRanges: [
        {
          startDate: dateRange.start.split("T")[0],
          endDate: dateRange.end.split("T")[0],
        },
      ],
      dimensions: [{ name: "pagePath" }],
      metrics: [
        { name: "screenPageViews" },
        { name: "totalUsers" },
        { name: "averageSessionDuration" },
      ],
      limit: 10,
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    })

    const pages = (response.rows || []).map(row => ({
      path: row.dimensionValues?.[0]?.value || "/",
      pageViews: parseInt(row.metricValues?.[0]?.value || "0"),
      users: parseInt(row.metricValues?.[1]?.value || "0"),
      avgDuration: parseFloat(row.metricValues?.[2]?.value || "0"),
    }))

    return pages
  } catch (error) {
    log.error("Error fetching top pages:", error)
    return []
  }
}

// Get traffic by device
async function getTrafficByDevice(
  propertyId: string,
  accessToken: string,
  dateRange: { start: string; end: string }
) {
  try {
    const response = await gaRequest<GAReportResponse>(propertyId, accessToken, {
      dateRanges: [
        {
          startDate: dateRange.start.split("T")[0],
          endDate: dateRange.end.split("T")[0],
        },
      ],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "bounceRate" },
      ],
    })

    const devices = (response.rows || []).map(row => ({
      device: row.dimensionValues?.[0]?.value || "Unknown",
      sessions: parseInt(row.metricValues?.[0]?.value || "0"),
      users: parseInt(row.metricValues?.[1]?.value || "0"),
      bounceRate: parseFloat(row.metricValues?.[2]?.value || "0") * 100,
    }))

    return devices
  } catch (error) {
    log.error("Error fetching traffic by device:", error)
    return []
  }
}

// Get daily traffic trend
async function getDailyTraffic(
  propertyId: string,
  accessToken: string,
  dateRange: { start: string; end: string }
) {
  try {
    const response = await gaRequest<GAReportResponse>(propertyId, accessToken, {
      dateRanges: [
        {
          startDate: dateRange.start.split("T")[0],
          endDate: dateRange.end.split("T")[0],
        },
      ],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "screenPageViews" },
      ],
      orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
    })

    const timeSeries = (response.rows || []).map(row => {
      const dateStr = row.dimensionValues?.[0]?.value || ""
      const formattedDate = dateStr ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}` : ""
      return {
        date: formattedDate,
        sessions: parseInt(row.metricValues?.[0]?.value || "0"),
        users: parseInt(row.metricValues?.[1]?.value || "0"),
        pageViews: parseInt(row.metricValues?.[2]?.value || "0"),
      }
    })

    return timeSeries
  } catch (error) {
    log.error("Error fetching daily traffic:", error)
    return []
  }
}

// Get traffic by country
async function getTrafficByCountry(
  propertyId: string,
  accessToken: string,
  dateRange: { start: string; end: string }
) {
  try {
    const response = await gaRequest<GAReportResponse>(propertyId, accessToken, {
      dateRanges: [
        {
          startDate: dateRange.start.split("T")[0],
          endDate: dateRange.end.split("T")[0],
        },
      ],
      dimensions: [{ name: "country" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
      ],
      limit: 10,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    })

    const countries = (response.rows || []).map(row => ({
      country: row.dimensionValues?.[0]?.value || "Unknown",
      sessions: parseInt(row.metricValues?.[0]?.value || "0"),
      users: parseInt(row.metricValues?.[1]?.value || "0"),
    }))

    return countries
  } catch (error) {
    log.error("Error fetching traffic by country:", error)
    return []
  }
}

// Main GET handler
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")
    const period = searchParams.get("period") || "30d"
    const customStartDate = searchParams.get("start_date")
    const customEndDate = searchParams.get("end_date")

    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    // Get store with GA4 credentials
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("ga4_property_id, ga4_credentials, store_name, client_id")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      throw new AppError("Loja não encontrada", 404)
    }

    const { ga4_property_id: propertyId, ga4_credentials: rawCredentials } = store
    const credentials = rawCredentials ? decryptCredentialsJson(rawCredentials) : null

    if (!propertyId || !credentials) {
      return NextResponse.json({
        success: false,
        connected: false,
        error: "Credenciais Google Analytics não configuradas",
      })
    }

    // Calculate date range
    const now = new Date()
    let startDate: Date
    let endDate: Date = now

    if (period === "custom" && customStartDate && customEndDate) {
      startDate = new Date(customStartDate)
      endDate = new Date(customEndDate)
      endDate.setHours(23, 59, 59, 999)
    } else {
      switch (period) {
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case "30d":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case "90d":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        case "all":
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
          break
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      }
    }

    const dateRange = {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    }

    // Get access token
    const accessToken = await getAccessToken(credentials as unknown as GACredentials)

    // Fetch all data in parallel
    const [trafficOverview, trafficBySource, topPages, trafficByDevice, dailyTraffic, trafficByCountry] = await Promise.all([
      getTrafficOverview(propertyId, accessToken, dateRange),
      getTrafficBySource(propertyId, accessToken, dateRange),
      getTopPages(propertyId, accessToken, dateRange),
      getTrafficByDevice(propertyId, accessToken, dateRange),
      getDailyTraffic(propertyId, accessToken, dateRange),
      getTrafficByCountry(propertyId, accessToken, dateRange),
    ])

    const reportData = {
      success: true,
      connected: true,
      storeName: store.store_name || `Property ${propertyId}`,
      generatedAt: new Date().toISOString(),
      period,
      dateRange,
      propertyId,

      // Traffic overview
      overview: trafficOverview,

      // Traffic breakdown
      trafficBySource,
      trafficByDevice,
      trafficByCountry,

      // Pages
      topPages,

      // Time series
      timeSeries: dailyTraffic,

      // Summary
      summary: {
        totalSessions: trafficOverview.sessions,
        totalUsers: trafficOverview.totalUsers,
        totalPageViews: trafficOverview.pageViews,
        bounceRate: trafficOverview.bounceRate,
        engagementRate: trafficOverview.engagementRate,
      },
    }

    return NextResponse.json(reportData)
  } catch (error) {
    return errorResponse(request, error, "IntegrationsGoogleAnalyticsReport")
  }
}
