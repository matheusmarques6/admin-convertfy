/**
 * POST /api/admin/stores/reports/[reportId]/pdf
 *
 * Gera o PDF REAL do relatório mensal: Chromium headless renderiza a
 * página /print (acessada com pdf_token de 5min — o middleware deixa
 * passar e a página valida o HMAC), sobe o arquivo pro bucket público
 * `client-reports` e persiste a URL do ARQUIVO em pdf_url.
 *
 * Antes esta rota só devolvia a URL da própria página /print (o botão
 * "Abrir PDF" abria o sistema, não um PDF — bug reportado pelo usuário).
 *
 * Requer a migration 20260812_client_reports_bucket.sql (bucket).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createPrintToken } from "@/lib/reports/print-token"
import { renderReportPdf } from "@/lib/reports/report-pdf.service"
import { logger } from "@/lib/logger"

const log = logger.child("ReportPdfRoute")

export const dynamic = "force-dynamic"
// Chromium (cold start ~2-4s) + render + upload; folga sob Vercel Pro.
export const maxDuration = 120

const BUCKET = "client-reports"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data: report } = await admin
      .from("client_monthly_reports")
      .select("id, store_id")
      .eq("id", reportId)
      .single()
    if (!report) throw new AppError("Relatório não encontrado", 404)

    // Página de print com token de acesso pro Chromium (sem sessão).
    const origin = request.nextUrl.origin
    const token = createPrintToken(reportId)
    const printUrl = `${origin}/admin/stores/relatorios/${reportId}/print?pdf_token=${encodeURIComponent(token)}`

    const t0 = Date.now()
    const pdfBuffer = await renderReportPdf(printUrl)

    // Upload (upsert: regerar substitui o PDF anterior do mesmo report).
    const path = `${report.store_id}/${reportId}.pdf`
    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
        cacheControl: "60",
      })
    if (uploadErr) {
      // Bucket ausente = migration 20260812 não aplicada — mensagem acionável.
      throw new AppError(
        `Falha ao salvar o PDF no Storage: ${uploadErr.message}. ` +
          `Confirme que o bucket "${BUCKET}" existe (migration 20260812_client_reports_bucket.sql).`,
        502,
      )
    }

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
    // Cache-buster: o path é estável (upsert) e o bucket é público com CDN —
    // sem o ?v= o navegador/CDN poderia servir o PDF antigo após regerar.
    const pdfUrl = `${pub.publicUrl}?v=${Date.now()}`

    await admin
      .from("client_monthly_reports")
      .update({ pdf_url: pdfUrl })
      .eq("id", reportId)

    log.info("pdf_generated", {
      reportId,
      bytes: pdfBuffer.length,
      ms: Date.now() - t0,
    })

    return successResponse(request, { pdf_url: pdfUrl })
  } catch (error) {
    return errorResponse(request, error, "report-pdf")
  }
}
