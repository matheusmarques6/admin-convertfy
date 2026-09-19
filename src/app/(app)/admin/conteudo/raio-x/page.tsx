/**
 * /admin/conteudo/raio-x — Raio-X do perfil (módulo Conteúdo).
 *
 * Casca fina server-side: só autentica. Todo o dado vem client-side de
 * `lib/conteudo/data.ts` → `/api/conteudo/raio-x`.
 */

import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/services/admin-auth.service"
import { RaioXPage } from "@/components/conteudo/raio-x/raio-x-page"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

export default async function ConteudoRaioXPage() {
  const user = await getSessionUser()
  if (!user) redirect(ROUTES.LOGIN)
  return <RaioXPage />
}
