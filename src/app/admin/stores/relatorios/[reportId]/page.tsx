/**
 * Preview de relatório mensal cliente-facing.
 * Toolbar (voltar/baixar/enviar) + deck de 7 slides 16:9.
 */

import { notFound } from "next/navigation"
import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/server"
import { ReportPreviewClient } from "@/components/stores/v2/report-preview-client"
import { ReportSlidesEditor } from "@/components/stores/v2/report-slides-editor"
import type { ReportSnapshot, ReportKpisOverrides } from "@/types/monthly-report"

export const dynamic = "force-dynamic"

async function getReport(reportId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("client_monthly_reports")
    .select(
      `id, store_id, month_label, period_start, period_end, status,
       generated_at, presented_at, sent_to, tone, ai_filled, pdf_url,
       sections, snapshot, kpis_overrides, edited_at, proximos_passos, generated_by,
       store:client_stores(id, store_name, store_url,
         contract_start_date, contract_end_date,
         clients(name)),
       generator:profiles!client_monthly_reports_generated_by_fkey(name)`,
    )
    .eq("id", reportId)
    .single()
  if (error || !data) return null

  // Total de leads vem do cache store_revenue_summary (não tem na loja)
  let totalLeads: number | null = null
  if (data.store_id) {
    const { data: revSum } = await admin
      .from("store_revenue_summary")
      .select("total_leads")
      .eq("store_id", data.store_id)
      .eq("period_label", "30d")
      .maybeSingle()
    totalLeads = (revSum?.total_leads as number | null) ?? null
  }

  return { ...data, total_leads: totalLeads }
}

function derivePlan(
  contractStart: string | null | undefined,
  contractEnd: string | null | undefined,
  platform: string | null | undefined,
): string | null {
  if (!contractStart) return null
  const base = platform === "shopify" ? "Performance" : "Starter"
  if (!contractEnd) return base
  const start = new Date(contractStart)
  const end = new Date(contractEnd)
  const months = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)))
  return `${base} · ${months}m`
}

export default async function ReportPreviewPage({
  params,
}: {
  params: Promise<{ reportId: string }>
}) {
  const { reportId } = await params
  const report = await getReport(reportId)
  if (!report) notFound()

  // Helpers de tipo
  const storeRaw = report.store as unknown as {
    id: string
    store_name: string
    store_url: string | null
    contract_start_date?: string | null
    contract_end_date?: string | null
    clients?: { name?: string } | Array<{ name?: string }>
  } | null
  const store = storeRaw
  const clientName = store?.clients
    ? Array.isArray(store.clients)
      ? store.clients[0]?.name
      : store.clients.name
    : null
  const snapshotData = (report.snapshot ?? {}) as Record<string, unknown>
  const platformFromSnapshot = (snapshotData.account as { platform?: string } | undefined)?.platform ?? null
  const plan = derivePlan(store?.contract_start_date, store?.contract_end_date, platformFromSnapshot)
  const generator = (report.generator as unknown as { name: string } | null)
  // Parse manual evita TZ shift que mostraria "31/03" pra "2026-04-01"
  const fmtYMD = (ymd: string): string => {
    const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd
  }
  const period = `${fmtYMD(report.period_start)} → ${fmtYMD(report.period_end)}`

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {/* Toolbar */}
      <div className="bg-white border rounded-[10px] p-4 flex items-center justify-between flex-wrap gap-3" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/admin/stores/${report.store_id}?tab=relatorio`}
            className="text-[12px] font-medium text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
          >
            ← Voltar à lista
          </Link>
          <div className="h-4 w-px bg-slate-200" />
          <div>
            <h1 className="text-[16px] font-bold text-slate-900 m-0 leading-tight">
              {report.month_label} · {store?.store_name ?? "Loja"}
            </h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {period} · gerado por {generator?.name ?? "—"} · {clientName ?? ""}
            </p>
          </div>
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: report.status === "presented" ? "#D1FAE5" : report.status === "sent" ? "#DBEAFE" : "#F3F4F6",
              color: report.status === "presented" ? "#065F46" : report.status === "sent" ? "#1D4ED8" : "#4B5563",
            }}
          >
            {report.status === "presented" ? "Apresentado" : report.status === "sent" ? "Enviado" : "Rascunho"}
          </span>
        </div>
        <ReportPreviewClient reportId={report.id} status={report.status} />
      </div>

      {/* Deck container — dark gradient matching prototype */}
      <div
        className="rounded-[14px] py-9 px-4 md:px-7 relative overflow-hidden"
        style={{ background: "linear-gradient(180deg, #14171F 0%, #0B0D14 100%)" }}
      >
        <div
          className="absolute top-0 left-0 right-0"
          style={{ height: 3, background: "linear-gradient(90deg, #4E62D8, #2137B6, #041366)" }}
        />
        <ReportSlidesEditor
          reportId={report.id}
          snapshot={buildSnapshotWithExtras({
            snapshot: report.snapshot,
            storeName: store?.store_name,
            clientName: clientName ?? null,
            cmName: generator?.name ?? null,
            plan,
            monthLabel: report.month_label,
            totalLeads: report.total_leads,
          })}
          overrides={(report.kpis_overrides ?? {}) as ReportKpisOverrides}
          proximosPassos={report.proximos_passos}
          monthLabel={report.month_label}
          editedAt={report.edited_at as string | null}
        />
      </div>
    </div>
  )
}

// Injeta dados extras (loja/cliente/plano/total_leads) no snapshot cru pra
// os slides. total_leads vem do cache quando o snapshot não tem.
function buildSnapshotWithExtras(props: {
  snapshot: unknown
  storeName?: string | null
  clientName?: string | null
  cmName?: string | null
  plan?: string | null
  monthLabel: string
  totalLeads?: number | null
}): ReportSnapshot {
  const snap = (props.snapshot ?? {}) as Record<string, unknown>
  const kpis = { ...((snap.kpis ?? {}) as Record<string, number | null>) }
  if (props.totalLeads != null && kpis.total_leads == null) {
    kpis.total_leads = props.totalLeads
  }
  return {
    ...snap,
    kpis,
    store_name: props.storeName ?? undefined,
    client_name: props.clientName ?? undefined,
    cm_name: props.cmName ?? undefined,
    plan: props.plan ?? undefined,
    month_label: props.monthLabel,
  } as ReportSnapshot
}
