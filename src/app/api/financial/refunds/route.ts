import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { listRefunds } from "@/lib/services/refund.service"

const VALID_STATUSES = ["requested", "processed", "failed"] as const

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const clientId = url.searchParams.get("client_id") || undefined
    const status = url.searchParams.get("status") || undefined
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")))

    if (status && !(VALID_STATUSES as readonly string[]).includes(status)) {
      throw new AppError("Validation error: Status invalido", 400, "VALIDATION_ERROR")
    }

    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const result = await listRefunds({ orgId, clientId, status, page, limit })

    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "GET /api/financial/refunds")
  }
}
