import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

/**
 * A listagem de Formulários CS foi consolidada como aba do hub
 * Customer Success (/admin/operacional/pipelines?tab=formularios) —
 * junto de Painel e Cadências. Esta rota fica como redirect para não
 * quebrar links salvos (o "voltar" do editor de forms usa a constante
 * ROUTES.ADMIN.OPERACIONAL.FORMS, que aponta pra cá).
 *
 * O EDITOR continua em /admin/operacional/forms/[id] (compartilhado
 * com o comercial) — só a lista mudou de lugar.
 */
export default function CsFormsRedirect() {
  redirect(`${ROUTES.ADMIN.OPERACIONAL.PIPELINES}?tab=formularios`)
}
