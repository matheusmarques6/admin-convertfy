/**
 * Página imprimível do relatório — rota própria FORA de /admin (sem chrome
 * de sidebar/header no documento; ver layout.tsx ao lado). Protegida por
 * sessão no middleware. ?autoprint=1 abre o diálogo de impressão sozinho.
 */

import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/server"
import { ReportSlides } from "@/components/stores/v2/slides/report-slides"
import { AutoPrint } from "./auto-print"
import { PresentDeck } from "./present-deck"

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
  searchParams,
}: {
  params: Promise<{ reportId: string }>
  searchParams: Promise<{ autoprint?: string; present?: string }>
}) {
  const { reportId } = await params
  const { autoprint, present } = await searchParams
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

  const slides = (
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

  // ?present=1 (botão "Modo apresentação"): deck fullscreen, 1 slide por vez,
  // fundo preto (letterbox), navegação por teclado/clique. Reusa os mesmos
  // slides do print/PDF — só muda o invólucro.
  if (present === "1") {
    return <PresentDeck>{slides}</PresentDeck>
  }

  return (
    <>
      {/* ?autoprint=1 (botão "Baixar PDF"): abre o diálogo de impressão do
          navegador automaticamente — "Salvar como PDF" gera o deck. */}
      {autoprint === "1" && <AutoPrint />}
      {slides}
    </>
  )
}
