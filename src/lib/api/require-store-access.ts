import { createAdminClient } from "@/lib/supabase/server"
import { AppError, ForbiddenError } from "./errors"
import { logger } from "@/lib/logger"

const log = logger.child("requireStoreAccess")

interface StoreAccessResult {
  storeId: string
  orgId: string
  storeName: string
  clientId: string | null
}

/**
 * Valida que o usuario autenticado tem acesso a uma loja especifica.
 *
 * Fluxo:
 * 1. Busca loja por ID (via adminClient, bypassa RLS)
 * 2. Verifica que loja tem org_id (lojas sem org sao bloqueadas)
 * 3. Busca org do usuario em org_members
 * 4. Compara org da loja com org do usuario
 * 5. Retorna dados da loja se match
 *
 * Usar em rotas que usam createAdminClient() ou getStoreCredentials()
 * para garantir isolamento multi-tenant.
 */
export async function requireStoreAccess(
  storeId: string,
  userId: string
): Promise<StoreAccessResult> {
  const adminClient = createAdminClient()

  // 1. Buscar a loja
  const { data: store, error } = await adminClient
    .from("client_stores")
    .select("id, org_id, store_name, client_id")
    .eq("id", storeId)
    .single()

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

  // 3. Verificar que usuario pertence a mesma org
  const { data: orgMember, error: orgError } = await adminClient
    .from("org_members")
    .select("id")
    .eq("profile_id", userId)
    .eq("org_id", store.org_id)
    .eq("is_active", true)
    .single()

  if (orgError) {
    log.error("Failed to check org membership", { userId, orgId: store.org_id, code: orgError.code, message: orgError.message })
  }

  if (!orgMember) {
    throw new ForbiddenError("Sem acesso a esta loja")
  }

  return {
    storeId: store.id,
    orgId: store.org_id,
    storeName: store.store_name,
    clientId: store.client_id,
  }
}
