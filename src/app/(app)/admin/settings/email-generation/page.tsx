/**
 * /admin/settings/email-generation — RSC
 *
 * Página única de gestão do pipeline AE. Substitui (e absorve via redirect):
 *   - `/admin/agents/prompts` (mesmos componentes, agora aba Agentes)
 *   - `/admin/email-blueprints` e `/admin/outlines` (as duas viraram a aba
 *     "Arquitetura dos Emails", que carrega os próprios dados pela rota
 *     `/api/admin/email-architecture` — daí não haver mais pré-fetch de
 *     blueprints aqui)
 *
 * Auth gate idêntico a `/admin/agents/prompts` (canManagePrompts: admin/owner OR tag 'dev').
 */
import { redirect } from "next/navigation"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { ROUTES } from "@/lib/routes"
import {
  canManagePrompts,
  listPrompts,
} from "@/lib/services/prompt-management.service"
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

  const prompts = await listPrompts({ truncatePreview: true })

  const sp = await searchParams

  // A validação da aba é do `parseTab` do workspace, que também resolve os
  // aliases legados (`blueprints`/`outlines` → `architecture`). Repetir a
  // lista aqui era como a aba "vault" ficava inalcançável por URL.
  return <EmailGenerationWorkspace prompts={prompts} initialTab={sp?.tab} />
}
