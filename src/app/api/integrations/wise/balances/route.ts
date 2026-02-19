import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { createWiseService } from "@/lib/integrations/wise"
import { decryptCredentialsJson } from "@/lib/crypto"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationsWiseBalances")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

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

    const wise = createWiseService(decryptCredentialsJson(integration.credentials))
    const balances = await wise.getBalances()

    return successResponse(request, { balances })
  } catch (error) {
    return errorResponse(request, error, "IntegrationsWiseBalances")
  }
}
