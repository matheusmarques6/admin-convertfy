import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createWiseService } from "@/lib/integrations/wise"

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
      .select("*")
      .eq("type", "wise")
      .eq("is_active", true)
      .single()

    if (integrationError || !integration) {
      return NextResponse.json(
        { error: "Wise integration not configured" },
        { status: 400 }
      )
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
    console.error("Error fetching Wise transactions:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch transactions" },
      { status: 500 }
    )
  }
}
