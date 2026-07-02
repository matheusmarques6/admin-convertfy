import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export interface PortalAuthUser {
  id: string
  name: string
  email: string
  avatar_url: string | null
  client_id: string
  is_active: boolean
  must_change_password: boolean
  clientName: string
}

/**
 * Resolve o usuário do portal da request atual (sessão + client_portal_users).
 * Envolvido em React.cache: layout e página compartilham o MESMO resultado
 * dentro de uma request — 1 query, não 2.
 * Retorna null se não autenticado ou sem acesso ao portal.
 */
export const getPortalUser = cache(async (): Promise<PortalAuthUser | null> => {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  const admin = createAdminClient()
  const { data: portalUser } = await admin
    .from("client_portal_users")
    .select(
      "id, name, email, avatar_url, client_id, is_active, must_change_password, client:clients(name, company)"
    )
    .eq("auth_user_id", authUser.id)
    .single()

  if (!portalUser) return null

  const client = portalUser.client as unknown as {
    name: string | null
    company: string | null
  } | null

  return {
    id: portalUser.id,
    name: portalUser.name,
    email: portalUser.email,
    avatar_url: portalUser.avatar_url || null,
    client_id: portalUser.client_id,
    is_active: portalUser.is_active ?? true,
    must_change_password: portalUser.must_change_password ?? false,
    clientName: client?.name || client?.company || "",
  }
})
