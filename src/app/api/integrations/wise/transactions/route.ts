import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { createWiseService } from "@/lib/integrations/wise"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationsWiseTransactions")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get date range (default: last 30 days)
    const endDate = searchParams.get("end_date") || new Date().toISOString()
    const startDate =
      searchParams.get("start_date") ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Get Wise integration
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("id, credentials, is_active")
      .eq("type", "wise")
      .eq("is_active", true)
      .single()

    if (integrationError || !integration) {
      throw new AppError("Wise integration not configured", 400)
    }

    const wise = createWiseService(integration.credentials)
    const payments = await wise.getReceivedPayments({
      intervalStart: startDate,
      intervalEnd: endDate,
    })

    // Get all clients to help with matching
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name, email, company")

    return NextResponse.json({
      payments,
      clients: clients || [],
      period: { start: startDate, end: endDate },
    })
  } catch (error) {
    return errorResponse(request, error, "IntegrationsWiseTransactions")
  }
}
