/**
 * /admin/email-blueprints — DEPRECATED
 *
 * Redirect server-side pra aba "Arquitetura dos Emails", que absorveu a
 * antiga aba Blueprints (e a Estrutura geral junto — as duas editavam o
 * mesmo par flow_type × email_number).
 */
import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

export default function BlueprintsRedirect() {
  redirect(`${ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION}?tab=architecture`)
}
