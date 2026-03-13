import { SupabaseClient } from "@supabase/supabase-js"
import { AppError } from "@/lib/api/errors"

// --- Types ---

export interface PortalClientContext {
  clientId: string
  storeIds: string[]
  storeNameMap: Record<string, string>
}

// --- Errors ---

export class PortalAuthError extends AppError {
  constructor(message: string, statusCode: number = 401) {
    super(message, statusCode, "PORTAL_AUTH_ERROR")
    this.name = "PortalAuthError"
  }
}

// --- Helper ---

/**
 * Resolves auth_user_id -> client_id -> active store_ids[].
 * Uses adminClient (service role) — does not depend on RLS.
 *
 * @throws PortalAuthError (401) if portal user not found or inactive
 * @throws PortalAuthError (500) if store resolution fails
 */
export async function resolvePortalClient(
  adminClient: SupabaseClient,
  authUserId: string
): Promise<PortalClientContext> {
  // 1. Buscar portal user ativo
  const { data: portalUser, error: puError } = await adminClient
    .from("client_portal_users")
    .select("client_id, is_active")
    .eq("auth_user_id", authUserId)
    .single()

  if (puError || !portalUser) {
    throw new PortalAuthError("Portal user not found")
  }

  if (!portalUser.is_active) {
    throw new PortalAuthError("Portal user is inactive")
  }

  // 2. Buscar lojas ATIVAS do cliente (F6 fix)
  const { data: stores, error: stError } = await adminClient
    .from("client_stores")
    .select("id, store_name")
    .eq("client_id", portalUser.client_id)
    .eq("is_active", true)

  if (stError || !stores) {
    throw new PortalAuthError("Failed to resolve client stores", 500)
  }

  const storeIds = stores.map((s) => s.id)
  const storeNameMap: Record<string, string> = {}
  for (const s of stores) {
    storeNameMap[s.id] = s.store_name ?? ""
  }

  return {
    clientId: portalUser.client_id,
    storeIds,
    storeNameMap,
  }
}
