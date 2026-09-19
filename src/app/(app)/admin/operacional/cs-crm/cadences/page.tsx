import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

/**
 * Cadências mora como ABA do hub Customer Success
 * (/admin/operacional/pipelines?tab=cadencias), que embute o board do
 * pipeline CS "Cadencias CS" (seed 20260615, layout=state-board): cada
 * loja é 1 deal na coluna da sua frequência (Semanal / Quinzenal /
 * Mensal / Pausada); arrastar entre colunas muda a cadência.
 * Esta rota legada só redireciona.
 */
export default function CadencesRedirect() {
  redirect(`${ROUTES.ADMIN.OPERACIONAL.PIPELINES}?tab=cadencias`)
}
