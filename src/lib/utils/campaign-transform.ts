/**
 * Pure transform: API response (snake_case) -> PortalCampaign (camelCase).
 * Extracted from portal campaigns page (Story 45.7).
 */

import type { PortalCampaignApiResponse } from "@/types/campaign"
import type { PortalCampaign } from "@/lib/hooks/use-portal-campaigns-calendar"
import { STATUS_MAP, CHANNEL_MAP, COLOR_MAP } from "@/lib/constants/calendar"
import { formatDateKey } from "@/lib/utils/date"

export function transformCampaignData(apiCampaign: PortalCampaignApiResponse): PortalCampaign {
  let dateStr: string
  let timeStr: string | undefined

  if (apiCampaign.scheduled_date) {
    dateStr = apiCampaign.scheduled_date
    timeStr = apiCampaign.scheduled_time || undefined
  } else if (apiCampaign.scheduled_at) {
    const scheduledDate = new Date(apiCampaign.scheduled_at)
    if (!isNaN(scheduledDate.getTime())) {
      dateStr = formatDateKey(scheduledDate)
      timeStr = scheduledDate.toTimeString().substring(0, 5)
    } else {
      dateStr = formatDateKey(new Date())
    }
  } else {
    dateStr = formatDateKey(new Date())
  }

  const rawChannel = apiCampaign.channel || apiCampaign.campaign_type
  const resolvedChannel = CHANNEL_MAP[rawChannel] || "email"

  const storeIds = apiCampaign.store_ids || []
  const storeNames = apiCampaign.store_names || []

  return {
    id: apiCampaign.id,
    name: apiCampaign.name,
    description: apiCampaign.description || undefined,
    channel: resolvedChannel,
    type: apiCampaign.campaign_type,
    status: STATUS_MAP[apiCampaign.status] || "scheduled",
    scheduledDate: dateStr,
    scheduledTime: timeStr,
    color: apiCampaign.color || COLOR_MAP[rawChannel] || "#3b82f6",
    subjectLine: apiCampaign.subject_line || undefined,
    segmentName: apiCampaign.segment_name || undefined,
    recipients: apiCampaign.recipients ?? undefined,
    delivered: apiCampaign.delivered ?? undefined,
    opened: apiCampaign.opened ?? undefined,
    clicked: apiCampaign.clicked ?? undefined,
    converted: apiCampaign.converted ?? undefined,
    revenue: apiCampaign.revenue ?? undefined,
    currency: apiCampaign.currency || "BRL",
    source: (apiCampaign.source as PortalCampaign["source"]) || "manual",
    storeNames: storeNames.length > 0 ? storeNames : undefined,
    store: storeIds.length > 0 ? {
      id: storeIds[0],
      store_name: storeNames[0] || "Loja",
    } : undefined,
    openRate: apiCampaign.open_rate ?? undefined,
    clickRate: apiCampaign.click_rate ?? undefined,
    bounceRate: apiCampaign.bounce_rate ?? undefined,
    conversionRate: apiCampaign.conversion_rate ?? undefined,
    revenuePerRecipient: apiCampaign.revenue_per_recipient ?? undefined,
    averageOrderValue: apiCampaign.average_order_value ?? undefined,
    hasKlaviyoMetrics: apiCampaign.has_klaviyo_metrics ?? false,
    metricsFetchedAt: apiCampaign.metrics_fetched_at ?? null,
  }
}
