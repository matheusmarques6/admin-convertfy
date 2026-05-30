/**
 * /admin/agents/prompts — Server component
 *
 * Lê profile + tags do usuário, redireciona se não for admin/owner/dev,
 * busca o estado inicial dos prompts (lista agrupada por agent_type) e
 * delega a interatividade pro client component `PromptsWorkspace`.
 */
import { redirect } from "next/navigation"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { ROUTES } from "@/lib/routes"
import {
  canManagePrompts,
  listPrompts,
} from "@/lib/services/prompt-management.service"
import { PromptsWorkspace } from "@/components/agents/prompts-workspace"

export const dynamic = "force-dynamic"

export default async function PromptsPage() {
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

  const initial = await listPrompts({ truncatePreview: true })

  return <PromptsWorkspace initial={initial} />
}
