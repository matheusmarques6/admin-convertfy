/**
 * /admin/email-blueprints — Server component
 *
 * Espelha o padrão de `/admin/agents/prompts`:
 * carrega profile, gateia acesso (admin/owner/dev), busca a lista
 * inicial via service (DB + DEFAULT_BLUEPRINTS) e delega ao client.
 */
import { redirect } from "next/navigation"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { ROUTES } from "@/lib/routes"
import {
  canManageEmailBlueprints,
  listBlueprintsWithDefaults,
} from "@/lib/services/blueprint-management.service"
import { BlueprintsWorkspace } from "@/components/email-blueprints/blueprints-workspace"

export const dynamic = "force-dynamic"

export default async function EmailBlueprintsPage() {
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
  if (!canManageEmailBlueprints(actor)) redirect(ROUTES.ADMIN.DASHBOARD)

  const initial = await listBlueprintsWithDefaults()

  return <BlueprintsWorkspace initial={initial} />
}
