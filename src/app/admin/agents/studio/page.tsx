/**
 * /admin/agents/studio — RSC
 *
 * Estúdio de Agentes: página única do pipeline de geração de emails com
 * três abas (Visão Geral | Editor | Execuções), fiel à maquete "Estúdio
 * de Agentes". Substitui na navegação "Logs de geração" e "Execuções ao
 * vivo" — as rotas antigas continuam vivas como drill-down (linkadas de
 * dentro do Estúdio).
 *
 * Auth gate: canManagePrompts (admin/owner OU tag 'dev') — mesmo gate das
 * páginas que absorve.
 */
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { ROUTES } from "@/lib/routes"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import { StudioWorkspace } from "@/components/agent-studio/studio-workspace"

export const dynamic = "force-dynamic"

export default async function AgentStudioPage() {
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

  return (
    // Suspense: o workspace lê useSearchParams (aba via ?tab=).
    <Suspense fallback={null}>
      <StudioWorkspace />
    </Suspense>
  )
}
