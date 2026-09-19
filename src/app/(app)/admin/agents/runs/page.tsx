/**
 * /admin/agents/runs — RSC (Story AE-9)
 *
 * Live view de execuções de agentes do pipeline AE: mostra em tempo real
 * (SSE) se cada agente foi acionado e onde cada flow automático está —
 * complementa a página de logs históricos
 * (`/admin/settings/email-generation-logs`), que só mostra runs concluídos.
 *
 * Auth gate: canManagePrompts (admin/owner OU tag 'dev') — prompts/outputs
 * podem conter dados de briefing do cliente.
 */
import { redirect } from "next/navigation"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { ROUTES } from "@/lib/routes"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import { RunsLiveWorkspace } from "@/components/agents/runs-live-workspace"

export const dynamic = "force-dynamic"

export default async function AgentRunsPage() {
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

  return <RunsLiveWorkspace />
}
