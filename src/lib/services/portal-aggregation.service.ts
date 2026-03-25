/**
 * Portal Aggregation Service
 *
 * Aggregates Klaviyo and Shopify data across multiple stores
 * for the "all stores" view in the portal dashboard.
 *
 * Extracted from portal/dashboard/route.ts — Story 54.6 (AC 54.6.3)
 */

import type { PortalKlaviyoData } from "@/lib/services/portal-klaviyo-cache.service"
import type { PortalShopifyData } from "@/lib/services/portal-shopify-cache.service"

// ─── Aggregate Klaviyo data from multiple stores ────────────────────────────

export function aggregateKlaviyoData(klaviyoDataList: PortalKlaviyoData[]) {
  if (klaviyoDataList.length === 0) return null

  // Aggregate flows from all stores
  const allFlows: Array<Record<string, unknown>> = []
  klaviyoDataList.forEach((k) => {
    if (k.topFlows) allFlows.push(...(k.topFlows as Array<Record<string, unknown>>))
  })
  const topFlowsAggregated = allFlows
    .sort((a, b) => ((b.revenue as number) || 0) - ((a.revenue as number) || 0))
    .slice(0, 10)

  // Aggregate campaigns from all stores
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
  const aggTotalRevenue = klaviyoDataList.reduce((sum, k) => sum + (k.totalRevenue || 0), 0)
  const aggCampaignRevenue = klaviyoDataList.reduce((sum, k) => sum + (k.campaignRevenue || 0), 0)
  const aggFlowRevenue = klaviyoDataList.reduce((sum, k) => sum + (k.flowRevenue || 0), 0)
  const aggStoreRevenue = klaviyoDataList.reduce((sum, k) => sum + (k.storeRevenue || 0), 0)
  const aggStoreOrders = klaviyoDataList.reduce((sum, k) => sum + (k.storeOrders || 0), 0)
  const aggConversions = klaviyoDataList.reduce((sum, k) => sum + (k.conversions || 0), 0)

  return {
    storeRevenue: aggStoreRevenue,
    storeOrders: aggStoreOrders,
    recoveryRate: aggStoreRevenue > 0 ? (aggTotalRevenue / aggStoreRevenue) * 100 : 0,
    totalLeads: klaviyoDataList.reduce((sum, k) => sum + (k.totalLeads || 0), 0),
    engagedLeads: klaviyoDataList.reduce((sum, k) => sum + (k.engagedLeads || 0), 0),
    engagementRate: (() => {
      const aggTotalLeads = klaviyoDataList.reduce((sum, k) => sum + (k.totalLeads || 0), 0)
      const aggEngagedLeads = klaviyoDataList.reduce((sum, k) => sum + (k.engagedLeads || 0), 0)
      return Math.min(aggTotalLeads > 0 ? (aggEngagedLeads / aggTotalLeads) * 100 : 0, 100)
    })(),
    totalRevenue: aggTotalRevenue,
    campaignRevenue: aggCampaignRevenue,
    flowRevenue: aggFlowRevenue,
    smsRevenue: klaviyoDataList.reduce((sum, k) => sum + (k.smsRevenue || 0), 0),
    emailsSent: totalDelivered,
    delivered: totalDelivered,
    opened: totalOpened,
    clicked: totalClicked,
    openRate: totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0,
    clickRate: totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0,
    clickToOpenRate: totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0,
    conversionRate: totalDelivered > 0 ? (aggConversions / totalDelivered) * 100 : 0,
    unsubscribeRate: klaviyoDataList.length > 0
      ? klaviyoDataList.reduce((sum, k) => sum + (k.unsubscribeRate || 0), 0) / klaviyoDataList.length
      : 0,
    bounceRate: klaviyoDataList.length > 0
      ? klaviyoDataList.reduce((sum, k) => sum + (k.bounceRate || 0), 0) / klaviyoDataList.length
      : 0,
    bounces: klaviyoDataList.reduce((sum, k) => sum + (k.bounces || 0), 0),
    campaignsCount: klaviyoDataList.reduce((sum, k) => sum + (k.campaignsCount || 0), 0),
    campaignDelivered: klaviyoDataList.reduce((sum, k) => sum + (k.campaignDelivered || 0), 0),
    campaignRevenuePercent: aggTotalRevenue > 0 ? (aggCampaignRevenue / aggTotalRevenue) * 100 : 0,
    flowsCount: klaviyoDataList.reduce((sum, k) => sum + (k.flowsCount || 0), 0),
    activeFlows: klaviyoDataList.reduce((sum, k) => sum + (k.activeFlows || 0), 0),
    flowDelivered: klaviyoDataList.reduce((sum, k) => sum + (k.flowDelivered || 0), 0),
    flowRevenuePercent: aggTotalRevenue > 0 ? (aggFlowRevenue / aggTotalRevenue) * 100 : 0,
    recentCampaigns: recentCampaignsAggregated,
    topFlows: topFlowsAggregated,
  }
}

// ─── Aggregate Shopify data from multiple stores ────────────────────────────

export function aggregateShopifyData(shopifyDataList: PortalShopifyData[]) {
  if (shopifyDataList.length === 0) return null

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

  // Aggregate UTM mediums
  const utmMediumMap = new Map<string, { medium: string; orders: number; revenue: number }>()
  shopifyDataList.forEach((s) => {
    ((s.utmConversions?.byMedium || []) as Array<Record<string, unknown>>).forEach((u) => {
      const medium = (u.medium as string) || ''
      const existing = utmMediumMap.get(medium)
      if (existing) {
        existing.orders += (u.orders as number) || 0
        existing.revenue += (u.revenue as number) || 0
      } else {
        utmMediumMap.set(medium, {
          medium,
          orders: (u.orders as number) || 0,
          revenue: (u.revenue as number) || 0,
        })
      }
    })
  })

  // Aggregate UTM campaigns
  const utmCampaignMap = new Map<string, { campaign: string; orders: number; revenue: number }>()
  shopifyDataList.forEach((s) => {
    ((s.utmConversions?.byCampaign || []) as Array<Record<string, unknown>>).forEach((u) => {
      const campaign = (u.campaign as string) || ''
      const existing = utmCampaignMap.get(campaign)
      if (existing) {
        existing.orders += (u.orders as number) || 0
        existing.revenue += (u.revenue as number) || 0
      } else {
        utmCampaignMap.set(campaign, {
          campaign,
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
      if (!c.email) return
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

  return {
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
      byMedium: Array.from(utmMediumMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      byCampaign: Array.from(utmCampaignMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    },
  }
}
