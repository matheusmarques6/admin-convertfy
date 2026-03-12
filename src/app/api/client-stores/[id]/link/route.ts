import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError, ForbiddenError } from "@/lib/api/errors"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { storeLinkSchema } from "@/lib/schemas/store.schemas"
import { logActivity } from "@/lib/events/publisher"
import { logger } from "@/lib/logger"

const log = logger.child("ClientStoreLink")

// PATCH - Link or unlink a store to/from a client
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const { id: storeId } = await params

    // Validate body
    const body = await request.json()
    const { client_id: newClientId } = storeLinkSchema.parse(body)

    // Validate user has access to this store (multi-tenant isolation)
    await requireStoreAccess(storeId, user.id)

    const adminClient = createAdminClient()

    // Fetch current store data (before update) for previous_client_id
    const { data: store, error: storeError } = await adminClient
      .from("client_stores")
      .select("id, store_name, client_id, org_id")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      throw new AppError("Loja não encontrada", 404)
    }

    const previousClientId = store.client_id

    // Permission check: is_admin() OR has access to the store (can_access_store)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const isAdmin = profile?.role === "admin"

    if (!isAdmin) {
      // Check if user has access to this store via agent_store_access
      const { data: access } = await adminClient
        .from("agent_store_access")
        .select("can_edit")
        .eq("store_id", storeId)
        .eq("org_member_id", (
          await adminClient
            .from("org_members")
            .select("id")
            .eq("profile_id", user.id)
            .single()
        ).data?.id || "")
        .single()

      if (!access?.can_edit) {
        throw new ForbiddenError("Sem permissão para vincular/desvincular esta loja")
      }
    }

    // Validate that new client_id belongs to the same org as the store
    if (newClientId) {
      const { data: client, error: clientError } = await adminClient
        .from("clients")
        .select("id, org_id, name")
        .eq("id", newClientId)
        .single()

      if (clientError || !client) {
        throw new AppError("Cliente não encontrado", 404)
      }

      if (client.org_id !== store.org_id) {
        throw new AppError("Cliente pertence a outra organização", 400)
      }
    }

    // Execute UPDATE: link or unlink
    const { data: updatedStore, error: updateError } = await adminClient
      .from("client_stores")
      .update({ client_id: newClientId })
      .eq("id", storeId)
      .select("*, clients(id, name, email, company)")
      .single()

    if (updateError) {
      log.error("Failed to update store link", { storeId, error: updateError })
      throw new AppError("Erro ao atualizar vínculo da loja", 500)
    }

    // (ARCH-AD3) Cascade client_id in satellite tables
    await Promise.all([
      adminClient
        .from("store_alerts")
        .update({ client_id: newClientId })
        .eq("store_id", storeId),
      adminClient
        .from("store_onboarding_data")
        .update({ client_id: newClientId })
        .eq("store_id", storeId),
      adminClient
        .from("client_onboardings")
        .update({ client_id: newClientId })
        .eq("store_id", storeId),
    ])

    // (ARCH-AD2) Audit trail
    const isLinking = newClientId !== null
    const activityType = isLinking ? "store_linked" : "store_unlinked"

    // Fetch new client name for audit metadata
    let newClientName: string | null = null
    if (newClientId) {
      const { data: newClient } = await adminClient
        .from("clients")
        .select("name")
        .eq("id", newClientId)
        .single()
      newClientName = newClient?.name || null
    }

    await logActivity({
      client_id: newClientId || previousClientId || undefined,
      user_id: user.id,
      type: activityType,
      description: isLinking
        ? `Loja "${store.store_name}" vinculada ao cliente "${newClientName}"`
        : `Loja "${store.store_name}" desvinculada`,
      metadata: {
        store_id: storeId,
        store_name: store.store_name,
        previous_client_id: previousClientId,
        new_client_id: newClientId,
        new_client_name: newClientName,
      },
    })

    log.info("Store link updated", {
      store_id: storeId,
      previous_client_id: previousClientId,
      new_client_id: newClientId,
      action: activityType,
    })

    return successResponse(request, { store: updatedStore })
  } catch (error) {
    return errorResponse(request, error, "ClientStoreLink")
  }
}
