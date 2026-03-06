import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("FinancialSummary")

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

interface MonthRevenue {
  month: string
  receita: number
  key: string
}

interface FinancialSummaryResponse {
  asaasConnected: boolean
  revenueByMonth: MonthRevenue[]
  comparisonPercent: number | null
  comparisonLabel: string
  upcoming7Days: {
    count: number
    totalValue: number
  }
  newDeals: {
    count: number
    pipelineValue: number
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const now = new Date()

    // Fetch Asaas integration (org-scoped)
    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .eq("org_id", orgId)
      .single()

    let asaasConnected = false
    let revenueByMonth: MonthRevenue[] = []
    let comparisonPercent: number | null = null
    let comparisonLabel = ""
    const upcoming7Days = { count: 0, totalValue: 0 }

    if (integration) {
      const credentials = decryptCredentialsJson(integration.credentials)

      if (credentials.api_key) {
        asaasConnected = true

        try {
          const asaas = createAsaasService(credentials)

          // Build 6-month date range
          const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
          const dateFrom = sixMonthsAgo.toISOString().split("T")[0]
          const dateTo = now.toISOString().split("T")[0]

          // Fetch all RECEIVED/CONFIRMED payments in range
          const receivedStatuses = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]
          const monthMap = new Map<string, number>()

          // Initialize all 6 months
          for (let i = 0; i < 6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
            monthMap.set(key, 0)
          }

          // Paginate through all payments in range (max 50 pages safety)
          const MAX_PAGES = 50
          let offset = 0
          const limit = 100
          let hasMore = true
          let pages = 0

          while (hasMore && pages < MAX_PAGES) {
            pages++
            const { data: payments, totalCount } = await asaas.listPayments({
              offset,
              limit,
              "dueDate[ge]": dateFrom,
              "dueDate[le]": dateTo,
            })

            for (const p of payments) {
              if (receivedStatuses.includes(p.status)) {
                const key = p.dueDate?.slice(0, 7)
                if (key && monthMap.has(key)) {
                  monthMap.set(key, (monthMap.get(key) || 0) + p.value)
                }
              }
            }

            offset += limit
            hasMore = offset < totalCount
          }

          // Build revenue array
          revenueByMonth = Array.from(monthMap.entries()).map(([key, value]) => ({
            month: MONTH_LABELS[parseInt(key.split("-")[1]) - 1],
            receita: value,
            key,
          }))

          // Calculate % comparison (current month vs previous month)
          if (revenueByMonth.length >= 2) {
            const currentMonth = revenueByMonth[revenueByMonth.length - 1]
            const previousMonth = revenueByMonth[revenueByMonth.length - 2]

            if (previousMonth.receita > 0) {
              comparisonPercent = ((currentMonth.receita - previousMonth.receita) / previousMonth.receita) * 100
            } else if (currentMonth.receita > 0) {
              comparisonPercent = 100
            }
            comparisonLabel = previousMonth.month
          }

          // Upcoming 7 days charges
          const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          const todayStr = now.toISOString().split("T")[0]
          const sevenDaysStr = sevenDaysFromNow.toISOString().split("T")[0]

          let upcomingOffset = 0
          let upcomingHasMore = true
          let upcomingPages = 0

          while (upcomingHasMore && upcomingPages < MAX_PAGES) {
            upcomingPages++
            const { data: upcomingPayments, totalCount } = await asaas.listPayments({
              status: "PENDING",
              "dueDate[ge]": todayStr,
              "dueDate[le]": sevenDaysStr,
              offset: upcomingOffset,
              limit: 100,
            })

            for (const p of upcomingPayments) {
              upcoming7Days.count++
              upcoming7Days.totalValue += p.value
            }

            upcomingOffset += 100
            upcomingHasMore = upcomingOffset < totalCount
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error"
          const isAuthError = message.includes("401") || message.includes("403") || message.includes("Unauthorized")

          if (isAuthError) {
            log.warn("Asaas auth error in financial summary:", message)
            asaasConnected = false
          } else {
            log.error("Error fetching Asaas financial data:", err)
          }
        }
      }
    }

    // Fetch new deals this month + pipeline value (parallel)
    const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

    const [{ data: monthDeals }, { data: allOpenDeals }] = await Promise.all([
      supabase.from("deals").select("id, value").gte("created_at", firstDayOfMonth),
      supabase.from("deals").select("value").not("stage_id", "is", null),
    ])

    const newDeals = {
      count: monthDeals?.length || 0,
      pipelineValue: allOpenDeals?.reduce((sum, d) => sum + (d.value || 0), 0) || 0,
    }

    const result: FinancialSummaryResponse = {
      asaasConnected,
      revenueByMonth,
      comparisonPercent,
      comparisonLabel,
      upcoming7Days,
      newDeals,
    }

    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "FinancialSummary GET")
  }
}
