import { redirect, permanentRedirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

/**
 * /admin/operacional/cs-crm foi consolidado em /admin/operacional/pipelines
 * (Hub Pipelines CS). O antigo kanban 6 colunas virou widgets dentro do hub:
 *   - Calls hoje, Agendar call, Pos-call pendente -> "Agenda do dia"
 *   - Urgente -> KPI "Em risco / pendente" + Leads CS (health_alert)
 *   - Feedbacks WhatsApp -> "Fluxos cross-pipeline" -> Ritual de Sexta
 *   - Concluidos hoje -> removido (dashboard ja cobre)
 *
 * Redirect permanente (308) pra nao quebrar bookmarks.
 */
export default function CsCrmRedirect() {
  // permanentRedirect retorna 308; redirect retorna 307 (temporario).
  // Aqui queremos 308 porque a URL mudou definitivamente.
  if (typeof permanentRedirect === "function") {
    permanentRedirect(ROUTES.ADMIN.OPERACIONAL.PIPELINES)
  }
  redirect(ROUTES.ADMIN.OPERACIONAL.PIPELINES)
}
