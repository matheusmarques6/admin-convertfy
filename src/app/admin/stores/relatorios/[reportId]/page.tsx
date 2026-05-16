/**
 * Preview de relatório mensal cliente-facing.
 * Toolbar (voltar/baixar/enviar) + deck de 7 slides 16:9.
 */

import { notFound } from "next/navigation"
import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/server"
import { ReportPreviewClient } from "@/components/stores/v2/report-preview-client"

export const dynamic = "force-dynamic"

async function getReport(reportId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("client_monthly_reports")
    .select(
      `id, store_id, month_label, period_start, period_end, status,
       generated_at, presented_at, sent_to, tone, ai_filled, pdf_url,
       sections, snapshot, proximos_passos, generated_by,
       store:client_stores(id, store_name, store_url, clients(name)),
       generator:profiles!client_monthly_reports_generated_by_fkey(name)`,
    )
    .eq("id", reportId)
    .single()
  if (error || !data) return null
  return data
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
  const storeRaw = report.store as unknown as { id: string; store_name: string; store_url: string | null; clients?: { name?: string } | Array<{ name?: string }> } | null
  const store = storeRaw
  const clientName = store?.clients
    ? Array.isArray(store.clients)
      ? store.clients[0]?.name
      : store.clients.name
    : null
  const generator = (report.generator as unknown as { name: string } | null)
  const period =
    `${new Date(report.period_start).toLocaleDateString("pt-BR")} → ${new Date(
      report.period_end,
    ).toLocaleDateString("pt-BR")}`

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
        <ReportPreviewClient reportId={report.id} pdfUrl={report.pdf_url} status={report.status} />
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
        <ReportSlidesWrapper
          snapshot={report.snapshot}
          proximosPassos={report.proximos_passos}
          monthLabel={report.month_label}
          storeName={store?.store_name}
          clientName={clientName ?? null}
          cmName={generator?.name ?? null}
        />
      </div>
    </div>
  )
}

// Wrapper que injeta dados extras no snapshot pra slides
async function ReportSlidesWrapper(props: {
  snapshot: unknown
  proximosPassos: string | null
  monthLabel: string
  storeName?: string | null
  clientName?: string | null
  cmName?: string | null
}) {
  const { ReportSlides } = await import("@/components/stores/v2/slides/report-slides")
  const snap = (props.snapshot ?? {}) as Record<string, unknown>
  return (
    <ReportSlides
      snapshot={{
        ...snap,
        store_name: props.storeName ?? undefined,
        client_name: props.clientName ?? undefined,
        cm_name: props.cmName ?? undefined,
        month_label: props.monthLabel,
      }}
      proximosPassos={props.proximosPassos}
      monthLabel={props.monthLabel}
    />
  )
}
