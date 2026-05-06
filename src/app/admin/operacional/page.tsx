import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

export default function OperacionalRootPage() {
  redirect(ROUTES.ADMIN.OPERACIONAL.DASHBOARD)
}
