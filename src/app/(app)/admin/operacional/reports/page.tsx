import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

/**
 * Reports de CS foi consolidado como aba "Tendências" do Monitor de
 * Saúde (/admin/health?tab=tendencias) — mesma fonte de dados
 * (/api/crm/reports/timeseries), componente em
 * src/components/crm/cs-reports-view.tsx. Esta rota legada redireciona
 * para não quebrar links salvos.
 */
export default function CsReportsRedirect() {
  redirect(`${ROUTES.ADMIN.HEALTH}?tab=tendencias`)
}
