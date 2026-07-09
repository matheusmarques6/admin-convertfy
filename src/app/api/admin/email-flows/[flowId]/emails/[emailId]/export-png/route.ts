/**
 * GET /api/admin/email-flows/[flowId]/emails/[emailId]/export-png
 *
 * Renderiza o email em PNG (Chromium headless) e retorna como download.
 * Re-renderiza o HTML server-side a partir dos blocos (mesmo criterio do
 * send-test — nao confia em HTML enviado pelo client).
 *
 * Status:
 *   200 — image/png attachment
 *   404 — email nao encontrado (ou nao pertence ao flow)
 *   422 — email sem conteudo (sem html e sem blocos)
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth } from "@/lib/api/errors"
import { emailExportBasename } from "@/lib/email-workspace/export-naming"
import { renderEmailHtml } from "@/lib/email-workspace/render-html"
import { renderEmailHtmlToPng } from "@/lib/services/email-png-render.service"
import { logger } from "@/lib/logger"

const log = logger.child("EmailExportPng")

export const dynamic = "force-dynamic"
// Cold start do Chromium (~3-6s) + fontes + imagens do email
export const maxDuration = 60

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ flowId: string; emailId: string }> },
) {
  try {
    const { flowId, emailId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data: email, error: emailErr } = await admin
      .from("email_flow_emails")
      .select("*")
      .eq("id", emailId)
      .eq("flow_id", flowId)
      .maybeSingle()
    if (emailErr) throw emailErr
    if (!email) {
      throw new AppError("Email nao encontrado.", 404, "email_not_found")
    }

    const { data: blocks } = await admin
      .from("email_blocks")
      .select("*")
      .eq("email_id", emailId)
      .order("position", { ascending: true })

    if (!email.html && (blocks ?? []).length === 0) {
      throw new AppError(
        "Email sem conteudo para exportar (sem HTML e sem blocos).",
        422,
        "email_empty",
      )
    }

    const { data: flow } = await admin
      .from("email_flows")
      .select("name, flow_type")
      .eq("id", flowId)
      .maybeSingle()

    const html = renderEmailHtml(email, blocks ?? [])
    const t0 = Date.now()
    const png = await renderEmailHtmlToPng(html)

    const basename = emailExportBasename(
      flow ?? { flow_type: null, name: "email" },
      { number: email.number ?? 0, name: email.name ?? "email" },
    )
    const filename = `${basename}.png`

    log.info("exported", {
      emailId,
      flowId,
      bytes: png.length,
      durationMs: Date.now() - t0,
    })

    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(png.length),
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    log.error("error", error)
    return errorResponse(request, error, "export-png")
  }
}
