/**
 * /admin/settings/email-generation-logs — RSC
 *
 * Página fiel à maquete `Logs_de_Geração_de_Emails_Abordagem_A`:
 * dashboard operacional do COO com KPIs, custo no tempo, resumo
 * por agente do pipeline AE (7 agentes) e tabela detalhada com
 * expand pra ver input vars / raw output / parsed output.
 *
 * Auth gate: canManagePrompts (admin/owner OU tag 'dev').
 */
import { redirect } from "next/navigation"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { ROUTES } from "@/lib/routes"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import { LogsWorkspace } from "@/components/email-generation-logs/logs-workspace"

export const dynamic = "force-dynamic"

export default async function EmailGenerationLogsPage() {
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

  return <LogsWorkspace />
}
