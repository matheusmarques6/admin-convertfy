import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("AsaasBilling")

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

    const asaas = createAsaasService(integration.credentials)

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

    const subsResponse = await fetch(
      "https://api.asaas.com/v3/subscriptions?status=ACTIVE&limit=1",
      {
        headers: {
          "Content-Type": "application/json",
          access_token: integration.credentials.api_key,
        },
      }
    )
    const subsData = await subsResponse.json()
    const activeSubscriptions = subsData.totalCount || 0

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
      byType, counts,
      recentPayments: allPayments.slice(0, 10),
    })
  } catch (error) {
    return errorResponse(request, error, "AsaasBilling GET")
  }
}
