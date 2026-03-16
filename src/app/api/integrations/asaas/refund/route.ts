import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { initiateAsaasRefund } from "@/lib/services/refund.service"

const refundSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.number().positive().optional(),
  reason: z.string().min(3).max(500),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const body = await request.json()
    const parsed = refundSchema.safeParse(body)

    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
        400,
        "VALIDATION_ERROR"
      )
    }

    const { invoice_id, amount, reason } = parsed.data

    const result = await initiateAsaasRefund({
      invoiceId: invoice_id,
      orgId,
      userId: user.id,
      amount,
      reason,
    })

    return successResponse(request, {
      refund_id: result.refundId,
      status: result.status,
      original_amount: result.originalAmount,
      refund_amount: result.refundAmount,
    })
  } catch (error) {
    return errorResponse(request, error, "POST /api/integrations/asaas/refund")
  }
}
