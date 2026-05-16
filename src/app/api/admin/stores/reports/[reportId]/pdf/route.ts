/**
 * POST /api/admin/stores/reports/[reportId]/pdf
 *
 * Retorna URL pra pagina imprimivel do deck (Cmd+P do navegador gera PDF
 * de qualidade sem precisar de Puppeteer/Chromium no servidor).
 *
 * Salva a URL em pdf_url do relatório.
 *
 * Pra geração server-side de PDF persistido em Storage no futuro:
 *  1. Adicionar puppeteer-core + @sparticuz/chromium
 *  2. headless render → buffer → upload pro bucket client-reports
 *  3. Atualizar pdf_url com a URL publica
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

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

    // URL de print: pagina renderiza o deck em layout imprimivel.
    const origin = request.nextUrl.origin
    const printUrl = `${origin}/admin/stores/relatorios/${reportId}/print`

    // Persiste no report (substitui PDF anterior)
    await admin
      .from("client_monthly_reports")
      .update({ pdf_url: printUrl })
      .eq("id", reportId)

    return successResponse(request, {
      pdf_url: printUrl,
      hint: "Abra a URL no navegador e use Cmd+P (ou Ctrl+P) → 'Salvar como PDF' pra exportar.",
    })
  } catch (error) {
    return errorResponse(request, error, "report-pdf")
  }
}
