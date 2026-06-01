/**
 * /admin/email-blueprints — DEPRECATED
 *
 * Redirect server-side pra `/admin/settings/email-generation?tab=blueprints`.
 * Os componentes em `src/components/email-blueprints/*` continuam vivos —
 * agora são consumidos pela aba "Blueprints" do destino.
 */
import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

export default function BlueprintsRedirect() {
  redirect(`${ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION}?tab=blueprints`)
}
