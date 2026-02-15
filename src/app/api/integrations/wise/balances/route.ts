import { NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { createWiseService } from "@/lib/integrations/wise"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationsWiseBalances")

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get Wise integration
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("id, credentials, is_active")
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
    const balances = await wise.getBalances()

    return NextResponse.json({ balances })
  } catch (error) {
    log.error("Error fetching Wise balances:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch balances" },
      { status: 500 }
    )
  }
}
