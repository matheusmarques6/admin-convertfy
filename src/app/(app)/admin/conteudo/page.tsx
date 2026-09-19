import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

/** /admin/conteudo → Dashboard Social (home do módulo). */
export default function ConteudoRootPage() {
  redirect(ROUTES.ADMIN.CONTEUDO.DASHBOARD)
}
