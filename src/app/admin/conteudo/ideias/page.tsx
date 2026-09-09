/**
 * /admin/conteudo/ideias — Banco de Ideias.
 * Casca fina: todo o dado vem client-side de `lib/conteudo/data.ts`.
 */

import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/services/admin-auth.service"
import { BancoIdeias } from "@/components/conteudo/ideias/banco-ideias"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

export default async function ConteudoIdeiasPage() {
  const user = await getSessionUser()
  if (!user) redirect(ROUTES.LOGIN)
  return <BancoIdeias />
}
