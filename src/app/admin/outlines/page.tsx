/**
 * /admin/outlines — redirect para a aba "Estrutura geral" do hub de geração.
 * O workspace vive em `src/components/email-outlines/*`.
 */
import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

export default function OutlinesRedirect() {
  redirect(`${ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION}?tab=outlines`)
}
