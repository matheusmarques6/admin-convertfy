import { createClient, createAdminClient } from "@/lib/supabase/server"

export interface PortalUser {
  client_id: string
  permissions: Record<string, unknown> | null
}

/**
 * Get authenticated portal user with client_id.
 * Used across all portal API routes.
 */
export async function getPortalUser(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<PortalUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const adminClient = createAdminClient()
  const { data: portalUser } = await adminClient
    .from("client_portal_users")
    .select("client_id, permissions")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .single()

  return portalUser
}


/**
 * Verify that a store belongs to a specific client.
 * Used as defense-in-depth in portal routes that receive store_id.
 */
export async function verifyStoreOwnership(
  adminClient: ReturnType<typeof createAdminClient>,
  storeId: string,
  clientId: string
): Promise<boolean> {
  const { data } = await adminClient
    .from("client_stores")
    .select("id")
    .eq("id", storeId)
    .eq("client_id", clientId)
    .single()
  return !!data
}
