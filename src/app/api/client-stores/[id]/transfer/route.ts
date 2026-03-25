import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { transferStoreSchema } from "@/lib/validations/store-transfer"
import { logger } from "@/lib/logger"

const log = logger.child("StoreTransfer")

// POST - Transfer a store to a different client
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const { id: storeId } = await params

    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    // Validate access — require can_edit permission (admin/owner bypass built-in)
    const store = await requireStoreAccess(storeId, user.id, "can_edit")

    // Parse and validate body
    const body = await request.json()
    const parsed = transferStoreSchema.safeParse(body)

    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues.map((i) => i.message).join(", "),
        400
      )
    }

    const { targetClientId, reason } = parsed.data

    // Validate target client exists and belongs to same org
    const adminClient = createAdminClient()
    const { data: targetClient, error: clientError } = await adminClient
      .from("clients")
      .select("id, name, org_id")
      .eq("id", targetClientId)
      .single()

    if (clientError || !targetClient) {
      throw new AppError("Cliente destino não encontrado", 404)
    }

    if (targetClient.org_id !== store.orgId) {
      throw new AppError(
        "Transferência cross-org não suportada. Ambos os clientes devem pertencer à mesma organização.",
        400
      )
    }

    // Call the RPC function (caller_id passed explicitly since adminClient has no auth.uid())
    const { data: result, error: rpcError } = await adminClient.rpc(
      "transfer_store_to_client",
      {
        p_store_id: storeId,
        p_target_client_id: targetClientId,
        p_caller_id: user.id,
        p_reason: reason || null,
      }
    )

    if (rpcError) {
      log.error("Transfer RPC failed", {
        storeId,
        targetClientId,
        error: rpcError.message,
        code: rpcError.code,
      })
      throw new AppError(
        rpcError.message || "Erro ao transferir loja",
        500
      )
    }

    log.info("Store transferred", {
      store_id: storeId,
      store_name: store.storeName,
      from_client_id: store.clientId,
      to_client_id: targetClientId,
      to_client_name: targetClient.name,
      transferred_by: user.id,
      result,
    })

    return successResponse(request, {
      message: `Loja "${store.storeName}" transferida para "${targetClient.name}" com sucesso`,
      transfer_id: result?.transfer_id,
      affected_tables: result?.affected_tables,
    })
  } catch (error) {
    return errorResponse(request, error, "StoreTransfer")
  }
}
