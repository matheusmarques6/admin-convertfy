import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, NotFoundError } from "@/lib/api/errors"
import { UUIDSchema } from "@/lib/validations/report"
import { generateCsv } from "@/lib/utils/csv"
import { formatCurrency } from "@/lib/utils/format"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { ReportJob, ReportJobResult } from "@/types/report"

/**
 * GET /api/reports/export?jobId=<uuid>
 *
 * Exports a completed report job as CSV.
 * Reads from report_jobs.result JSONB (snapshot), NOT live cache tables.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get("jobId")

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId parameter" }, { status: 400 })
    }

    UUIDSchema.parse(jobId)

    // Fetch the job (RLS ensures org scoping)
    const { data: job, error } = await supabase
      .from("report_jobs")
      .select("*")
      .eq("id", jobId)
      .single()

    if (error || !job) {
      throw new NotFoundError("Report job")
    }

    const reportJob = job as ReportJob
    const result: ReportJobResult | null = reportJob.result

    if (!result || !result.per_store) {
      return NextResponse.json(
        { error: "Report has no data. It may have expired." },
        { status: 404 }
      )
    }

    // Build CSV
    // Note: Open Rate, Click Rate, and Leads columns are not included because
    // the report processor only collects revenue data from Klaviyo Reporting API.
    // Adding engagement metrics requires additional API calls per store (future enhancement).
    const headers = [
      "Loja",
      "Receita Total",
      "Receita Atribuida (Klaviyo)",
      "Receita Flows",
      "Receita Campanhas",
      "Moeda",
      "Status",
    ]

    const rows: string[][] = []
    let totalRevenue = 0
    let totalAttributed = 0
    let totalFlows = 0
    let totalCampaigns = 0
    let storesOk = 0
    let storesError = 0

    for (const [storeId, store] of Object.entries(result.per_store)) {
      if (store.error) {
        rows.push([
          store.store_name || storeId,
          "\u2014", // em dash
          "\u2014",
          "\u2014",
          "\u2014",
          store.currency || "",
          `Erro: ${store.error}`,
        ])
        storesError++
      } else {
        const attributed = store.campaign_revenue + store.flow_revenue
        const cur = store.currency || "BRL"

        rows.push([
          store.store_name || storeId,
          formatCurrency(store.revenue, cur),
          formatCurrency(attributed, cur),
          formatCurrency(store.flow_revenue, cur),
          formatCurrency(store.campaign_revenue, cur),
          store.currency || "BRL",
          "OK",
        ])

        totalRevenue += store.revenue
        totalAttributed += attributed
        totalFlows += store.flow_revenue
        totalCampaigns += store.campaign_revenue
        storesOk++
      }
    }

    // Summary row
    const totalStores = storesOk + storesError
    rows.push([]) // blank line
    rows.push([
      "TOTAL",
      new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(totalRevenue),
      new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(totalAttributed),
      new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(totalFlows),
      new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(totalCampaigns),
      "",
      `${storesOk}/${totalStores} lojas`,
    ])

    // Metadata rows
    const startDate = reportJob.start_date || "N/A"
    const endDate = reportJob.end_date || "N/A"
    rows.push([
      `Gerado em: ${format(new Date(result.generated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}`,
      "",
      "",
      "",
      "",
      "",
      "",
    ])
    rows.push([
      `Periodo: ${startDate} a ${endDate}`,
      "",
      "",
      "",
      "",
      "",
      "",
    ])

    const csv = generateCsv(headers, rows)
    const filename = `relatorio-${startDate}-${endDate}.csv`

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return errorResponse(request, error, "ReportsExport")
  }
}
