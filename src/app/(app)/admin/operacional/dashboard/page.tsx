/**
 * Dashboard do workspace OPERACIONAL — design ago/2026 (Claude Design).
 *
 * Casca fina server-side: só autentica e resolve o nome pro
 * cumprimento. TODO o dado vem client-side de rotas de API dedicadas
 * (SWR) — a versão anterior rodava 13 queries no RSC e ainda assim
 * dependia de mais 8 fetches client; agora a fonte é uma só por seção
 * e o período viaja como ?period=&start=&end= (range custom funciona).
 *
 * Visual: componentes ops-* com tokens --ops-* (claro + grafite).
 */

import { redirect } from "next/navigation"
import { getSessionUser, getProfileByUserId } from "@/lib/services/admin-auth.service"
import { OpsDashboard } from "@/components/dashboard/ops/ops-dashboard"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

export default async function OperacionalDashboardPage() {
  const user = await getSessionUser()
  if (!user) redirect(ROUTES.LOGIN)

  const profile = await getProfileByUserId(user.id).catch(() => null)
  const fullName = profile?.name || user.email?.split("@")[0] || "time Convertfy"
  const firstName = fullName.split(" ")[0]

  return <OpsDashboard userName={firstName} />
}
