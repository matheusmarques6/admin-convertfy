/**
 * /admin/outlines — DEPRECATED
 *
 * Redirect server-side pra aba "Arquitetura dos Emails", que absorveu a
 * antiga aba Estrutura geral (e a Blueprints junto).
 */
import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

export default function OutlinesRedirect() {
  redirect(`${ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION}?tab=architecture`)
}
