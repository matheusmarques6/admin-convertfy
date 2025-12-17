import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const SHOPIFY_API_VERSION = "2024-01"

// CORS headers helper
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

// Handle OPTIONS preflight requests
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

interface ShopifyRequestOptions {
  method?: "GET" | "POST"
  body?: Record<string, unknown>
}

// Helper function to make Shopify API requests
async function shopifyRequest<T>(
  storeDomain: string,
  accessToken: string,
  endpoint: string,
  options?: ShopifyRequestOptions
): Promise<T> {
  const { method = "GET", body } = options || {}

  const url = `https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`

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
    console.error(`Shopify API error: ${response.status}`, errorText)
    throw new Error(`Shopify API error: ${response.status}`)
  }

  return response.json()
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
    console.error("Error fetching shop info:", error)
    return null
  }
}

// Get orders summary with best-selling products
async function getOrdersSummary(
  storeDomain: string,
  accessToken: string,
  dateRange: { start: string; end: string }
) {
  try {
    const response = await shopifyRequest<{
      orders: Array<{
        id: number
        total_price: string
        subtotal_price: string
        total_tax: string
        total_discounts: string
        financial_status: string
        fulfillment_status: string | null
        created_at: string
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
      }>
    }>(storeDomain, accessToken, `/orders.json?status=any&created_at_min=${dateRange.start}&created_at_max=${dateRange.end}&limit=250`)

    const orders = response.orders || []

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

    // Unique customers
    const uniqueCustomers = new Set(orders.map(o => o.customer?.id).filter(Boolean)).size

    // Recurring customers in this period (customers with more than 1 order historically)
    const recurringCustomersInPeriod = orders.filter(o => o.customer && o.customer.orders_count > 1).length
    const recurringCustomerRate = totalOrders > 0 ? (recurringCustomersInPeriod / totalOrders) * 100 : 0

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
      recurringCustomersInPeriod,
      recurringCustomerRate,
      bestSellingProducts,
      fulfillment: {
        fulfilled: fulfilledOrders,
        unfulfilled,
        partiallyFulfilled,
      },
      financialStatus: statusBreakdown,
      timeSeries,
    }
  } catch (error) {
    console.error("Error fetching orders:", error)
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
      recurringCustomerRate: 0,
      bestSellingProducts: [],
      fulfillment: { fulfilled: 0, unfulfilled: 0, partiallyFulfilled: 0 },
      financialStatus: { paid: 0, pending: 0, refunded: 0, voided: 0 },
      timeSeries: [],
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
    console.error("Error fetching products:", error)
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

// Get customers summary
async function getCustomersSummary(storeDomain: string, accessToken: string) {
  try {
    const countResponse = await shopifyRequest<{
      count: number
    }>(storeDomain, accessToken, "/customers/count.json")

    const customersResponse = await shopifyRequest<{
      customers: Array<{
        id: number
        orders_count: number
        total_spent: string
        created_at: string
        accepts_marketing: boolean
      }>
    }>(storeDomain, accessToken, "/customers.json?limit=250")

    const customers = customersResponse.customers || []

    const totalSpent = customers.reduce((sum, c) => sum + parseFloat(c.total_spent || "0"), 0)
    const totalOrders = customers.reduce((sum, c) => sum + (c.orders_count || 0), 0)
    const returningCustomers = customers.filter(c => (c.orders_count || 0) > 1).length
    const firstTimeCustomers = customers.filter(c => (c.orders_count || 0) === 1).length
    const marketingOptIn = customers.filter(c => c.accepts_marketing).length

    // Recurring customer rate (customers with more than 1 order / total customers)
    const totalCustomersCount = countResponse.count || customers.length
    const recurringCustomerRate = totalCustomersCount > 0 ? (returningCustomers / totalCustomersCount) * 100 : 0

    // New customers in last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const newCustomers = customers.filter(c => new Date(c.created_at) >= thirtyDaysAgo).length

    return {
      totalCustomers: totalCustomersCount,
      totalSpent,
      totalOrders,
      averageOrdersPerCustomer: customers.length > 0 ? totalOrders / customers.length : 0,
      averageSpentPerCustomer: customers.length > 0 ? totalSpent / customers.length : 0,
      returningCustomers,
      firstTimeCustomers,
      recurringCustomerRate,
      newCustomersLast30Days: newCustomers,
      marketingOptIn,
      marketingOptInRate: customers.length > 0 ? (marketingOptIn / customers.length) * 100 : 0,
    }
  } catch (error) {
    console.error("Error fetching customers:", error)
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
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")
    const period = searchParams.get("period") || "30d"
    const customStartDate = searchParams.get("start_date")
    const customEndDate = searchParams.get("end_date")

    if (!storeId) {
      return NextResponse.json({ error: "store_id é obrigatório" }, { status: 400 })
    }

    // Get store with Shopify credentials
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("shopify_store_domain, shopify_access_token, store_name, client_id")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 })
    }

    const { shopify_store_domain: storeDomain, shopify_access_token: accessToken } = store

    if (!storeDomain || !accessToken) {
      return NextResponse.json({
        success: false,
        connected: false,
        error: "Credenciais Shopify não configuradas",
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

    // Fetch all data in parallel
    const [shopInfo, ordersSummary, productsSummary, customersSummary] = await Promise.all([
      getShopInfo(storeDomain, accessToken),
      getOrdersSummary(storeDomain, accessToken, dateRange),
      getProductsSummary(storeDomain, accessToken),
      getCustomersSummary(storeDomain, accessToken),
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
        // Recurring customer metrics
        recurringCustomerRate: customersSummary.recurringCustomerRate,
        returningCustomers: customersSummary.returningCustomers,
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
    console.error("Error generating Shopify report:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar relatório" },
      { status: 500 }
    )
  }
}
