/**
 * /admin/conteudo/reels — pipeline de produção de Reels.
 * Casca fina: todo o dado vem client-side de `lib/conteudo/data.ts`.
 */

import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/services/admin-auth.service"
import { ReelsPipeline } from "@/components/conteudo/reels/reels-pipeline"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

export default async function ConteudoReelsPage() {
  const user = await getSessionUser()
  if (!user) redirect(ROUTES.LOGIN)
  return <ReelsPipeline />
}
