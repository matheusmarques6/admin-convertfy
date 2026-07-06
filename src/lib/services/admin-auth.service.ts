import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Helpers de auth do admin deduplicados por request via React.cache —
 * layout e página compartilham o resultado em vez de repetir as mesmas
 * queries (getUser/profiles/org_members) na mesma navegação.
 *
 * Mesmo padrão do portal (portal-auth.service.ts). Nenhum helper
 * redireciona: cada caller mantém seu próprio redirect()/notFound().
 */

export const getSessionUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

export const getProfileByUserId = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single()
  return data
})

/**
 * org_member ativo do usuário (mesmos filtros dos call sites de
 * board/dashboards: profile_id + is_active, limit 1). NÃO substitui
 * resolveOrgId (que ordena por created_at e lança AppError) nem a query
 * do layout (que ordena por role e faz join de organizations).
 */
export const getActiveOrgMember = cache(async (userId: string) => {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from("org_members")
    .select("id, org_id, role")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single()
  return data as { id: string; org_id: string; role: string } | null
})
