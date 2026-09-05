/**
 * /admin/conteudo/calendario — Calendário do módulo Conteúdo.
 * Casca fina: todo o dado vem client-side de `lib/conteudo/data.ts`.
 */

import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/services/admin-auth.service"
import { CalendarioConteudo } from "@/components/conteudo/calendario/calendario-conteudo"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

export default async function ConteudoCalendarioPage() {
  const user = await getSessionUser()
  if (!user) redirect(ROUTES.LOGIN)
  return <CalendarioConteudo />
}
