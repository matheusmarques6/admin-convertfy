import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalDashboard")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// Cache TTL in minutes based on period
const CACHE_TTL: Record<string, number> = {
  "1d": 5,    // 5 minutes for daily data
  "7d": 15,   // 15 minutes for weekly data
  "15d": 20,  // 20 minutes for bi-weekly data
  "30d": 30,  // 30 minutes for monthly data
  "90d": 60,  // 1 hour for quarterly data
  "12m": 120, // 2 hours for yearly data
}





// GET - Get portal dashboard data
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Get current user
    const user = await requireAuth(supabase)

    // Get portal user using admin client to bypass RLS
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("*, client:clients(*)")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const clientId = portalUser.client_id
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get("period") || "30d"
    const storeId = searchParams.get("store_id")

    // Calculate date range
    const now = new Date()
    const startDate = new Date()

    switch (period) {
      case "1d":
        startDate.setDate(now.getDate() - 1)
        break
      case "7d":
        startDate.setDate(now.getDate() - 7)
        break
      case "15d":
        startDate.setDate(now.getDate() - 15)
        break
      case "30d":
        startDate.setDate(now.getDate() - 30)
        break
      case "90d":
        startDate.setDate(now.getDate() - 90)
        break
      case "12m":
        startDate.setFullYear(now.getFullYear() - 1)
        break
      default:
        startDate.setDate(now.getDate() - 30)
    }

    const startDateStr = startDate.toISOString().split("T")[0]
    const endDateStr = now.toISOString().split("T")[0]

    // Fetch all base data in parallel using admin client to bypass RLS
    const [
      clientData,
      storesData,
      invoicesData,
      meetingsData,
      upcomingCampaignsData,
    ] = await Promise.all([
      // Client info
      adminClient
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single(),

      // Stores with credentials
      adminClient
        .from("client_stores")
        .select("id, store_name, platform, store_url, is_active, klaviyo_private_key, klaviyo_api_key, shopify_access_token, shopify_store_domain")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("store_name"),

      // Invoices
      adminClient
        .from("invoices")
        .select("*")
        .eq("client_id", clientId)
        .order("due_date", { ascending: false })
        .limit(20),

      // Meetings: upcoming scheduled + recent completed (with notes)
      adminClient
        .from("meetings")
        .select("*")
        .eq("client_id", clientId)
        .in("status", ["scheduled", "completed"])
        .order("scheduled_at", { ascending: false })
        .limit(10),

      // Upcoming campaigns (scheduled)
      adminClient
        .from("campaigns")
        .select("*")
        .eq("client_id", clientId)
        .eq("status", "scheduled")
        .gte("scheduled_date", new Date().toISOString().split("T")[0])
        .order("scheduled_date")
        .limit(10),
    ])

    const client = clientData.data
    const stores = storesData.data || []
    const invoices = invoicesData.data || []
    const meetings = meetingsData.data || []
    const upcomingCampaigns = upcomingCampaignsData.data || []

    // Calculate invoice stats
    const pendingInvoices = invoices.filter((i) => i.status === "pending")
    const overdueInvoices = invoices.filter((i) => i.status === "overdue")
    const paidInvoices = invoices.filter((i) => i.status === "paid")

    const totalPending = pendingInvoices.reduce((sum, i) => sum + (i.amount || 0), 0)
    const totalOverdue = overdueInvoices.reduce((sum, i) => sum + (i.amount || 0), 0)
    const totalPaid = paidInvoices.reduce((sum, i) => sum + (i.amount || 0), 0)

    // Prepare the base response
    const response: Record<string, unknown> = {
      success: true,
      period,
      dateRange: { start: startDateStr, end: endDateStr },

      client: {
        id: client?.id,
        name: client?.name,
        company: client?.company,
        status: client?.status,
        healthScore: client?.health_score,
      },

      stores: stores.map((s) => ({
        id: s.id,
        name: s.store_name,
        platform: s.platform,
        url: s.store_url,
        isActive: s.is_active,
      })),

      invoices: {
        pending: pendingInvoices.length,
        overdue: overdueInvoices.length,
        totalPending,
        totalOverdue,
        totalPaid,
        recent: invoices.slice(0, 10).map((i) => ({
          id: i.id,
          amount: i.amount,
          dueDate: i.due_date,
          status: i.status,
          description: i.description,
        })),
      },

      upcomingCampaigns: upcomingCampaigns.map((c) => ({
        id: c.id,
        name: c.name,
        channel: c.channel,
        status: c.status,
        scheduledDate: c.scheduled_date,
      })),

      meetings: meetings.map((m) => ({
        id: m.id,
        title: m.title,
        scheduledAt: m.scheduled_at,
        duration: m.duration_minutes,
        meetingUrl: m.meeting_url,
        status: m.status,
        completionNotes: m.completion_notes,
        completedAt: m.completed_at,
      })),

      lastUpdated: new Date().toISOString(),
    }

    // Helper to get cached data
    const getCachedData = async (storeId: string, cacheType: string) => {
      try {
        const { data } = await adminClient
          .from("dashboard_cache")
          .select("data, expires_at")
          .eq("store_id", storeId)
          .eq("cache_type", cacheType)
          .eq("period", period)
          .single()

        if (data && new Date(data.expires_at) > new Date()) {
          log.debug(`[Cache HIT] ${cacheType} for store ${storeId}`)
          return data.data
        }
        log.debug(`[Cache MISS] ${cacheType} for store ${storeId}`)
        return null
      } catch {
        return null
      }
    }

    // Helper to save data to cache
    const saveToCache = async (storeId: string, cacheType: string, data: Record<string, unknown>) => {
      try {
        const ttlMinutes = CACHE_TTL[period] || 30
        const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()

        await adminClient
          .from("dashboard_cache")
          .upsert({
            store_id: storeId,
            cache_type: cacheType,
            period,
            data,
            expires_at: expiresAt,
          }, {
            onConflict: "store_id,cache_type,period"
          })
        log.debug(`[Cache SAVE] ${cacheType} for store ${storeId}, TTL: ${ttlMinutes}min`)
      } catch (error) {
        log.error(`[Cache ERROR] Failed to save ${cacheType} for store ${storeId}:`, error)
      }
    }

    // Helper function to fetch store data with caching
    const fetchStoreData = async (store: typeof stores[0], baseUrl: string, cookieHeader: string) => {
      const storeData: {
        klaviyo: Record<string, unknown> | null
        shopify: Record<string, unknown> | null
      } = { klaviyo: null, shopify: null }

      // Fetch Klaviyo data if configured
      const hasKlaviyo = !!(store.klaviyo_private_key || store.klaviyo_api_key)
      if (hasKlaviyo) {
        // Try cache first
        const cachedKlaviyo = await getCachedData(store.id, "klaviyo")
        if (cachedKlaviyo) {
          storeData.klaviyo = cachedKlaviyo as Record<string, unknown>
        } else {
          try {
            const klaviyoResponse = await fetch(
              `${baseUrl}/api/integrations/klaviyo/report?store_id=${store.id}&period=${period}`,
              { headers: { Cookie: cookieHeader } }
            )
            if (klaviyoResponse.ok) {
              const data = await klaviyoResponse.json()
              if (data.success && data.connected) {
                storeData.klaviyo = data
                // Save to cache in background
                saveToCache(store.id, "klaviyo", data)
              }
            }
          } catch (error) {
            log.error(`[Portal Dashboard] Klaviyo fetch error for store ${store.id}:`, error)
          }
        }
      }

      // Fetch Shopify data if configured
      const hasShopify = !!(store.shopify_access_token && store.shopify_store_domain)
      if (hasShopify) {
        // Try cache first
        const cachedShopify = await getCachedData(store.id, "shopify")
        if (cachedShopify) {
          storeData.shopify = cachedShopify as Record<string, unknown>
        } else {
          try {
            const shopifyResponse = await fetch(
              `${baseUrl}/api/integrations/shopify/report?store_id=${store.id}&period=${period}`,
              { headers: { Cookie: cookieHeader } }
            )
            if (shopifyResponse.ok) {
              const data = await shopifyResponse.json()
              if (data.success && data.connected) {
                storeData.shopify = data
                // Save to cache in background
                saveToCache(store.id, "shopify", data)
              }
            }
          } catch (error) {
            log.error(`[Portal Dashboard] Shopify fetch error for store ${store.id}:`, error)
          }
        }
      }

      return storeData
    }

    // Helper to map Klaviyo data to dashboard format
    const mapKlaviyoData = (klaviyoData: Record<string, unknown>) => {
      const totalKlaviyoRevenue = (klaviyoData.revenue as Record<string, number>)?.totalRevenue || 0
      const flowRevenue = (klaviyoData.revenue as Record<string, number>)?.flowRevenue || 0
      const campaignRevenue = (klaviyoData.revenue as Record<string, number>)?.campaignRevenue || 0

      return {
        totalLeads: (klaviyoData.overview as Record<string, number>)?.totalSubscribers || 0,
        engagedLeads: (klaviyoData.engagement as Record<string, number>)?.engagedProfiles || 0,
        engagementRate: parseFloat(String((klaviyoData.engagement as Record<string, unknown>)?.engagementRate || "0")),
        totalRevenue: totalKlaviyoRevenue,
        campaignRevenue,
        flowRevenue,
        smsRevenue: 0,
        emailsSent: (klaviyoData.emailPerformance as Record<string, number>)?.delivered || 0,
        delivered: (klaviyoData.emailPerformance as Record<string, number>)?.delivered || 0,
        opened: Math.round(((klaviyoData.emailPerformance as Record<string, number>)?.openRate || 0) * ((klaviyoData.emailPerformance as Record<string, number>)?.delivered || 0) / 100),
        clicked: Math.round(((klaviyoData.emailPerformance as Record<string, number>)?.clickRate || 0) * ((klaviyoData.emailPerformance as Record<string, number>)?.delivered || 0) / 100),
        openRate: (klaviyoData.emailPerformance as Record<string, number>)?.openRate || 0,
        clickRate: (klaviyoData.emailPerformance as Record<string, number>)?.clickRate || 0,
        clickToOpenRate: (klaviyoData.emailPerformance as Record<string, number>)?.clickToOpenRate || 0,
        conversionRate: (klaviyoData.emailPerformance as Record<string, number>)?.clickToOpenRate || 0,
        unsubscribeRate: (klaviyoData.emailPerformance as Record<string, number>)?.unsubscribeRate || 0,
        bounceRate: (klaviyoData.emailPerformance as Record<string, number>)?.bounceRate || 0,
        bounces: Math.round(((klaviyoData.emailPerformance as Record<string, number>)?.bounceRate || 0) * ((klaviyoData.emailPerformance as Record<string, number>)?.delivered || 0) / 100),
        campaignsCount: (klaviyoData.overview as Record<string, number>)?.campaignsInPeriod || (klaviyoData.campaigns as Record<string, number>)?.sent || 0,
        campaignDelivered: (klaviyoData.campaignPerformance as Record<string, number>)?.totalDelivered || 0,
        campaignRevenuePercent: totalKlaviyoRevenue > 0 ? (campaignRevenue / totalKlaviyoRevenue) * 100 : 0,
        flowsCount: (klaviyoData.overview as Record<string, number>)?.totalFlows || 0,
        activeFlows: (klaviyoData.overview as Record<string, number>)?.liveFlows || 0,
        flowDelivered: (klaviyoData.flowPerformance as Record<string, number>)?.totalDelivered || 0,
        flowRevenuePercent: totalKlaviyoRevenue > 0 ? (flowRevenue / totalKlaviyoRevenue) * 100 : 0,
        recentCampaigns: ((klaviyoData.campaignPerformance as Record<string, unknown>)?.campaigns as Array<Record<string, unknown>> || []).slice(0, 10).map((c) => ({
          id: c.campaignId,
          name: c.name,
          status: "sent",
          sentAt: c.sendTime || new Date().toISOString(),
          recipients: c.delivered || 0,
          delivered: c.delivered || 0,
          opened: c.opens || 0,
          clicked: c.clicks || 0,
          revenue: c.revenue || 0,
          openRate: c.openRate || 0,
          clickRate: c.clickRate || 0,
        })),
        topFlows: ((klaviyoData.flowPerformance as Record<string, unknown>)?.flows as Array<Record<string, unknown>> || []).slice(0, 10).map((f) => ({
          id: f.flowId,
          name: f.name,
          revenue: f.revenue || 0,
          delivered: f.delivered || 0,
          openRate: f.openRate || 0,
          clickRate: f.clickRate || 0,
        })),
      }
    }

    // Helper to map Shopify data to dashboard format
    const mapShopifyData = (shopifyData: Record<string, unknown>) => {
      const orders = shopifyData.orders as Record<string, unknown> || {}
      const customers = shopifyData.customers as Record<string, unknown> || {}
      const coupons = orders.coupons as Record<string, unknown> || {}
      const utmConversions = orders.utmConversions as Record<string, unknown> || {}
      const topCustomers = (orders.topCustomers as Array<Record<string, unknown>>) || []

      return {
        totalRevenue: (orders.totalRevenue as number) || 0,
        totalOrders: (orders.totalOrders as number) || 0,
        paidOrders: (orders.paidOrders as number) || 0,
        averageOrderValue: (orders.averageOrderValue as number) || 0,
        totalCustomers: (customers.totalCustomers as number) || 0,
        newCustomers: (customers.newCustomersLast30Days as number) || 0,
        recurringCustomerRate: (orders.recurringCustomerRate as number) || 0,
        topProducts: ((shopifyData.bestSellingProducts as Array<Record<string, unknown>>) || []).slice(0, 10).map((p) => ({
          name: (p.title as string) || "Unknown Product",
          quantity: (p.quantitySold as number) || 0,
          revenue: (p.revenue as number) || 0,
        })),
        // Top customers by revenue
        topCustomers: topCustomers.slice(0, 10).map((c) => ({
          email: (c.email as string) || "",
          name: (c.name as string) || "",
          ordersCount: (c.ordersCount as number) || 0,
          totalSpent: (c.totalSpent as number) || 0,
          averageOrderValue: (c.averageOrderValue as number) || 0,
          lastOrderDate: (c.lastOrderDate as string) || "",
        })),
        // Coupon data
        coupons: {
          totalOrdersWithCoupon: (coupons.totalOrdersWithCoupon as number) || 0,
          couponUsageRate: (coupons.couponUsageRate as number) || 0,
          topCoupons: (coupons.topCoupons as Array<Record<string, unknown>>) || [],
          totalDiscount: (coupons.totalDiscount as number) || 0,
        },
        // UTM data
        utmConversions: {
          totalOrdersWithUtm: (utmConversions.totalOrdersWithUtm as number) || 0,
          utmTrackingRate: (utmConversions.utmTrackingRate as number) || 0,
          bySource: (utmConversions.bySource as Array<Record<string, unknown>>) || [],
          byMedium: (utmConversions.byMedium as Array<Record<string, unknown>>) || [],
          byCampaign: (utmConversions.byCampaign as Array<Record<string, unknown>>) || [],
        },
      }
    }

    const baseUrl = request.nextUrl.origin
    const cookieHeader = request.headers.get("cookie") || ""

    // Fetch data for stores
    if (storeId && storeId !== "all") {
      // Single store selected
      const selectedStore = stores.find((s) => s.id === storeId)

      if (selectedStore) {
        response.selectedStore = {
          id: selectedStore.id,
          name: selectedStore.store_name,
          platform: selectedStore.platform,
        }

        const storeData = await fetchStoreData(selectedStore, baseUrl, cookieHeader)

        if (storeData.klaviyo) {
          response.klaviyo = mapKlaviyoData(storeData.klaviyo)
        }

        if (storeData.shopify) {
          response.shopify = mapShopifyData(storeData.shopify)
        }
      }
    } else {
      // "All stores" selected - aggregate data from all stores
      const storesWithIntegrations = stores.filter(
        (s) => (s.klaviyo_private_key || s.klaviyo_api_key) || (s.shopify_access_token && s.shopify_store_domain)
      )

      if (storesWithIntegrations.length > 0) {
        // Fetch data from all stores in parallel
        const allStoreData = await Promise.all(
          storesWithIntegrations.map((store) => fetchStoreData(store, baseUrl, cookieHeader))
        )

        // Aggregate Klaviyo data
        const klaviyoDataList = allStoreData.filter((d) => d.klaviyo).map((d) => mapKlaviyoData(d.klaviyo!))
        if (klaviyoDataList.length > 0) {
          // Aggregate all flows from all stores
          const allFlows: Array<Record<string, unknown>> = []
          klaviyoDataList.forEach((k) => {
            if (k.topFlows) allFlows.push(...(k.topFlows as Array<Record<string, unknown>>))
          })
          // Sort by revenue and take top 10
          const topFlowsAggregated = allFlows
            .sort((a, b) => ((b.revenue as number) || 0) - ((a.revenue as number) || 0))
            .slice(0, 10)

          // Aggregate all campaigns
          const allCampaigns: Array<Record<string, unknown>> = []
          klaviyoDataList.forEach((k) => {
            if (k.recentCampaigns) allCampaigns.push(...(k.recentCampaigns as Array<Record<string, unknown>>))
          })
          const recentCampaignsAggregated = allCampaigns
            .sort((a, b) => new Date((b.sentAt as string) || 0).getTime() - new Date((a.sentAt as string) || 0).getTime())
            .slice(0, 10)

          const totalDelivered = klaviyoDataList.reduce((sum, k) => sum + (k.delivered || 0), 0)
          const totalOpened = klaviyoDataList.reduce((sum, k) => sum + (k.opened || 0), 0)
          const totalClicked = klaviyoDataList.reduce((sum, k) => sum + (k.clicked || 0), 0)

          response.klaviyo = {
            totalLeads: klaviyoDataList.reduce((sum, k) => sum + (k.totalLeads || 0), 0),
            engagedLeads: klaviyoDataList.reduce((sum, k) => sum + (k.engagedLeads || 0), 0),
            engagementRate: klaviyoDataList.length > 0
              ? klaviyoDataList.reduce((sum, k) => sum + (k.engagementRate || 0), 0) / klaviyoDataList.length
              : 0,
            totalRevenue: klaviyoDataList.reduce((sum, k) => sum + (k.totalRevenue || 0), 0),
            campaignRevenue: klaviyoDataList.reduce((sum, k) => sum + (k.campaignRevenue || 0), 0),
            flowRevenue: klaviyoDataList.reduce((sum, k) => sum + (k.flowRevenue || 0), 0),
            smsRevenue: klaviyoDataList.reduce((sum, k) => sum + (k.smsRevenue || 0), 0),
            emailsSent: totalDelivered,
            delivered: totalDelivered,
            opened: totalOpened,
            clicked: totalClicked,
            openRate: totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0,
            clickRate: totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0,
            clickToOpenRate: totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0,
            conversionRate: 0,
            unsubscribeRate: klaviyoDataList.length > 0
              ? klaviyoDataList.reduce((sum, k) => sum + (k.unsubscribeRate || 0), 0) / klaviyoDataList.length
              : 0,
            bounceRate: klaviyoDataList.length > 0
              ? klaviyoDataList.reduce((sum, k) => sum + (k.bounceRate || 0), 0) / klaviyoDataList.length
              : 0,
            bounces: klaviyoDataList.reduce((sum, k) => sum + (k.bounces || 0), 0),
            campaignsCount: klaviyoDataList.reduce((sum, k) => sum + (k.campaignsCount || 0), 0),
            campaignDelivered: klaviyoDataList.reduce((sum, k) => sum + (k.campaignDelivered || 0), 0),
            campaignRevenuePercent: 0,
            flowsCount: klaviyoDataList.reduce((sum, k) => sum + (k.flowsCount || 0), 0),
            activeFlows: klaviyoDataList.reduce((sum, k) => sum + (k.activeFlows || 0), 0),
            flowDelivered: klaviyoDataList.reduce((sum, k) => sum + (k.flowDelivered || 0), 0),
            flowRevenuePercent: 0,
            recentCampaigns: recentCampaignsAggregated,
            topFlows: topFlowsAggregated,
          }

          // Recalculate percentages
          const totalKlaviyoRevenue = (response.klaviyo as Record<string, unknown>).totalRevenue as number
          if (totalKlaviyoRevenue > 0) {
            (response.klaviyo as Record<string, unknown>).campaignRevenuePercent =
              (((response.klaviyo as Record<string, unknown>).campaignRevenue as number) / totalKlaviyoRevenue) * 100;
            (response.klaviyo as Record<string, unknown>).flowRevenuePercent =
              (((response.klaviyo as Record<string, unknown>).flowRevenue as number) / totalKlaviyoRevenue) * 100
          }
        }

        // Aggregate Shopify data
        const shopifyDataList = allStoreData.filter((d) => d.shopify).map((d) => mapShopifyData(d.shopify!))
        if (shopifyDataList.length > 0) {
          // Aggregate all products
          const productMap = new Map<string, { name: string; quantity: number; revenue: number }>()
          shopifyDataList.forEach((s) => {
            (s.topProducts || []).forEach((p) => {
              const existing = productMap.get(p.name)
              if (existing) {
                existing.quantity += p.quantity
                existing.revenue += p.revenue
              } else {
                productMap.set(p.name, { ...p })
              }
            })
          })
          const topProductsAggregated = Array.from(productMap.values())
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10)

          // Aggregate coupons
          const couponMap = new Map<string, { code: string; orders: number; revenue: number; discount: number }>()
          shopifyDataList.forEach((s) => {
            ((s.coupons?.topCoupons || []) as Array<Record<string, unknown>>).forEach((c) => {
              const code = (c.code as string) || ''
              const existing = couponMap.get(code)
              if (existing) {
                existing.orders += (c.orders as number) || 0
                existing.revenue += (c.revenue as number) || 0
                existing.discount += (c.discount as number) || 0
              } else {
                couponMap.set(code, {
                  code,
                  orders: (c.orders as number) || 0,
                  revenue: (c.revenue as number) || 0,
                  discount: (c.discount as number) || 0,
                })
              }
            })
          })
          const topCouponsAggregated = Array.from(couponMap.values())
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 20)

          // Aggregate UTM sources
          const utmSourceMap = new Map<string, { source: string; orders: number; revenue: number }>()
          shopifyDataList.forEach((s) => {
            ((s.utmConversions?.bySource || []) as Array<Record<string, unknown>>).forEach((u) => {
              const source = (u.source as string) || ''
              const existing = utmSourceMap.get(source)
              if (existing) {
                existing.orders += (u.orders as number) || 0
                existing.revenue += (u.revenue as number) || 0
              } else {
                utmSourceMap.set(source, {
                  source,
                  orders: (u.orders as number) || 0,
                  revenue: (u.revenue as number) || 0,
                })
              }
            })
          })

          // Aggregate Top Customers
          const customerMap = new Map<string, {
            email: string
            name: string
            ordersCount: number
            totalSpent: number
            averageOrderValue: number
            lastOrderDate: string
          }>()
          shopifyDataList.forEach((s) => {
            (s.topCustomers || []).forEach((c) => {
              if (!c.email) return // Skip customers without email
              const email = c.email.toLowerCase()
              const existing = customerMap.get(email)
              if (existing) {
                existing.ordersCount += c.ordersCount
                existing.totalSpent += c.totalSpent
                existing.averageOrderValue = existing.ordersCount > 0
                  ? existing.totalSpent / existing.ordersCount
                  : 0
                if (c.lastOrderDate > existing.lastOrderDate) {
                  existing.lastOrderDate = c.lastOrderDate
                }
              } else {
                customerMap.set(email, { ...c, email })
              }
            })
          })
          const topCustomersAggregated = Array.from(customerMap.values())
            .sort((a, b) => b.totalSpent - a.totalSpent)
            .slice(0, 10)

          const totalOrders = shopifyDataList.reduce((sum, s) => sum + (s.totalOrders || 0), 0)
          const paidOrders = shopifyDataList.reduce((sum, s) => sum + (s.paidOrders || 0), 0)
          const totalRevenue = shopifyDataList.reduce((sum, s) => sum + (s.totalRevenue || 0), 0)
          const totalOrdersWithCoupon = shopifyDataList.reduce((sum, s) => sum + (s.coupons?.totalOrdersWithCoupon || 0), 0)
          const totalOrdersWithUtm = shopifyDataList.reduce((sum, s) => sum + (s.utmConversions?.totalOrdersWithUtm || 0), 0)

          response.shopify = {
            totalRevenue,
            totalOrders,
            paidOrders,
            averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
            totalCustomers: shopifyDataList.reduce((sum, s) => sum + (s.totalCustomers || 0), 0),
            newCustomers: shopifyDataList.reduce((sum, s) => sum + (s.newCustomers || 0), 0),
            recurringCustomerRate: shopifyDataList.length > 0
              ? shopifyDataList.reduce((sum, s) => sum + (s.recurringCustomerRate || 0), 0) / shopifyDataList.length
              : 0,
            topProducts: topProductsAggregated,
            topCustomers: topCustomersAggregated,
            coupons: {
              totalOrdersWithCoupon,
              couponUsageRate: paidOrders > 0 ? (totalOrdersWithCoupon / paidOrders) * 100 : 0,
              topCoupons: topCouponsAggregated,
              totalDiscount: shopifyDataList.reduce((sum, s) => sum + (s.coupons?.totalDiscount || 0), 0),
            },
            utmConversions: {
              totalOrdersWithUtm,
              utmTrackingRate: paidOrders > 0 ? (totalOrdersWithUtm / paidOrders) * 100 : 0,
              bySource: Array.from(utmSourceMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
              byMedium: [],
              byCampaign: [],
            },
          }
        }

        response.selectedStore = {
          id: "all",
          name: "Todas as Lojas",
          platform: "aggregated",
        }
      }
    }

    // Log activity
    try {
      await adminClient.from("client_portal_activity").insert({
        portal_user_id: portalUser.id,
        client_id: clientId,
        action: "view_dashboard",
        metadata: { period, storeId },
      })
    } catch {
      // Ignore activity logging errors
    }

    return NextResponse.json(response, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    return errorResponse(request, error, "PortalDashboard")
  }
}
