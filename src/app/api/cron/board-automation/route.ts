import { NextRequest } from "next/server"
import { errorResponse, successResponse } from "@/lib/api/errors"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { TaskAutomationService } from "@/lib/services/task-automation.service"

const log = logger.child("BoardAutomationCron")

// GET - Run board automation checks (feedbacks atrasados + contratos expirando)
// Call via cron or manually: GET /api/cron/board-automation
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()

    // Get all active organizations
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id")
      .eq("is_active", true)

    if (!orgs?.length) {
      return successResponse(request, { message: "Nenhuma organização ativa", results: [] })
    }

    const results = []

    for (const org of orgs) {
      try {
        await TaskAutomationService.checkOverdueFeedbacks(org.id)
        await TaskAutomationService.checkExpiringContracts(org.id)
        results.push({ org_id: org.id, status: "ok" })
      } catch (err) {
        log.error("Erro ao processar org", { org_id: org.id, err })
        results.push({ org_id: org.id, status: "error" })
      }
    }

    return successResponse(request, {
      message: `Board automation executada para ${orgs.length} organizações`,
      results,
    })
  } catch (error) {
    return errorResponse(request, error, "board-automation-cron")
  }
}
