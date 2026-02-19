import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService, AsaasService } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("AsaasBilling")

// Cache for inadimplentes data (5 minutes), keyed by API key hash to prevent cross-tenant leakage
const inadimplentesCache = new Map<string, {
  data: { totalClients: number; totalValue: number; totalCharges: number }
  timestamp: number
}>()
const INADIMPLENTES_CACHE_TTL = 5 * 60 * 1000

async function getInadimplentesData(asaas: AsaasService, cacheKey: string) {
  const now = Date.now()
  const cached = inadimplentesCache.get(cacheKey)
  if (cached && (now - cached.timestamp) < INADIMPLENTES_CACHE_TTL) {
    return cached.data
  }

  let allOverduePayments: Array<{ customer: string; value: number }> = []
  let overdueOffset = 0
  let overdueHasMore = true
  while (overdueHasMore) {
    const { data: overdueData, totalCount: overdueTotalCount } = await asaas.listPayments({
      status: "OVERDUE", offset: overdueOffset, limit: 100,
    })
    allOverduePayments = [...allOverduePayments, ...overdueData]
    overdueOffset += 100
    overdueHasMore = overdueOffset < overdueTotalCount
  }

  const inadimplentClients = new Map<string, number>()
  for (const payment of allOverduePayments) {
    const current = inadimplentClients.get(payment.customer) || 0
    inadimplentClients.set(payment.customer, current + payment.value)
  }

  const result = {
    totalClients: inadimplentClients.size,
    totalValue: allOverduePayments.reduce((sum, p) => sum + p.value, 0),
    totalCharges: allOverduePayments.length,
  }

  inadimplentesCache.set(cacheKey, { data: result, timestamp: now })
  return result
}

// GET - Get billing summary for dashboard
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get("period") || "month"
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")

    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .single()

    if (!integration) {
      return successResponse(request, {
        connected: false,
        summary: {
          received: 0, confirmed: 0, pending: 0, overdue: 0, refunded: 0,
          totalClients: 0, activeSubscriptions: 0,
        }
      })
    }

    const credentials = decryptCredentialsJson(integration.credentials)
    const asaas = createAsaasService(credentials)

    const now = new Date()
    let dateFrom: string
    let dateTo: string = now.toISOString().split("T")[0]

    switch (period) {
      case "today":
        dateFrom = dateTo
        break
      case "7days": {
        const sevenDaysAgo = new Date(now)
        sevenDaysAgo.setDate(now.getDate() - 7)
        dateFrom = sevenDaysAgo.toISOString().split("T")[0]
        break
      }
      case "month":
        dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
        break
      case "year":
        dateFrom = `${now.getFullYear()}-01-01`
        break
      case "custom":
        dateFrom = startDate || `${now.getFullYear()}-01-01`
        dateTo = endDate || dateTo
        break
      default:
        dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
    }

    let allPayments: Array<{
      id: string; value: number; netValue?: number; status: string;
      billingType: string; dueDate: string; paymentDate?: string;
    }> = []

    let offset = 0
    const limit = 100
    let hasMore = true

    while (hasMore) {
      const { data: payments, totalCount } = await asaas.listPayments({ offset, limit })
      const filtered = payments.filter((p: { dueDate: string }) => {
        const pDate = p.dueDate
        return pDate >= dateFrom && pDate <= dateTo
      })
      allPayments = [...allPayments, ...filtered]
      offset += limit
      hasMore = offset < totalCount
      if (payments.length > 0) {
        const lastDate = payments[payments.length - 1].dueDate
        if (lastDate < dateFrom) hasMore = false
      }
    }

    const received = allPayments
      .filter(p => ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status))
      .reduce((sum, p) => sum + p.value, 0)
    const confirmed = allPayments.filter(p => p.status === "CONFIRMED").reduce((sum, p) => sum + p.value, 0)
    const pending = allPayments.filter(p => p.status === "PENDING").reduce((sum, p) => sum + p.value, 0)
    const overdue = allPayments.filter(p => p.status === "OVERDUE").reduce((sum, p) => sum + p.value, 0)
    const refunded = allPayments.filter(p => p.status === "REFUNDED").reduce((sum, p) => sum + p.value, 0)

    const { totalCount: totalClients } = await asaas.listCustomers({ limit: 1 })

    const environment = (credentials.environment as string) || "sandbox"
    const asaasBaseUrl = environment === "production"
      ? "https://api.asaas.com/v3"
      : "https://sandbox.asaas.com/api/v3"

    const subsResponse = await fetch(
      `${asaasBaseUrl}/subscriptions?status=ACTIVE&limit=1`,
      {
        headers: {
          "Content-Type": "application/json",
          access_token: credentials.api_key as string,
        },
      }
    )
    const subsData = await subsResponse.json()
    const activeSubscriptions = subsData.totalCount || 0

    // Fetch ALL overdue payments (no date filter) to count inadimplent clients
    // Cached for 5 minutes to avoid excessive API calls
    const cacheKey = String(credentials.api_key).slice(-8)
    const inadimplentes = await getInadimplentesData(asaas, cacheKey)

    const byType = {
      PIX: allPayments.filter(p => p.billingType === "PIX").reduce((sum, p) => sum + p.value, 0),
      BOLETO: allPayments.filter(p => p.billingType === "BOLETO").reduce((sum, p) => sum + p.value, 0),
      CREDIT_CARD: allPayments.filter(p => p.billingType === "CREDIT_CARD").reduce((sum, p) => sum + p.value, 0),
    }

    const counts = {
      total: allPayments.length,
      received: allPayments.filter(p => ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status)).length,
      pending: allPayments.filter(p => p.status === "PENDING").length,
      overdue: allPayments.filter(p => p.status === "OVERDUE").length,
    }

    return successResponse(request, {
      connected: true, period,
      dateRange: { from: dateFrom, to: dateTo },
      summary: { received, confirmed, pending, overdue, refunded, totalClients, activeSubscriptions },
      byType, counts, inadimplentes,
      recentPayments: allPayments.slice(0, 10),
    })
  } catch (error) {
    return errorResponse(request, error, "AsaasBilling GET")
  }
}
