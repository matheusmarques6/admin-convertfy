import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import {
  fetchAllOrders,
  extractUtmParams,
  normalizeShopifyDomain,
  getShopInfo,
} from "@/lib/integrations/shopify/report"

interface RecoveryRequest {
  store_id: string
  date_range: { start: string; end: string }
  discount_codes: string[]
  utm_sources: string[]
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = (await request.json()) as RecoveryRequest

    if (!body.store_id) {
      throw new AppError("store_id é obrigatório", 400)
    }
    if (!body.date_range?.start || !body.date_range?.end) {
      throw new AppError("date_range (start/end) é obrigatório", 400)
    }

    const discountCodes = (body.discount_codes || []).map((c) => c.toUpperCase().trim())
    const utmSources = (body.utm_sources || []).map((s) => s.toLowerCase().trim())

    // Get store credentials
    const credentials = await getStoreCredentials(body.store_id)

    if (!credentials.shopify_store_domain || !credentials.shopify_access_token) {
      throw new AppError("Loja não possui integração Shopify configurada", 400)
    }

    const storeDomain = normalizeShopifyDomain(credentials.shopify_store_domain)
    const accessToken = credentials.shopify_access_token

    // Fetch shop info for currency and all orders in the date range
    const [shopInfo, allOrders] = await Promise.all([
      getShopInfo(storeDomain, accessToken),
      fetchAllOrders(storeDomain, accessToken, body.date_range),
    ])
    const currency = shopInfo?.currency || "BRL"

    // Filter only paid orders
    const paidOrders = allOrders.filter((o) => o.financial_status === "paid")

    const totalRevenue = paidOrders.reduce((sum, o) => sum + parseFloat(o.total_price || "0"), 0)
    const totalOrders = paidOrders.length
    const totalAov = totalOrders > 0 ? totalRevenue / totalOrders : 0

    // Identify recovered orders: discount_code match OR utm_source match
    const recoveredOrders = paidOrders.filter((order) => {
      // Check discount codes
      if (discountCodes.length > 0 && order.discount_codes?.length > 0) {
        const hasMatchingCode = order.discount_codes.some((dc) =>
          discountCodes.includes(dc.code.toUpperCase().trim())
        )
        if (hasMatchingCode) return true
      }

      // Check UTM sources
      if (utmSources.length > 0) {
        const utmParams =
          extractUtmParams(order.landing_site) || extractUtmParams(order.referring_site)
        if (utmParams?.utm_source && utmSources.includes(utmParams.utm_source.toLowerCase())) {
          return true
        }
      }

      return false
    })

    const recoveredRevenue = recoveredOrders.reduce(
      (sum, o) => sum + parseFloat(o.total_price || "0"),
      0
    )
    const recoveredOrdersCount = recoveredOrders.length
    const recoveredAov = recoveredOrdersCount > 0 ? recoveredRevenue / recoveredOrdersCount : 0
    const recoveryRate = totalRevenue > 0 ? (recoveredRevenue / totalRevenue) * 100 : 0

    // Breakdown by discount code (first matching code gets the attribution to avoid double-counting)
    const codeStats: Record<string, { code: string; revenue: number; orders: number }> = {}
    recoveredOrders.forEach((order) => {
      if (order.discount_codes?.length > 0) {
        const firstMatch = order.discount_codes.find((dc) =>
          discountCodes.includes(dc.code.toUpperCase().trim())
        )
        if (firstMatch) {
          const code = firstMatch.code.toUpperCase().trim()
          if (!codeStats[code]) {
            codeStats[code] = { code, revenue: 0, orders: 0 }
          }
          codeStats[code].orders += 1
          codeStats[code].revenue += parseFloat(order.total_price || "0")
        }
      }
    })

    // Breakdown by UTM source
    const sourceStats: Record<string, { source: string; revenue: number; orders: number }> = {}
    recoveredOrders.forEach((order) => {
      const utmParams =
        extractUtmParams(order.landing_site) || extractUtmParams(order.referring_site)
      if (utmParams?.utm_source) {
        const source = utmParams.utm_source.toLowerCase()
        if (utmSources.includes(source)) {
          if (!sourceStats[source]) {
            sourceStats[source] = { source, revenue: 0, orders: 0 }
          }
          sourceStats[source].orders += 1
          sourceStats[source].revenue += parseFloat(order.total_price || "0")
        }
      }
    })

    return NextResponse.json({
      success: true,
      currency,
      total: {
        revenue: totalRevenue,
        orders: totalOrders,
        aov: totalAov,
      },
      recovered: {
        revenue: recoveredRevenue,
        orders: recoveredOrdersCount,
        aov: recoveredAov,
      },
      recoveryRate,
      byDiscountCode: Object.values(codeStats).sort((a, b) => b.revenue - a.revenue),
      byUtmSource: Object.values(sourceStats).sort((a, b) => b.revenue - a.revenue),
    })
  } catch (error) {
    return errorResponse(request, error, "ShopifyRecoveryAnalysis")
  }
}
