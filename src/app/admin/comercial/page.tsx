import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

export default function ComercialRootPage() {
  redirect(ROUTES.ADMIN.COMERCIAL.DASHBOARD)
}
