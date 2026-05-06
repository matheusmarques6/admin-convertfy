import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

// Legado — /admin/crm redireciona pra estrutura nova /admin/comercial.
export default function CrmRootPage() {
  redirect(ROUTES.ADMIN.COMERCIAL.PIPELINES)
}
