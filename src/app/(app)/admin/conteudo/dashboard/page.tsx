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
  // Hora de Brasília (o time está no Brasil); calculado no servidor para o
  // HTML hidratar igual ao render do client.
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()))
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite"

  return <ConteudoDashboard userName={firstName} saudacao={saudacao} />
}
