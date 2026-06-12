/**
 * /admin/ai-usage — RSC
 *
 * Dashboard de observabilidade de custo de IA: cada execução de cada
 * agente interno (pipeline AE, Central de Campanhas, CRM e call-sites
 * standalone) com tokens, custo e duração.
 *
 * Auth gate: canManagePrompts (admin/owner OR tag 'dev') — mesma regra
 * de /admin/settings/email-generation.
 */
import { redirect } from "next/navigation"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { ROUTES } from "@/lib/routes"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import { AiUsageDashboard } from "@/components/ai-usage/ai-usage-dashboard"

export const dynamic = "force-dynamic"

export default async function AiUsagePage() {
  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect(ROUTES.ADMIN.DASHBOARD)

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("role, tags")
    .eq("id", user.id)
    .maybeSingle()

  const actor = {
    id: user.id,
    role: ((profile as { role?: string | null } | null)?.role ?? null) as
      | string
      | null,
    tags: (((profile as { tags?: string[] } | null)?.tags ?? []) as string[]),
  }
  if (!canManagePrompts(actor)) redirect(ROUTES.ADMIN.DASHBOARD)

  return <AiUsageDashboard />
}
