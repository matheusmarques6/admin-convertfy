/**
 * /admin/components — redirect para a aba "Componentes" do hub de geração.
 * O workspace vive em `src/components/email-components/*`.
 */
import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

export default function ComponentsRedirect() {
  redirect(`${ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION}?tab=components`)
}
