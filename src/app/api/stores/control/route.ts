import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { getKlaviyoRevenueForStore } from "@/lib/integrations/klaviyo/report-summary"
import { getShopifyReportForStore } from "@/lib/integrations/shopify/report"

const log = logger.child("StoresControl")

// Cache: keyed by request URL, TTL 10 minutes
const storesCache = new Map<string, {
  data: { stores: StoreWithResults[]; summary: Record<string, number> }
  timestamp: number
}>()
const CACHE_TTL = 10 * 60 * 1000

interface KlaviyoStoreRevenue {
  storeId: string
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
}

interface StoreWithResults {
  id: string
  client_id: string | null
  org_id: string | null
  client_name: string | null
  client_company: string
  store_name: string
  store_url: string
  platform: string
  is_active: boolean
  // Revenue data
  total_revenue_30d: number
  klaviyo_revenue_30d: number
  campaign_revenue_30d: number
  flow_revenue_30d: number
  recovery_rate: number | null
  revenue_status: 'loaded' | 'no_integration' | 'error'
  // Feedback control
  feedback_frequency: 'monthly' | '30_days'
  last_feedback_date: string | null
  next_feedback_date: string | null
  last_feedback_by: string | null
  last_feedback_by_name: string | null
  feedback_status: 'on_track' | 'due_soon' | 'overdue' | 'never'
  days_until_feedback: number | null
  // Last call (max of feedback + meeting)
  last_call_date: string | null
  last_call_source: 'feedback' | 'meeting' | null
  // Integration status
  has_shopify: boolean
  has_klaviyo: boolean
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active_only') !== 'false'
    const skipCache = searchParams.get('fresh') === 'true'

    // Check cache (10 min TTL)
    const cacheKey = `stores-control:${activeOnly}`
    const cached = storesCache.get(cacheKey)
    if (!skipCache && cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return NextResponse.json({ success: true, ...cached.data })
    }

    // Fetch all stores with client info and feedback data
    let query = supabase
      .from('client_stores')
      .select(`
        id,
        client_id,
        org_id,
        store_name,
        store_url,
        platform,
        is_active,
        shopify_access_token,
        klaviyo_private_key,
        feedback_frequency,
        last_feedback_date,
        next_feedback_date,
        last_feedback_by,
        feedback_notes,
        clients (
          id,
          name,
          company,
          status
        ),
        profiles:last_feedback_by (
          name
        )
      `)
      .order('store_name')

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data: stores, error } = await query

    if (error) {
      log.error('Error fetching stores:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Fetch last completed meeting per client
    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('client_id, scheduled_at')
      .eq('status', 'completed')
      .order('scheduled_at', { ascending: false })

    // Build map: client_id -> last meeting date
    const lastMeetingByClient = new Map<string, string>()
    if (meetingsData) {
      for (const m of meetingsData) {
        if (!lastMeetingByClient.has(m.client_id)) {
          lastMeetingByClient.set(m.client_id, m.scheduled_at)
        }
      }
    }

    // Fetch Klaviyo revenue in chunks of 5 (same approach as /api/dashboard/total-revenue)
    // This avoids rate limiting on the Klaviyo API
    const klaviyoStores = (stores || []).filter((s) => !!s.klaviyo_private_key)
    log.info(`Klaviyo revenue: ${klaviyoStores.length}/${(stores || []).length} stores have klaviyo_private_key`)
    const revenueMap = new Map<string, KlaviyoStoreRevenue>()

    const CHUNK_SIZE = 5
    for (let i = 0; i < klaviyoStores.length; i += CHUNK_SIZE) {
      const chunk = klaviyoStores.slice(i, i + CHUNK_SIZE)
      const chunkResults = await Promise.all(
        chunk.map(async (store) => {
          try {
            const revenue = await getKlaviyoRevenueForStore(store.id, '30d')
            return {
              storeId: store.id,
              totalRevenue: revenue.totalRevenue,
              campaignRevenue: revenue.campaignRevenue,
              flowRevenue: revenue.flowRevenue,
            }
          } catch (err) {
            log.warn(`Failed to fetch Klaviyo revenue for store ${store.id}:`, err)
            return { storeId: store.id, totalRevenue: -1, campaignRevenue: 0, flowRevenue: 0 }
          }
        })
      )
      for (const result of chunkResults) {
        revenueMap.set(result.storeId, result)
      }
    }

    // Fetch Shopify revenue in chunks of 5 (for recovery rate calculation)
    const shopifyStores = (stores || []).filter((s) => !!s.shopify_access_token)
    const shopifyRevenueMap = new Map<string, number>()

    for (let i = 0; i < shopifyStores.length; i += CHUNK_SIZE) {
      const chunk = shopifyStores.slice(i, i + CHUNK_SIZE)
      const chunkResults = await Promise.all(
        chunk.map(async (store) => {
          try {
            const report = await getShopifyReportForStore(store.id, '30d')
            return {
              storeId: store.id,
              totalRevenue: report.summary?.totalRevenue ?? 0,
            }
          } catch (err) {
            log.warn(`Failed to fetch Shopify revenue for store ${store.id}:`, err)
            return { storeId: store.id, totalRevenue: -1 }
          }
        })
      )
      for (const result of chunkResults) {
        shopifyRevenueMap.set(result.storeId, result.totalRevenue)
      }
    }

    // Process each store with pre-fetched revenue data
    const storesWithResults: StoreWithResults[] = (stores || []).map((store) => {
      // Handle the relationship data (can be object or null)
      const clientData = store.clients as unknown as { id: string; name: string; company: string; status: string } | null
      const profileData = store.profiles as unknown as { name: string } | null
      const client = clientData || { id: '', name: null, company: '', status: '' }
      const profile = profileData

      // Calculate feedback status
      let feedbackStatus: 'on_track' | 'due_soon' | 'overdue' | 'never' = 'never'
      let daysUntilFeedback: number | null = null

      if (store.next_feedback_date) {
        const nextDate = new Date(store.next_feedback_date)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        nextDate.setHours(0, 0, 0, 0)

        const diffTime = nextDate.getTime() - today.getTime()
        daysUntilFeedback = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        if (daysUntilFeedback < 0) {
          feedbackStatus = 'overdue'
        } else if (daysUntilFeedback <= 7) {
          feedbackStatus = 'due_soon'
        } else {
          feedbackStatus = 'on_track'
        }
      } else if (store.last_feedback_date) {
        feedbackStatus = 'overdue'
      }

      // Revenue from pre-fetched Klaviyo + Shopify data
      const hasShopify = !!store.shopify_access_token
      const hasKlaviyo = !!store.klaviyo_private_key
      const klaviyoData = revenueMap.get(store.id)
      const shopifyRevenue = shopifyRevenueMap.get(store.id) ?? 0

      let revenueStatus: 'loaded' | 'no_integration' | 'error' = 'no_integration'
      let totalRevenue = 0
      let klaviyoRevenue = 0
      let campaignRevenue = 0
      let flowRevenue = 0
      let recoveryRate: number | null = null

      if (hasShopify && shopifyRevenue > 0) {
        totalRevenue = shopifyRevenue
      }

      if (hasKlaviyo && klaviyoData) {
        if (klaviyoData.totalRevenue === -1) {
          revenueStatus = 'error'
        } else {
          revenueStatus = 'loaded'
          klaviyoRevenue = klaviyoData.totalRevenue
          campaignRevenue = klaviyoData.campaignRevenue
          flowRevenue = klaviyoData.flowRevenue
        }
      } else if (hasShopify && shopifyRevenue >= 0) {
        revenueStatus = shopifyRevenue === -1 ? 'error' : 'loaded'
      }

      // Recovery rate: how much email (Klaviyo) recovered relative to total store revenue (Shopify)
      if (totalRevenue > 0 && klaviyoRevenue > 0) {
        recoveryRate = (klaviyoRevenue / totalRevenue) * 100
      }

      // Determine last call date (max of feedback and meeting)
      const feedbackDate = store.last_feedback_date ? new Date(store.last_feedback_date) : null
      const meetingDate = store.client_id && lastMeetingByClient.has(store.client_id)
        ? new Date(lastMeetingByClient.get(store.client_id)!)
        : null

      let lastCallDate: string | null = null
      let lastCallSource: 'feedback' | 'meeting' | null = null

      if (feedbackDate && meetingDate) {
        if (feedbackDate >= meetingDate) {
          lastCallDate = store.last_feedback_date
          lastCallSource = 'feedback'
        } else {
          lastCallDate = store.client_id ? lastMeetingByClient.get(store.client_id)! : null
          lastCallSource = 'meeting'
        }
      } else if (feedbackDate) {
        lastCallDate = store.last_feedback_date
        lastCallSource = 'feedback'
      } else if (meetingDate) {
        lastCallDate = store.client_id ? lastMeetingByClient.get(store.client_id)! : null
        lastCallSource = 'meeting'
      }

      if (!store.next_feedback_date && lastCallDate && feedbackStatus === 'never') {
        feedbackStatus = 'overdue'
      }

      return {
        id: store.id,
        client_id: store.client_id,
        org_id: store.org_id,
        client_name: client.name,
        client_company: client.company || '',
        store_name: store.store_name,
        store_url: store.store_url,
        platform: store.platform,
        is_active: store.is_active,
        total_revenue_30d: totalRevenue,
        klaviyo_revenue_30d: klaviyoRevenue,
        campaign_revenue_30d: campaignRevenue,
        flow_revenue_30d: flowRevenue,
        recovery_rate: recoveryRate,
        revenue_status: revenueStatus,
        feedback_frequency: store.feedback_frequency || 'monthly',
        last_feedback_date: store.last_feedback_date,
        next_feedback_date: store.next_feedback_date,
        last_feedback_by: store.last_feedback_by,
        last_feedback_by_name: profile?.name || null,
        feedback_status: feedbackStatus,
        days_until_feedback: daysUntilFeedback,
        last_call_date: lastCallDate,
        last_call_source: lastCallSource,
        has_shopify: hasShopify,
        has_klaviyo: hasKlaviyo,
      }
    })

    // Sort by feedback status priority (overdue first, then due_soon, then never, then on_track)
    const statusPriority = { overdue: 0, due_soon: 1, never: 2, on_track: 3 }
    storesWithResults.sort((a, b) => {
      const priorityDiff = statusPriority[a.feedback_status] - statusPriority[b.feedback_status]
      if (priorityDiff !== 0) return priorityDiff
      // Secondary sort by days until feedback
      if (a.days_until_feedback !== null && b.days_until_feedback !== null) {
        return a.days_until_feedback - b.days_until_feedback
      }
      return 0
    })

    const responseData = {
      stores: storesWithResults,
      summary: {
        total: storesWithResults.length,
        overdue: storesWithResults.filter(s => s.feedback_status === 'overdue').length,
        due_soon: storesWithResults.filter(s => s.feedback_status === 'due_soon').length,
        on_track: storesWithResults.filter(s => s.feedback_status === 'on_track').length,
        never: storesWithResults.filter(s => s.feedback_status === 'never').length,
      }
    }

    // Cache result for 10 minutes
    storesCache.set(cacheKey, { data: responseData, timestamp: Date.now() })

    return NextResponse.json({ success: true, ...responseData })
  } catch (error) {
    log.error('Error in stores control API:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
