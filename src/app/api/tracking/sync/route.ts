import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { syncTrackingCode, syncAllPendingCodes } from "@/lib/services/tracking.service"
import { logger } from "@/lib/logger"

const log = logger.child("TrackingSync")

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    const { trackingCodeId, syncAll } = body as { trackingCodeId?: string; syncAll?: boolean }

    if (syncAll) {
      const count = await syncAllPendingCodes()
      log.info("Bulk sync completed", { count })
      return successResponse(request, { synced: count })
    }

    if (trackingCodeId) {
      await syncTrackingCode(trackingCodeId)
      return successResponse(request, { synced: 1 })
    }

    return successResponse(request, { synced: 0, message: "No action specified" })
  } catch (error) {
    return errorResponse(request, error, "TrackingSync POST")
  }
}
