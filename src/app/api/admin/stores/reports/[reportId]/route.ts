/**
 * GET    /api/admin/stores/reports/[reportId] — busca relatório
 * PATCH  /api/admin/stores/reports/[reportId] — atualiza status/proximos_passos/snapshot
 * DELETE /api/admin/stores/reports/[reportId] — exclui
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  status: z.enum(["draft", "sent", "presented"]).optional(),
  proximos_passos: z.string().nullable().optional(),
  snapshot: z.record(z.string(), z.unknown()).optional(),
  sent_to: z.string().nullable().optional(),
  pdf_url: z.string().nullable().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("client_monthly_reports")
      .select("*")
      .eq("id", reportId)
      .single()
    if (error) throw error
    return successResponse(request, { report: data })
  } catch (e) {
    return errorResponse(request, e, "report-get")
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const raw = await request.json()
    const parsed = patchSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(
        "Payload invalido: " +
          parsed.error.issues.map((i) => i.message).join("; "),
        400,
      )
    }
    const body = parsed.data
    const update: Record<string, unknown> = {}
    if (body.status !== undefined) {
      update.status = body.status
      if (body.status === "presented") update.presented_at = new Date().toISOString()
    }
    if (body.proximos_passos !== undefined) update.proximos_passos = body.proximos_passos
    if (body.snapshot !== undefined) update.snapshot = body.snapshot
    if (body.sent_to !== undefined) update.sent_to = body.sent_to
    if (body.pdf_url !== undefined) update.pdf_url = body.pdf_url

    const { error } = await admin
      .from("client_monthly_reports")
      .update(update)
      .eq("id", reportId)
    if (error) throw error
    return successResponse(request, { updated: true })
  } catch (e) {
    return errorResponse(request, e, "report-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()
    const { error } = await admin
      .from("client_monthly_reports")
      .delete()
      .eq("id", reportId)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (e) {
    return errorResponse(request, e, "report-delete")
  }
}
