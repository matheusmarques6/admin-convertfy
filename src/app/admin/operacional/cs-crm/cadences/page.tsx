import { redirect } from "next/navigation"
import { getCsPipeline } from "@/lib/cs-pipelines"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

/**
 * /admin/operacional/cs-crm/cadences foi consolidado em pipeline CS
 * "Cadencias CS" (seed 20260615), layout=state-board. Cada loja vira
 * 1 deal na coluna da sua frequencia (Semanal / Quinzenal / Mensal /
 * Pausada). Arrastar entre colunas muda a cadencia (atualiza
 * store_cadence_overrides automaticamente — automacao a ser wirada).
 */
export default async function CadencesRedirect() {
  const info = await getCsPipeline("cadencias")
  if (!info) {
    redirect(ROUTES.ADMIN.OPERACIONAL.PIPELINES)
  }
  redirect(ROUTES.ADMIN.OPERACIONAL.PIPELINE_DETAIL(info.id))
}
