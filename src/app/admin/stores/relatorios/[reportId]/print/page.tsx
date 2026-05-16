/**
 * Página imprimível do relatório. Renderizada com layout root próprio
 * (print/layout.tsx) que define <html> e bypassa o admin chrome.
 */

import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/server"
import { ReportSlides } from "@/components/stores/v2/slides/report-slides"

export const dynamic = "force-dynamic"

async function getReport(reportId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("client_monthly_reports")
    .select(
      `id, month_label, snapshot, proximos_passos,
       store:client_stores(store_name, clients(name)),
       generator:profiles!client_monthly_reports_generated_by_fkey(name)`,
    )
    .eq("id", reportId)
    .single()
  if (error || !data) return null
  return data
}

export default async function ReportPrintPage({
  params,
}: {
  params: Promise<{ reportId: string }>
}) {
  const { reportId } = await params
  const report = await getReport(reportId)
  if (!report) notFound()

  const storeRaw = report.store as unknown as { store_name: string; clients?: { name?: string } | Array<{ name?: string }> } | null
  const clientName = storeRaw?.clients
    ? Array.isArray(storeRaw.clients)
      ? storeRaw.clients[0]?.name
      : storeRaw.clients.name
    : null
  const generator = (report.generator as unknown as { name: string } | null)
  const snap = (report.snapshot ?? {}) as Record<string, unknown>

  return (
    <ReportSlides
      snapshot={{
        ...snap,
        store_name: storeRaw?.store_name ?? undefined,
        client_name: clientName ?? undefined,
        cm_name: generator?.name ?? undefined,
        month_label: report.month_label,
      }}
      proximosPassos={report.proximos_passos}
      monthLabel={report.month_label}
    />
  )
}
