/**
 * /admin/conteudo/espionagem — varredura de perfil público (módulo Conteúdo).
 *
 * Casca fina server-side: só autentica. Todo o dado vem client-side de
 * `lib/conteudo/data.ts` → `/api/conteudo/espionagem`.
 */

import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/services/admin-auth.service"
import { EspionagemPage } from "@/components/conteudo/espionagem/espionagem-page"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

export default async function ConteudoEspionagemPage() {
  const user = await getSessionUser()
  if (!user) redirect(ROUTES.LOGIN)
  return <EspionagemPage />
}
