import { redirect } from "next/navigation"
import { getCsPipeline } from "@/lib/cs-pipelines"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

/**
 * /admin/operacional/acompanhamento foi consolidado em pipeline CS
 * "Acompanhamento Semanal" (seed 20260615). As 4 etapas (Precisa
 * atencao -> Em otimizacao -> Pronta feedback -> Feedback enviado)
 * agora vivem como stages do pipeline, com toda a UX do PipelineBoardView
 * (drag-drop, filtros, deal_drawer com 5 abas).
 *
 * Reset semanal continua via cron domingo 22h (move deals abertos pra
 * arquivado e re-flagga lojas).
 */
export default async function AcompanhamentoRedirect() {
  const info = await getCsPipeline("acompanhamento")
  if (!info) {
    redirect(ROUTES.ADMIN.OPERACIONAL.PIPELINES)
  }
  redirect(ROUTES.ADMIN.OPERACIONAL.PIPELINE_DETAIL(info.id))
}
