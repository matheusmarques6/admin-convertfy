import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationsShopifyReport")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// Use a more recent API version - Shopify deprecates old versions after ~12 months
const SHOPIFY_API_VERSION = "2024-10"

// Helper to normalize Shopify domain
function normalizeShopifyDomain(domain: string): string {
  // Remove protocol and trailing slashes
  let clean = domain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")

  // If it doesn't contain .myshopify.com, add it
  if (!clean.includes(".myshopify.com")) {
    // Remove any other domain suffixes if present
    clean = clean.replace(/\.(com|com\.br|net|org|store|shop)$/i, "")
    clean = `${clean}.myshopify.com`
  }

  return clean
}

// CORS headers helper


// Handle OPTIONS preflight requests


interface ShopifyRequestOptions {
  method?: "GET" | "POST"
  body?: Record<string, unknown>
}

interface ShopifyPaginatedResponse<T> {
  data: T
  nextPageUrl: string | null
}

// Helper function to make Shopify API requests with pagination support
async function shopifyRequest<T>(
  storeDomain: string,
  accessToken: string,
  endpoint: string,
  options?: ShopifyRequestOptions
): Promise<T> {
  const { method = "GET", body } = options || {}

  const url = endpoint.startsWith("http")
    ? endpoint
    : `https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`

  const response = await fetch(url, {
    method,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    ...(body && { body: JSON.stringify(body) }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    log.error(`Shopify API error: ${response.status}`, errorText)
    throw new Error(`Shopify API error: ${response.status}`)
  }

  return response.json()
}

// Helper function to make paginated Shopify API requests
async function shopifyPaginatedRequest<T>(
  storeDomain: string,
  accessToken: string,
  endpoint: string
): Promise<ShopifyPaginatedResponse<T>> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    log.error(`Shopify API error: ${response.status}`, errorText)
    throw new Error(`Shopify API error: ${response.status}`)
  }

  // Parse Link header for pagination
  const linkHeader = response.headers.get("Link")
  let nextPageUrl: string | null = null

  if (linkHeader) {
    const links = linkHeader.split(",")
    for (const link of links) {
      const match = link.match(/<([^>]+)>;\s*rel="next"/)
      if (match) {
        nextPageUrl = match[1]
        break
      }
    }
  }

  const data = await response.json()
  return { data, nextPageUrl }
}

// Order type definition
interface ShopifyOrder {
  id: number
  total_price: string
  subtotal_price: string
  total_tax: string
  total_discounts: string
  financial_status: string
  fulfillment_status: string | null
  created_at: string
  tags: string
  source_name: string
  referring_site: string | null
  landing_site: string | null
  discount_codes: Array<{
    code: string
    amount: string
    type: string
  }>
  line_items: Array<{
    product_id: number
    variant_id: number
    title: string
    variant_title: string
    quantity: number
    price: string
    sku: string
  }>
  customer?: {
    id: number
    email: string
    orders_count: number
  }
}

// Helper to extract UTM params from URL
function extractUtmParams(url: string | null): {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
} | null {
  if (!url) return null
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`)
    const params: Record<string, string> = {}

    const utmParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
    utmParams.forEach(param => {
      const value = urlObj.searchParams.get(param)
      if (value) params[param] = value
    })

    return Object.keys(params).length > 0 ? params : null
  } catch {
    return null
  }
}

// Fetch all orders with pagination
async function fetchAllOrders(
  storeDomain: string,
  accessToken: string,
  dateRange: { start: string; end: string }
): Promise<ShopifyOrder[]> {
  const allOrders: ShopifyOrder[] = []

  let endpoint = `/orders.json?status=any&created_at_min=${dateRange.start}&created_at_max=${dateRange.end}&limit=250`
  let pageCount = 0
  const maxPages = 50 // Safety limit to prevent infinite loops

  while (endpoint && pageCount < maxPages) {
    pageCount++
    log.debug(`Fetching orders page ${pageCount}...`)

    const { data, nextPageUrl } = await shopifyPaginatedRequest<{
      orders: ShopifyOrder[]
    }>(storeDomain, accessToken, endpoint)

    if (data.orders && data.orders.length > 0) {
      allOrders.push(...data.orders)
    }

    endpoint = nextPageUrl || ""
  }

  log.debug(`Total orders fetched: ${allOrders.length} (${pageCount} pages)`)
  return allOrders
}

// Get shop info
async function getShopInfo(storeDomain: string, accessToken: string) {
  try {
    const response = await shopifyRequest<{
      shop: {
        id: number
        name: string
        email: string
        domain: string
        currency: string
        money_format: string
        created_at: string
        country_name: string
        plan_name: string
      }
    }>(storeDomain, accessToken, "/shop.json")

    return {
      id: response.shop.id,
      name: response.shop.name,
      email: response.shop.email,
      domain: response.shop.domain,
      currency: response.shop.currency,
      moneyFormat: response.shop.money_format,
      createdAt: response.shop.created_at,
      country: response.shop.country_name,
      plan: response.shop.plan_name,
    }
  } catch (error) {
    log.error("Error fetching shop info:", error)
    return null
  }
}

// Get orders summary with best-selling products (with full pagination)
async function getOrdersSummary(
  storeDomain: string,
  accessToken: string,
  dateRange: { start: string; end: string }
) {
  try {
    // Fetch ALL orders with pagination
    const orders = await fetchAllOrders(storeDomain, accessToken, dateRange)

    // Calculate metrics
    const totalOrders = orders.length
    const paidOrders = orders.filter(o => o.financial_status === "paid")
    const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || "0"), 0)
    const paidRevenue = paidOrders.reduce((sum, o) => sum + parseFloat(o.total_price || "0"), 0)
    const totalTax = orders.reduce((sum, o) => sum + parseFloat(o.total_tax || "0"), 0)
    const totalDiscounts = orders.reduce((sum, o) => sum + parseFloat(o.total_discounts || "0"), 0)
    const subtotal = orders.reduce((sum, o) => sum + parseFloat(o.subtotal_price || "0"), 0)

    // Count items
    const totalItems = orders.reduce(
      (sum, o) => sum + o.line_items.reduce((s, item) => s + item.quantity, 0),
      0
    )

    // Recurring customer rate calculation - using Shopify's definition:
    // "Taxa de clientes recorrentes = clientes recorrentes / clientes"
    // A "recurring customer" is one who has orders_count > 1 (has ordered before historically)

    // First, collect unique customer IDs from orders
    const uniqueCustomerIds = new Set<number>()
    orders.forEach(order => {
      if (order.customer?.id) {
        uniqueCustomerIds.add(order.customer.id)
      }
    })

    log.debug(`[Shopify] Found ${uniqueCustomerIds.size} unique customers in orders`)

    // Fetch customer data to get accurate orders_count
    // The REST API doesn't return orders_count in the order's customer object anymore
    const customerOrdersCounts = new Map<number, number>()

    // Fetch customers in batches (up to 50 at a time to avoid rate limits)
    const customerIds = Array.from(uniqueCustomerIds)
    const batchSize = 50
    // Fetch ALL customers to get accurate recurring rate
    const customersToFetch = customerIds
    log.debug(`[Shopify] Fetching orders_count for ${customersToFetch.length} customers...`)

    for (let i = 0; i < customersToFetch.length; i += batchSize) {
      const batch = customersToFetch.slice(i, i + batchSize)
      const idsParam = batch.join(',')

      try {
        const customersResponse = await shopifyRequest<{
          customers: Array<{
            id: number
            orders_count: number
          }>
        }>(storeDomain, accessToken, `/customers.json?ids=${idsParam}&fields=id,orders_count`)

        if (customersResponse?.customers) {
          customersResponse.customers.forEach(c => {
            customerOrdersCounts.set(c.id, c.orders_count || 0)
          })
        }
      } catch (error) {
        log.error(`[Shopify] Error fetching customer batch:`, error)
      }

      // Small delay between batches
      if (i + batchSize < customersToFetch.length) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    log.debug(`[Shopify] Fetched orders_count for ${customerOrdersCounts.size} customers`)

    // Now calculate recurring customers using the fetched data
    const customerData = new Map<string, { id: number; isRecurring: boolean; ordersInPeriod: number }>()

    orders.forEach(order => {
      const customerId = order.customer?.id
      const customerKey = order.customer?.email?.toLowerCase() || customerId?.toString()

      if (customerKey && customerId) {
        const existing = customerData.get(customerKey)
        // Check orders_count from our fetched data, or from the order if available
        const ordersCount = customerOrdersCounts.get(customerId) ?? (order.customer?.orders_count || 0)
        const isRecurring = ordersCount > 1

        if (existing) {
          existing.ordersInPeriod += 1
          if (isRecurring) existing.isRecurring = true
        } else {
          customerData.set(customerKey, { id: customerId, isRecurring, ordersInPeriod: 1 })
        }
      }
    })

    const uniqueCustomers = customerData.size

    // Count customers who are recurring (have orders_count > 1 historically)
    const recurringCustomers = Array.from(customerData.values()).filter(c => c.isRecurring).length

    // Shopify formula: recurring customers / total customers
    const recurringCustomerRate = uniqueCustomers > 0 ? (recurringCustomers / uniqueCustomers) * 100 : 0

    log.debug(`[Shopify] Unique customers: ${uniqueCustomers}`)
    log.debug(`[Shopify] Recurring customers (orders_count > 1): ${recurringCustomers}`)
    log.debug(`[Shopify] Recurring rate: ${recurringCustomerRate.toFixed(2)}%`)

    // Debug: log sample of customer data
    const sampleCustomers = Array.from(customerData.entries()).slice(0, 5)
    sampleCustomers.forEach(([key, data]) => {
      const ordersCount = customerOrdersCounts.get(data.id) || 0
      log.debug(`[Shopify] Customer ${key}: id=${data.id}, orders_count=${ordersCount}, recurring=${data.isRecurring}`)
    })

    // Also track orders from recurring customers (alternative metric)
    const ordersFromRecurringCustomers = orders.filter(o => {
      const customerKey = o.customer?.email?.toLowerCase() || o.customer?.id?.toString()
      return customerKey && customerData.get(customerKey)?.isRecurring
    }).length

    // SMS Attribution - detect orders from YSMS or other SMS marketing
    // Check tags, source_name, referring_site for SMS-related keywords
    const smsKeywords = ['sms', 'ysms', 'sms-marketing', 'sms_marketing', 'text', 'whatsapp']
    const smsOrders = orders.filter(order => {
      const tags = (order.tags || '').toLowerCase()
      const source = (order.source_name || '').toLowerCase()
      const referrer = (order.referring_site || '').toLowerCase()
      const landing = (order.landing_site || '').toLowerCase()

      return smsKeywords.some(keyword =>
        tags.includes(keyword) ||
        source.includes(keyword) ||
        referrer.includes(keyword) ||
        landing.includes(keyword)
      )
    })

    const smsRevenue = smsOrders.reduce((sum, o) => sum + parseFloat(o.total_price || "0"), 0)
    const smsOrdersCount = smsOrders.length

    // ========== COUPON ANALYSIS (Paid Orders Only) ==========
    const couponStats: Record<string, { code: string; orders: number; revenue: number; discount: number }> = {}
    paidOrders.forEach(order => {
      if (order.discount_codes && order.discount_codes.length > 0) {
        order.discount_codes.forEach(dc => {
          const code = dc.code.toUpperCase()
          if (!couponStats[code]) {
            couponStats[code] = { code, orders: 0, revenue: 0, discount: 0 }
          }
          couponStats[code].orders += 1
          couponStats[code].revenue += parseFloat(order.total_price || "0")
          couponStats[code].discount += parseFloat(dc.amount || "0")
        })
      }
    })

    const couponConversions = Object.values(couponStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20)

    const totalOrdersWithCoupon = paidOrders.filter(o => o.discount_codes && o.discount_codes.length > 0).length
    const couponUsageRate = paidOrders.length > 0 ? (totalOrdersWithCoupon / paidOrders.length) * 100 : 0

    // ========== UTM ANALYSIS (Paid Orders Only) ==========
    const utmSourceStats: Record<string, { source: string; orders: number; revenue: number }> = {}
    const utmMediumStats: Record<string, { medium: string; orders: number; revenue: number }> = {}
    const utmCampaignStats: Record<string, { campaign: string; orders: number; revenue: number }> = {}

    let ordersWithUtm = 0

    paidOrders.forEach(order => {
      // Try landing_site first, then referring_site
      const utmParams = extractUtmParams(order.landing_site) || extractUtmParams(order.referring_site)

      if (utmParams) {
        ordersWithUtm++
        const revenue = parseFloat(order.total_price || "0")

        // UTM Source
        if (utmParams.utm_source) {
          const source = utmParams.utm_source.toLowerCase()
          if (!utmSourceStats[source]) {
            utmSourceStats[source] = { source, orders: 0, revenue: 0 }
          }
          utmSourceStats[source].orders += 1
          utmSourceStats[source].revenue += revenue
        }

        // UTM Medium
        if (utmParams.utm_medium) {
          const medium = utmParams.utm_medium.toLowerCase()
          if (!utmMediumStats[medium]) {
            utmMediumStats[medium] = { medium, orders: 0, revenue: 0 }
          }
          utmMediumStats[medium].orders += 1
          utmMediumStats[medium].revenue += revenue
        }

        // UTM Campaign
        if (utmParams.utm_campaign) {
          const campaign = utmParams.utm_campaign.toLowerCase()
          if (!utmCampaignStats[campaign]) {
            utmCampaignStats[campaign] = { campaign, orders: 0, revenue: 0 }
          }
          utmCampaignStats[campaign].orders += 1
          utmCampaignStats[campaign].revenue += revenue
        }
      }
    })

    const utmConversions = {
      totalOrdersWithUtm: ordersWithUtm,
      utmTrackingRate: paidOrders.length > 0 ? (ordersWithUtm / paidOrders.length) * 100 : 0,
      bySource: Object.values(utmSourceStats).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      byMedium: Object.values(utmMediumStats).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      byCampaign: Object.values(utmCampaignStats).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    }

    // Collect unique sources for debugging/analysis
    const orderSources: Record<string, { count: number; revenue: number }> = {}
    orders.forEach(order => {
      const source = order.source_name || 'unknown'
      if (!orderSources[source]) {
        orderSources[source] = { count: 0, revenue: 0 }
      }
      orderSources[source].count += 1
      orderSources[source].revenue += parseFloat(order.total_price || "0")
    })

    // ========== TOP CUSTOMERS ANALYSIS (from orders in period) ==========
    const topCustomersMap: Record<string, {
      customerId: number
      email: string
      name: string
      ordersCount: number
      totalSpent: number
      averageOrderValue: number
      lastOrderDate: string
    }> = {}

    paidOrders.forEach(order => {
      if (!order.customer?.id || !order.customer?.email) return

      const customerId = order.customer.id
      const customerKey = order.customer.email.toLowerCase()

      if (!topCustomersMap[customerKey]) {
        topCustomersMap[customerKey] = {
          customerId,
          email: order.customer.email,
          name: order.customer.email.split('@')[0], // Will be enriched later
          ordersCount: 0,
          totalSpent: 0,
          averageOrderValue: 0,
          lastOrderDate: order.created_at,
        }
      }

      topCustomersMap[customerKey].ordersCount += 1
      topCustomersMap[customerKey].totalSpent += parseFloat(order.total_price || "0")

      // Track most recent order
      if (order.created_at > topCustomersMap[customerKey].lastOrderDate) {
        topCustomersMap[customerKey].lastOrderDate = order.created_at
      }
    })

    // Calculate average order value for each customer
    Object.values(topCustomersMap).forEach(customer => {
      customer.averageOrderValue = customer.ordersCount > 0
        ? customer.totalSpent / customer.ordersCount
        : 0
    })

    // Sort by total spent and get top 10
    const topCustomers = Object.values(topCustomersMap)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10)

    // Calculate best-selling products from order line items
    const productSales: Record<number, {
      productId: number
      title: string
      variantTitle: string
      sku: string
      quantitySold: number
      revenue: number
      ordersCount: number
    }> = {}

    orders.forEach(order => {
      order.line_items.forEach(item => {
        const key = item.product_id || item.variant_id
        if (!productSales[key]) {
          productSales[key] = {
            productId: item.product_id,
            title: item.title,
            variantTitle: item.variant_title || "",
            sku: item.sku || "",
            quantitySold: 0,
            revenue: 0,
            ordersCount: 0,
          }
        }
        productSales[key].quantitySold += item.quantity
        productSales[key].revenue += parseFloat(item.price || "0") * item.quantity
        productSales[key].ordersCount += 1
      })
    })

    // Sort by revenue and get top 10 best-selling products
    const bestSellingProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    // Fulfillment status
    const fulfilledOrders = orders.filter(o => o.fulfillment_status === "fulfilled").length
    const unfulfilled = orders.filter(o => !o.fulfillment_status || o.fulfillment_status === "unfulfilled").length
    const partiallyFulfilled = orders.filter(o => o.fulfillment_status === "partial").length

    // Financial status breakdown
    const statusBreakdown = {
      paid: paidOrders.length,
      pending: orders.filter(o => o.financial_status === "pending").length,
      refunded: orders.filter(o => o.financial_status === "refunded").length,
      voided: orders.filter(o => o.financial_status === "voided").length,
    }

    // Daily breakdown
    const dailyData: Record<string, { revenue: number; orders: number }> = {}
    orders.forEach(order => {
      const date = order.created_at.split("T")[0]
      if (!dailyData[date]) {
        dailyData[date] = { revenue: 0, orders: 0 }
      }
      dailyData[date].revenue += parseFloat(order.total_price || "0")
      dailyData[date].orders += 1
    })

    const timeSeries = Object.entries(dailyData)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return {
      totalOrders,
      paidOrders: paidOrders.length,
      totalRevenue,
      paidRevenue,
      subtotal,
      totalTax,
      totalDiscounts,
      totalItems,
      uniqueCustomers,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      recurringCustomersInPeriod: recurringCustomers,
      ordersFromRecurringCustomers,
      recurringCustomerRate,
      bestSellingProducts,
      fulfillment: {
        fulfilled: fulfilledOrders,
        unfulfilled,
        partiallyFulfilled,
      },
      financialStatus: statusBreakdown,
      timeSeries,
      // SMS Marketing Attribution (YSMS, etc)
      smsMarketing: {
        revenue: smsRevenue,
        orders: smsOrdersCount,
        percentage: totalRevenue > 0 ? (smsRevenue / totalRevenue) * 100 : 0,
      },
      // Coupon/Discount Code Analysis (Paid Orders Only)
      coupons: {
        totalOrdersWithCoupon,
        couponUsageRate,
        topCoupons: couponConversions,
        totalDiscount: couponConversions.reduce((sum, c) => sum + c.discount, 0),
      },
      // UTM Tracking Analysis (Paid Orders Only)
      utmConversions,
      // Order sources breakdown for analysis
      orderSources: Object.entries(orderSources)
        .map(([source, data]) => ({ source, ...data }))
        .sort((a, b) => b.revenue - a.revenue),
      // Top customers by revenue in period
      topCustomers,
    }
  } catch (error) {
    log.error("Error fetching orders:", error)
    return {
      totalOrders: 0,
      paidOrders: 0,
      totalRevenue: 0,
      paidRevenue: 0,
      subtotal: 0,
      totalTax: 0,
      totalDiscounts: 0,
      totalItems: 0,
      uniqueCustomers: 0,
      averageOrderValue: 0,
      recurringCustomersInPeriod: 0,
      ordersFromRecurringCustomers: 0,
      recurringCustomerRate: 0,
      bestSellingProducts: [],
      fulfillment: { fulfilled: 0, unfulfilled: 0, partiallyFulfilled: 0 },
      financialStatus: { paid: 0, pending: 0, refunded: 0, voided: 0 },
      timeSeries: [],
      smsMarketing: { revenue: 0, orders: 0, percentage: 0 },
      coupons: { totalOrdersWithCoupon: 0, couponUsageRate: 0, topCoupons: [], totalDiscount: 0 },
      utmConversions: { totalOrdersWithUtm: 0, utmTrackingRate: 0, bySource: [], byMedium: [], byCampaign: [] },
      orderSources: [],
      topCustomers: [],
    }
  }
}

// Get products summary
async function getProductsSummary(storeDomain: string, accessToken: string) {
  try {
    const response = await shopifyRequest<{
      count: number
    }>(storeDomain, accessToken, "/products/count.json")

    const inventoryResponse = await shopifyRequest<{
      products: Array<{
        id: number
        title: string
        status: string
        variants: Array<{
          inventory_quantity: number
          price: string
        }>
      }>
    }>(storeDomain, accessToken, "/products.json?limit=250")

    const products = inventoryResponse.products || []
    const activeProducts = products.filter(p => p.status === "active").length
    const draftProducts = products.filter(p => p.status === "draft").length
    const archivedProducts = products.filter(p => p.status === "archived").length

    // Inventory calculations
    let totalInventory = 0
    let lowStockCount = 0
    let outOfStockCount = 0

    products.forEach(product => {
      product.variants.forEach(variant => {
        const qty = variant.inventory_quantity || 0
        totalInventory += qty
        if (qty === 0) outOfStockCount++
        else if (qty < 10) lowStockCount++
      })
    })

    return {
      totalProducts: response.count || products.length,
      activeProducts,
      draftProducts,
      archivedProducts,
      totalInventory,
      lowStockCount,
      outOfStockCount,
    }
  } catch (error) {
    log.error("Error fetching products:", error)
    return {
      totalProducts: 0,
      activeProducts: 0,
      draftProducts: 0,
      archivedProducts: 0,
      totalInventory: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
    }
  }
}

// Get customers summary with proper counts using date-filtered API
async function getCustomersSummary(
  storeDomain: string,
  accessToken: string,
  dateRange: { start: string; end: string }
) {
  try {
    // Get total customers count
    const countResponse = await shopifyRequest<{
      count: number
    }>(storeDomain, accessToken, "/customers/count.json")

    // Get new customers count for the period using date filter
    const newCustomersCountResponse = await shopifyRequest<{
      count: number
    }>(storeDomain, accessToken, `/customers/count.json?created_at_min=${dateRange.start}`)

    // Get sample of customers for metrics calculation (most recent)
    const customersResponse = await shopifyRequest<{
      customers: Array<{
        id: number
        orders_count: number
        total_spent: string
        created_at: string
        accepts_marketing: boolean
      }>
    }>(storeDomain, accessToken, "/customers.json?limit=250&order=created_at desc")

    const customers = customersResponse.customers || []
    const totalCustomersCount = countResponse.count || 0
    const newCustomersInPeriod = newCustomersCountResponse.count || 0

    const totalSpent = customers.reduce((sum, c) => sum + parseFloat(c.total_spent || "0"), 0)
    const totalOrders = customers.reduce((sum, c) => sum + (c.orders_count || 0), 0)
    const returningCustomers = customers.filter(c => (c.orders_count || 0) > 1).length
    const firstTimeCustomers = customers.filter(c => (c.orders_count || 0) === 1).length
    const marketingOptIn = customers.filter(c => c.accepts_marketing).length

    // Calculate recurring customer rate based on sample
    // This is an approximation since we're using a sample of 250 customers
    const sampleSize = customers.length
    const recurringRate = sampleSize > 0 ? (returningCustomers / sampleSize) * 100 : 0

    log.debug(`[Shopify] Customers - Total: ${totalCustomersCount}, New in period: ${newCustomersInPeriod}, Sample: ${sampleSize}`)
    log.debug(`[Shopify] Sample metrics - Returning: ${returningCustomers}, First-time: ${firstTimeCustomers}, Marketing: ${marketingOptIn}`)

    return {
      totalCustomers: totalCustomersCount,
      totalSpent,
      totalOrders,
      averageOrdersPerCustomer: sampleSize > 0 ? totalOrders / sampleSize : 0,
      averageSpentPerCustomer: sampleSize > 0 ? totalSpent / sampleSize : 0,
      returningCustomers,
      firstTimeCustomers,
      recurringCustomerRate: recurringRate,
      newCustomersLast30Days: newCustomersInPeriod,
      marketingOptIn,
      marketingOptInRate: sampleSize > 0 ? (marketingOptIn / sampleSize) * 100 : 0,
    }
  } catch (error) {
    log.error("Error fetching customers:", error)
    return {
      totalCustomers: 0,
      totalSpent: 0,
      totalOrders: 0,
      averageOrdersPerCustomer: 0,
      averageSpentPerCustomer: 0,
      returningCustomers: 0,
      firstTimeCustomers: 0,
      recurringCustomerRate: 0,
      newCustomersLast30Days: 0,
      marketingOptIn: 0,
      marketingOptInRate: 0,
    }
  }
}

// Main GET handler
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")
    const period = searchParams.get("period") || "30d"
    const customStartDate = searchParams.get("start_date")
    const customEndDate = searchParams.get("end_date")

    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    // Get store with Shopify credentials
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("shopify_store_domain, shopify_access_token, store_name, client_id")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      throw new AppError("Loja não encontrada", 404)
    }

    const { shopify_store_domain, shopify_access_token: accessToken } = store

    if (!shopify_store_domain || !accessToken) {
      return NextResponse.json({
        success: false,
        connected: false,
        error: "Credenciais Shopify não configuradas",
      })
    }

    // Normalize the domain
    const storeDomain = normalizeShopifyDomain(shopify_store_domain)

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

    // Fetch all data in parallel
    const [shopInfo, ordersSummary, productsSummary, customersSummary] = await Promise.all([
      getShopInfo(storeDomain, accessToken),
      getOrdersSummary(storeDomain, accessToken, dateRange),
      getProductsSummary(storeDomain, accessToken),
      getCustomersSummary(storeDomain, accessToken, dateRange),
    ])

    const reportData = {
      success: true,
      connected: true,
      storeName: store.store_name || shopInfo?.name || storeDomain,
      generatedAt: new Date().toISOString(),
      period,
      dateRange,

      // Shop info
      shop: shopInfo,

      // Orders/Revenue metrics
      orders: ordersSummary,

      // Products metrics
      products: productsSummary,

      // Customers metrics
      customers: customersSummary,

      // Summary with key metrics
      summary: {
        totalRevenue: ordersSummary.totalRevenue,
        totalOrders: ordersSummary.totalOrders,
        averageOrderValue: ordersSummary.averageOrderValue,
        totalCustomers: customersSummary.totalCustomers,
        totalProducts: productsSummary.totalProducts,
        currency: shopInfo?.currency || "BRL",
        // Recurring customer metrics - use order data for accurate rate in period
        // ordersSummary.recurringCustomerRate counts orders from customers with >1 total orders
        recurringCustomerRate: ordersSummary.recurringCustomerRate,
        returningCustomers: ordersSummary.recurringCustomersInPeriod,
        // Conversion metrics (orders with payment / total orders)
        conversionRate: ordersSummary.totalOrders > 0
          ? (ordersSummary.paidOrders / ordersSummary.totalOrders) * 100
          : 0,
      },

      // Best-selling products
      bestSellingProducts: ordersSummary.bestSellingProducts,
    }

    return NextResponse.json(reportData)
  } catch (error) {
    return errorResponse(request, error, "IntegrationsShopifyReport")
  }
}
