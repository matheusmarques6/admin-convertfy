import { redirect } from "next/navigation"
import { getCsPipeline } from "@/lib/cs-pipelines"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

/**
 * /admin/operacional/cs-crm/calls foi consolidado em pipeline CS
 * "Calls Mensais" (seed 20260615). Cada call vira 1 deal que percorre:
 *   A marcar -> Aguardando -> Agendada -> Hoje -> Pos-call pendente -> Finalizada.
 *
 * Tabela store_feedback_calls continua existindo (historico e ficha
 * de loja). Novos deals sao criados via API quando uma call e marcada,
 * realizada ou recebe notes (automacoes em src/lib/services/cs-calls-sync.ts).
 */
export default async function CallsRedirect() {
  const info = await getCsPipeline("calls")
  if (!info) {
    redirect(ROUTES.ADMIN.OPERACIONAL.PIPELINES)
  }
  redirect(ROUTES.ADMIN.OPERACIONAL.PIPELINE_DETAIL(info.id))
}
