import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

/**
 * /admin/me — unificado em /admin/productivity/board com view=mine.
 * Esta rota redireciona pra preservar links antigos.
 *
 * Por que: o board ja serve tasks unificadas (productivity_tasks via
 * trigger sync + tasks de onboarding/CRM). Manter 2 telas com mesma
 * logica criava confusao no time.
 */
export default function MyTasksRedirect() {
  redirect("/admin/productivity/board?view=mine")
}
