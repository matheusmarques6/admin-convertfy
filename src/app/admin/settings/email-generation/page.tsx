/**
 * /admin/settings/email-generation — RSC
 *
 * Página única de gestão do pipeline AE. Substitui (e absorve via redirect):
 *   - `/admin/agents/prompts` (mesmos componentes, agora aba Agentes)
 *   - `/admin/email-blueprints` (idem, aba Blueprints)
 *
 * Auth gate idêntico a `/admin/agents/prompts` (canManagePrompts: admin/owner OR tag 'dev').
 * Pré-fetch paralelo de prompts + blueprints; passa initials pro client workspace.
 */
import { redirect } from "next/navigation"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { ROUTES } from "@/lib/routes"
import {
  canManagePrompts,
  listPrompts,
} from "@/lib/services/prompt-management.service"
import { listBlueprintsWithDefaults } from "@/lib/services/blueprint-management.service"
import { EmailGenerationWorkspace } from "@/components/email-generation/email-generation-workspace"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function EmailGenerationSettingsPage({
  searchParams,
}: PageProps) {
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

  const [prompts, blueprints] = await Promise.all([
    listPrompts({ truncatePreview: true }),
    listBlueprintsWithDefaults(),
  ])

  const sp = await searchParams
  const initialTab = sp?.tab

  return (
    <EmailGenerationWorkspace
      prompts={prompts}
      blueprints={blueprints}
      initialTab={
        initialTab === "agents" ||
        initialTab === "blueprints" ||
        initialTab === "outlines" ||
        initialTab === "components" ||
        initialTab === "settings" ||
        initialTab === "references" ||
        initialTab === "test"
          ? initialTab
          : undefined
      }
    />
  )
}
