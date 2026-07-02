import { createAdminClient } from "@/lib/supabase/server"
import { AppError, ForbiddenError } from "./errors"
import { logger } from "@/lib/logger"

const log = logger.child("requireStoreAccess")

export interface StoreAccessResult {
  storeId: string
  orgId: string
  storeName: string
  clientId: string | null
  // Granular permissions
  canEdit: boolean
  canManageOnboarding: boolean
  canManageCampaigns: boolean
  canManageReports: boolean
}

type GranularPermission =
  | "can_edit"
  | "can_manage_onboarding"
  | "can_manage_campaigns"
  | "can_manage_reports"

/**
 * Valida que o usuario autenticado tem acesso a uma loja especifica.
 *
 * Fluxo:
 * 1. Busca loja por ID (via adminClient, bypassa RLS)
 * 2. Verifica que loja tem org_id (lojas sem org sao bloqueadas)
 * 3. Busca profile para checar se e system admin
 * 4. Admin global → acesso total (todas flags true), sem necessidade de org membership
 * 5. Busca org_member para o usuario nesta org (obrigatorio para nao-admin)
 * 6. Owner da org → acesso total (todas flags true)
 * 7. Demais → consulta agent_store_access para org_member_id + store_id
 * 8. Se nao ha row com can_view=true → ForbiddenError
 * 9. Se requiredPermission fornecido e usuario nao tem → ForbiddenError
 *
 * Usar em rotas que usam createAdminClient() ou getStoreCredentials()
 * para garantir isolamento multi-tenant.
 */
export async function requireStoreAccess(
  storeId: string,
  userId: string,
  requiredPermission?: GranularPermission
): Promise<StoreAccessResult> {
  const adminClient = createAdminClient()

  // 1. Buscar loja e profile em paralelo (independentes: derivam de storeId/userId)
  const [{ data: store, error }, { data: profile }] = await Promise.all([
    adminClient
      .from("client_stores")
      .select("id, org_id, store_name, client_id")
      .eq("id", storeId)
      .single(),
    adminClient
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single(),
  ])

  if (error) {
    log.error("Failed to fetch store", { storeId, code: error.code, message: error.message })
  }

  if (!store) {
    throw new AppError("Recurso não encontrado", 404)
  }

  // 2. Guardar contra org_id NULL (loja orfã sem org)
  if (!store.org_id) {
    log.error("Store has NULL org_id", { storeId })
    throw new AppError("Loja sem organização associada", 400)
  }

  // 3. Check if system admin
  const isAdmin = profile?.role === "admin"

  // 4. Buscar org_member para este usuario nesta org
  const { data: orgMember, error: orgError } = await adminClient
    .from("org_members")
    .select("id, role")
    .eq("profile_id", userId)
    .eq("org_id", store.org_id)
    .eq("is_active", true)
    .single()

  if (orgError && !isAdmin) {
    log.error("Failed to check org membership", {
      userId,
      orgId: store.org_id,
      code: orgError.code,
      message: orgError.message,
    })
  }

  // Admin bypasses org membership check entirely
  if (!orgMember && !isAdmin) {
    throw new ForbiddenError("Sem acesso a esta loja")
  }

  // 5. Admin or owner → full access
  if (isAdmin || orgMember?.role === "owner") {
    const result: StoreAccessResult = {
      storeId: store.id,
      orgId: store.org_id,
      storeName: store.store_name,
      clientId: store.client_id,
      canEdit: true,
      canManageOnboarding: true,
      canManageCampaigns: true,
      canManageReports: true,
    }
    return result
  }

  // 6. Regular member → query agent_store_access
  const { data: access } = await adminClient
    .from("agent_store_access")
    .select("can_view, can_edit, can_manage_onboarding, can_manage_campaigns, can_manage_reports")
    .eq("org_member_id", orgMember!.id)
    .eq("store_id", storeId)
    .eq("can_view", true)
    .single()

  // 7. No access row → forbidden
  if (!access) {
    throw new ForbiddenError("Sem acesso a esta loja")
  }

  const result: StoreAccessResult = {
    storeId: store.id,
    orgId: store.org_id,
    storeName: store.store_name,
    clientId: store.client_id,
    canEdit: access.can_edit ?? false,
    canManageOnboarding: access.can_manage_onboarding ?? false,
    canManageCampaigns: access.can_manage_campaigns ?? false,
    canManageReports: access.can_manage_reports ?? false,
  }

  // 8. Check required granular permission
  if (requiredPermission) {
    const permissionMap: Record<GranularPermission, boolean> = {
      can_edit: result.canEdit,
      can_manage_onboarding: result.canManageOnboarding,
      can_manage_campaigns: result.canManageCampaigns,
      can_manage_reports: result.canManageReports,
    }

    if (!permissionMap[requiredPermission]) {
      throw new ForbiddenError(
        `Permissão insuficiente: ${requiredPermission.replace(/_/g, " ")} não concedida para esta loja`
      )
    }
  }

  return result
}

export interface AccessibleStoresResult {
  /** Store IDs the user can access, or null for admin/owner (all stores). */
  storeIds: string[] | null
  /** Whether the user is a system admin (profiles.role = 'admin'). */
  isSystemAdmin: boolean
}

/**
 * Returns the list of store IDs the user can access within an org.
 * Returns null for admin/owner (meaning "all stores" — caller should skip filtering).
 */
export async function getAccessibleStoreIds(
  userId: string,
  orgId: string
): Promise<string[] | null>
export async function getAccessibleStoreIds(
  userId: string,
  orgId: string,
  options: { detailed: true }
): Promise<AccessibleStoresResult>
export async function getAccessibleStoreIds(
  userId: string,
  orgId: string,
  options?: { detailed: true }
): Promise<string[] | null | AccessibleStoresResult> {
  const adminClient = createAdminClient()

  // 1+2. Profile e org_member em paralelo (independentes: derivam de userId/orgId)
  const [{ data: profile }, { data: orgMember }] = await Promise.all([
    adminClient
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single(),
    adminClient
      .from("org_members")
      .select("id, role")
      .eq("profile_id", userId)
      .eq("org_id", orgId)
      .eq("is_active", true)
      .single(),
  ])

  if (profile?.role === "admin") {
    if (options?.detailed) return { storeIds: null, isSystemAdmin: true }
    return null
  }

  if (!orgMember) {
    // Not a member of this org — return empty array (no stores accessible)
    if (options?.detailed) return { storeIds: [], isSystemAdmin: false }
    return []
  }

  if (orgMember.role === "owner") {
    if (options?.detailed) return { storeIds: null, isSystemAdmin: false }
    return null
  }

  // 3. Regular member — query agent_store_access (only active stores)
  const { data: accessRows } = await adminClient
    .from("agent_store_access")
    .select("store_id, store:client_stores!inner(is_active)")
    .eq("org_member_id", orgMember.id)
    .eq("can_view", true)
    .eq("store.is_active", true)

  const ids = (accessRows || []).map((row) => row.store_id)
  if (options?.detailed) return { storeIds: ids, isSystemAdmin: false }
  return ids
}
