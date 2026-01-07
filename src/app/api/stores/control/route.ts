import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

interface StoreWithResults {
  id: string
  client_id: string
  client_name: string
  client_company: string
  store_name: string
  store_url: string
  platform: string
  is_active: boolean
  // Results
  total_revenue_30d: number
  klaviyo_revenue_30d: number
  result_percentage: number
  // Feedback control
  feedback_frequency: 'monthly' | '30_days'
  last_feedback_date: string | null
  next_feedback_date: string | null
  last_feedback_by: string | null
  last_feedback_by_name: string | null
  feedback_status: 'on_track' | 'due_soon' | 'overdue' | 'never'
  days_until_feedback: number | null
  // Integration status
  has_shopify: boolean
  has_klaviyo: boolean
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active_only') !== 'false'

    // Fetch all stores with client info and feedback data
    let query = supabase
      .from('client_stores')
      .select(`
        id,
        client_id,
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
        clients!inner (
          id,
          name,
          company,
          status
        ),
        profiles:last_feedback_by (
          full_name
        )
      `)
      .order('store_name')

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data: stores, error } = await query

    if (error) {
      console.error('Error fetching stores:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Process each store to calculate result percentage and feedback status
    const storesWithResults: StoreWithResults[] = await Promise.all(
      (stores || []).map(async (store) => {
        // Handle the relationship data (can be object or null)
        const clientData = store.clients as unknown as { id: string; name: string; company: string; status: string } | null
        const profileData = store.profiles as unknown as { full_name: string } | null
        const client = clientData || { id: '', name: 'N/A', company: '', status: '' }
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
          // Has had feedback before but no next date set
          feedbackStatus = 'overdue'
        }

        // Fetch revenue data (simplified - in production you'd cache this)
        let totalRevenue = 0
        let klaviyoRevenue = 0

        // Check if integrations are configured
        const hasShopify = !!store.shopify_access_token
        const hasKlaviyo = !!store.klaviyo_private_key

        // Try to get cached/recent revenue data or fetch from APIs
        // For performance, we'll fetch summary data
        if (hasShopify || hasKlaviyo) {
          try {
            // Fetch Shopify data
            if (hasShopify) {
              const shopifyRes = await fetch(
                `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/shopify/report?store_id=${store.id}&period=30d`,
                { cache: 'no-store' }
              )
              if (shopifyRes.ok) {
                const shopifyData = await shopifyRes.json()
                if (shopifyData.success && shopifyData.summary) {
                  totalRevenue = shopifyData.summary.totalRevenue || 0
                }
              }
            }

            // Fetch Klaviyo data
            if (hasKlaviyo) {
              const klaviyoRes = await fetch(
                `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/klaviyo/report?store_id=${store.id}&period=30d`,
                { cache: 'no-store' }
              )
              if (klaviyoRes.ok) {
                const klaviyoData = await klaviyoRes.json()
                if (klaviyoData.success && klaviyoData.revenue) {
                  klaviyoRevenue = klaviyoData.revenue.klaviyoAttributedRevenue || 0
                  // If we don't have Shopify, use Klaviyo's total
                  if (!hasShopify && klaviyoData.revenue.totalRevenue) {
                    totalRevenue = klaviyoData.revenue.totalRevenue
                  }
                }
              }
            }
          } catch (err) {
            console.error(`Error fetching revenue for store ${store.id}:`, err)
          }
        }

        // Calculate result percentage
        const resultPercentage = totalRevenue > 0 ? (klaviyoRevenue / totalRevenue) * 100 : 0

        return {
          id: store.id,
          client_id: store.client_id,
          client_name: client.name,
          client_company: client.company || '',
          store_name: store.store_name,
          store_url: store.store_url,
          platform: store.platform,
          is_active: store.is_active,
          total_revenue_30d: totalRevenue,
          klaviyo_revenue_30d: klaviyoRevenue,
          result_percentage: Math.round(resultPercentage * 10) / 10,
          feedback_frequency: store.feedback_frequency || 'monthly',
          last_feedback_date: store.last_feedback_date,
          next_feedback_date: store.next_feedback_date,
          last_feedback_by: store.last_feedback_by,
          last_feedback_by_name: profile?.full_name || null,
          feedback_status: feedbackStatus,
          days_until_feedback: daysUntilFeedback,
          has_shopify: hasShopify,
          has_klaviyo: hasKlaviyo,
        }
      })
    )

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

    return NextResponse.json({
      success: true,
      stores: storesWithResults,
      summary: {
        total: storesWithResults.length,
        overdue: storesWithResults.filter(s => s.feedback_status === 'overdue').length,
        due_soon: storesWithResults.filter(s => s.feedback_status === 'due_soon').length,
        on_track: storesWithResults.filter(s => s.feedback_status === 'on_track').length,
        never: storesWithResults.filter(s => s.feedback_status === 'never').length,
      }
    })
  } catch (error) {
    console.error('Error in stores control API:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
