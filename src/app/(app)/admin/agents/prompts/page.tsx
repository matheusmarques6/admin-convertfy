/**
 * /admin/agents/prompts — DEPRECATED
 *
 * Redirect server-side pra `/admin/settings/email-generation?tab=agents`.
 * Os componentes em `src/components/agents/*` continuam vivos — agora são
 * consumidos pela aba "Agentes" do destino.
 */
import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

export default function PromptsRedirect() {
  redirect(`${ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION}?tab=agents`)
}
