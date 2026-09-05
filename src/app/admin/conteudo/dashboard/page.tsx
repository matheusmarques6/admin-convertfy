/**
 * /admin/conteudo/dashboard — Dashboard Social (módulo Conteúdo).
 *
 * Casca fina server-side: autentica e resolve o nome para a saudação.
 * Todo o dado vem client-side de `lib/conteudo/data.ts`.
 */

import { redirect } from "next/navigation"
import { getSessionUser, getProfileByUserId } from "@/lib/services/admin-auth.service"
import { ConteudoDashboard } from "@/components/conteudo/dashboard/conteudo-dashboard"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

export default async function ConteudoDashboardPage() {
  const user = await getSessionUser()
  if (!user) redirect(ROUTES.LOGIN)

  const profile = await getProfileByUserId(user.id).catch(() => null)
  const fullName = profile?.name || user.email?.split("@")[0] || "time Convertfy"
  const firstName = fullName.split(" ")[0]

  return <ConteudoDashboard userName={firstName} />
}
