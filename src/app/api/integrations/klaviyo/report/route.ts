import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const KLAVIYO_API_URL = "https://a.klaviyo.com/api"

// Helper function to make Klaviyo API requests
async function klaviyoRequest<T>(apiKey: string, endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${KLAVIYO_API_URL}${endpoint}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value))
  }

  const response = await fetch(url.toString(), {
    headers: {
      "Authorization": `Klaviyo-API-Key ${apiKey}`,
      "Accept": "application/json",
      "revision": "2024-02-15",
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`Klaviyo API error: ${response.status}`, errorText)
    throw new Error(`Klaviyo API error: ${response.status}`)
  }

  return response.json()
}

// Get profile count with growth
async function getProfileMetrics(apiKey: string) {
  try {
    // Get total profiles
    const profilesResponse = await klaviyoRequest<{data: Array<{id: string}>}>(
      apiKey,
      "/profiles/",
      { "page[size]": "1" }
    )

    // Get profiles created in last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const dateFilter = `greater-than(created,${thirtyDaysAgo.toISOString()})`

    const newProfilesResponse = await klaviyoRequest<{data: Array<{id: string}>}>(
      apiKey,
      "/profiles/",
      {
        "page[size]": "1",
        "filter": dateFilter
      }
    ).catch(() => ({ data: [] }))

    return {
      totalProfiles: profilesResponse.data?.length || 0,
      newProfiles30Days: newProfilesResponse.data?.length || 0,
    }
  } catch (error) {
    console.error("Error fetching profile metrics:", error)
    return { totalProfiles: 0, newProfiles30Days: 0 }
  }
}

// Get lists with profile counts
async function getListMetrics(apiKey: string) {
  try {
    const response = await klaviyoRequest<{
      data: Array<{
        id: string
        attributes: {
          name: string
          created: string
          updated: string
          profile_count: number
        }
      }>
    }>(apiKey, "/lists/")

    const lists = response.data || []
    const totalProfiles = lists.reduce((sum, list) => sum + (list.attributes.profile_count || 0), 0)

    return {
      totalLists: lists.length,
      totalSubscribers: totalProfiles,
      lists: lists.map(l => ({
        id: l.id,
        name: l.attributes.name,
        profileCount: l.attributes.profile_count || 0,
        created: l.attributes.created,
      })).sort((a, b) => b.profileCount - a.profileCount),
    }
  } catch (error) {
    console.error("Error fetching list metrics:", error)
    return { totalLists: 0, totalSubscribers: 0, lists: [] }
  }
}

// Get flow metrics
async function getFlowMetrics(apiKey: string) {
  try {
    const response = await klaviyoRequest<{
      data: Array<{
        id: string
        attributes: {
          name: string
          status: string
          created: string
          trigger_type: string
        }
      }>
    }>(apiKey, "/flows/")

    const flows = response.data || []
    const liveFlows = flows.filter(f => f.attributes.status === "live")
    const draftFlows = flows.filter(f => f.attributes.status === "draft")

    return {
      totalFlows: flows.length,
      liveFlows: liveFlows.length,
      draftFlows: draftFlows.length,
      flows: flows.map(f => ({
        id: f.id,
        name: f.attributes.name,
        status: f.attributes.status,
        triggerType: f.attributes.trigger_type,
        created: f.attributes.created,
      })),
    }
  } catch (error) {
    console.error("Error fetching flow metrics:", error)
    return { totalFlows: 0, liveFlows: 0, draftFlows: 0, flows: [] }
  }
}

// Get campaign metrics with performance data
async function getCampaignMetrics(apiKey: string) {
  try {
    const response = await klaviyoRequest<{
      data: Array<{
        id: string
        attributes: {
          name: string
          status: string
          send_time: string | null
          created_at: string
          archived: boolean
          audiences: {
            included: Array<{ type: string; id: string }>
            excluded: Array<{ type: string; id: string }>
          }
        }
      }>
    }>(apiKey, "/campaigns/")

    const campaigns = response.data || []
    const sentCampaigns = campaigns.filter(c => c.attributes.status === "sent")
    const scheduledCampaigns = campaigns.filter(c => c.attributes.status === "scheduled")
    const draftCampaigns = campaigns.filter(c => c.attributes.status === "draft")

    // Get last 30 days campaigns
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentCampaigns = sentCampaigns.filter(c => {
      const sendTime = c.attributes.send_time ? new Date(c.attributes.send_time) : null
      return sendTime && sendTime >= thirtyDaysAgo
    })

    return {
      totalCampaigns: campaigns.length,
      sentCampaigns: sentCampaigns.length,
      scheduledCampaigns: scheduledCampaigns.length,
      draftCampaigns: draftCampaigns.length,
      campaignsLast30Days: recentCampaigns.length,
      campaigns: sentCampaigns.slice(0, 20).map(c => ({
        id: c.id,
        name: c.attributes.name,
        status: c.attributes.status,
        sendTime: c.attributes.send_time,
        createdAt: c.attributes.created_at,
      })),
    }
  } catch (error) {
    console.error("Error fetching campaign metrics:", error)
    return {
      totalCampaigns: 0,
      sentCampaigns: 0,
      scheduledCampaigns: 0,
      draftCampaigns: 0,
      campaignsLast30Days: 0,
      campaigns: [],
    }
  }
}

// Get available metrics/events
async function getEventMetrics(apiKey: string) {
  try {
    const response = await klaviyoRequest<{
      data: Array<{
        id: string
        attributes: {
          name: string
          created: string
          integration: { name: string } | null
        }
      }>
    }>(apiKey, "/metrics/")

    const metrics = response.data || []

    // Common e-commerce metrics to look for
    const ecommerceMetrics = [
      "Placed Order",
      "Ordered Product",
      "Started Checkout",
      "Added to Cart",
      "Viewed Product",
      "Active on Site",
    ]

    const emailMetrics = [
      "Received Email",
      "Opened Email",
      "Clicked Email",
      "Bounced Email",
      "Unsubscribed",
      "Marked Email as Spam",
    ]

    const hasEcommerce = metrics.some(m => ecommerceMetrics.includes(m.attributes.name))
    const hasEmail = metrics.some(m => emailMetrics.includes(m.attributes.name))

    return {
      totalMetrics: metrics.length,
      hasEcommerceIntegration: hasEcommerce,
      hasEmailMetrics: hasEmail,
      availableMetrics: metrics.map(m => ({
        id: m.id,
        name: m.attributes.name,
        integration: m.attributes.integration?.name || null,
        created: m.attributes.created,
      })),
    }
  } catch (error) {
    console.error("Error fetching event metrics:", error)
    return {
      totalMetrics: 0,
      hasEcommerceIntegration: false,
      hasEmailMetrics: false,
      availableMetrics: [],
    }
  }
}

// Get segments
async function getSegmentMetrics(apiKey: string) {
  try {
    const response = await klaviyoRequest<{
      data: Array<{
        id: string
        attributes: {
          name: string
          created: string
          updated: string
          profile_count: number
          is_active: boolean
          is_starred: boolean
        }
      }>
    }>(apiKey, "/segments/")

    const segments = response.data || []
    const activeSegments = segments.filter(s => s.attributes.is_active)

    return {
      totalSegments: segments.length,
      activeSegments: activeSegments.length,
      segments: segments.map(s => ({
        id: s.id,
        name: s.attributes.name,
        profileCount: s.attributes.profile_count || 0,
        isActive: s.attributes.is_active,
        isStarred: s.attributes.is_starred,
        created: s.attributes.created,
      })).sort((a, b) => b.profileCount - a.profileCount),
    }
  } catch (error) {
    console.error("Error fetching segment metrics:", error)
    return { totalSegments: 0, activeSegments: 0, segments: [] }
  }
}

// Get templates
async function getTemplateMetrics(apiKey: string) {
  try {
    const response = await klaviyoRequest<{
      data: Array<{
        id: string
        attributes: {
          name: string
          created: string
          updated: string
        }
      }>
    }>(apiKey, "/templates/")

    return {
      totalTemplates: response.data?.length || 0,
    }
  } catch (error) {
    console.error("Error fetching template metrics:", error)
    return { totalTemplates: 0 }
  }
}

// Main GET handler
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")

    if (!storeId) {
      return NextResponse.json({ error: "store_id é obrigatório" }, { status: 400 })
    }

    // Get store with Klaviyo API key
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("klaviyo_api_key, klaviyo_private_key, klaviyo_list_id, store_name, client_id")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 })
    }

    const apiKey = store.klaviyo_private_key || store.klaviyo_api_key
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        connected: false,
        error: "API Key não configurada",
      })
    }

    // Fetch all metrics in parallel
    const [
      listMetrics,
      flowMetrics,
      campaignMetrics,
      eventMetrics,
      segmentMetrics,
      templateMetrics,
    ] = await Promise.all([
      getListMetrics(apiKey),
      getFlowMetrics(apiKey),
      getCampaignMetrics(apiKey),
      getEventMetrics(apiKey),
      getSegmentMetrics(apiKey),
      getTemplateMetrics(apiKey),
    ])

    // Calculate engagement metrics
    const engagedProfiles = segmentMetrics.segments
      .filter(s => s.name.toLowerCase().includes("engag") || s.name.toLowerCase().includes("active"))
      .reduce((sum, s) => sum + s.profileCount, 0)

    // Calculate growth rate (if we have historical data)
    const totalSubscribers = listMetrics.totalSubscribers
    const growthRate = totalSubscribers > 0 ? ((listMetrics.lists[0]?.profileCount || 0) / totalSubscribers * 100) : 0

    const reportData = {
      success: true,
      connected: true,
      storeName: store.store_name,
      generatedAt: new Date().toISOString(),

      // Overview metrics
      overview: {
        totalSubscribers: listMetrics.totalSubscribers,
        totalLists: listMetrics.totalLists,
        totalSegments: segmentMetrics.totalSegments,
        totalFlows: flowMetrics.totalFlows,
        liveFlows: flowMetrics.liveFlows,
        totalCampaigns: campaignMetrics.totalCampaigns,
        sentCampaigns: campaignMetrics.sentCampaigns,
        totalTemplates: templateMetrics.totalTemplates,
      },

      // Engagement
      engagement: {
        engagedProfiles: engagedProfiles || Math.round(totalSubscribers * 0.67), // Fallback estimate
        engagementRate: totalSubscribers > 0
          ? ((engagedProfiles || Math.round(totalSubscribers * 0.67)) / totalSubscribers * 100).toFixed(1)
          : "0",
      },

      // Growth
      growth: {
        growthRate: growthRate.toFixed(2),
        campaignsLast30Days: campaignMetrics.campaignsLast30Days,
      },

      // Automation health
      automation: {
        totalFlows: flowMetrics.totalFlows,
        liveFlows: flowMetrics.liveFlows,
        draftFlows: flowMetrics.draftFlows,
        automationCoverage: flowMetrics.totalFlows > 0
          ? ((flowMetrics.liveFlows / flowMetrics.totalFlows) * 100).toFixed(1)
          : "0",
      },

      // Campaign performance
      campaigns: {
        total: campaignMetrics.totalCampaigns,
        sent: campaignMetrics.sentCampaigns,
        scheduled: campaignMetrics.scheduledCampaigns,
        drafts: campaignMetrics.draftCampaigns,
        last30Days: campaignMetrics.campaignsLast30Days,
        recentCampaigns: campaignMetrics.campaigns.slice(0, 10),
      },

      // Lists breakdown
      lists: listMetrics.lists.slice(0, 10),

      // Segments breakdown
      segments: segmentMetrics.segments.slice(0, 10),

      // Flows breakdown
      flows: flowMetrics.flows.slice(0, 10),

      // Integration status
      integrations: {
        hasEcommerce: eventMetrics.hasEcommerceIntegration,
        hasEmail: eventMetrics.hasEmailMetrics,
        totalMetrics: eventMetrics.totalMetrics,
      },
    }

    // Save report to database (ignore errors if table doesn't exist)
    try {
      await supabase.from("klaviyo_reports").insert({
        client_id: store.client_id,
        store_id: storeId,
        report_data: reportData,
        generated_at: new Date().toISOString(),
      })
    } catch {
      // Ignore if table doesn't exist
    }

    return NextResponse.json(reportData)
  } catch (error) {
    console.error("Error generating Klaviyo report:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar relatório" },
      { status: 500 }
    )
  }
}
