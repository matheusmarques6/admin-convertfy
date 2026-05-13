/**
 * POST /api/client-stores
 * Cria store nova vinculada a um cliente da org.
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const body = await request.json()

    if (!body.client_id || !body.store_name) {
      throw new AppError("client_id e store_name obrigatorios", 400)
    }

    // Verifica que o cliente pertence a org
    const { data: client } = await admin
      .from("clients")
      .select("id")
      .eq("id", body.client_id)
      .eq("org_id", orgId)
      .maybeSingle()
    if (!client) throw new AppError("Cliente nao encontrado", 404)

    const { data, error } = await admin
      .from("client_stores")
      .insert({
        org_id: orgId,
        client_id: body.client_id,
        store_name: body.store_name,
        store_url: body.store_url ?? null,
        platform: body.platform ?? "other",
        is_active: true,
      })
      .select("*")
      .single()
    if (error) {
      if (error.code === "23505") {
        throw new AppError(
          `Ja existe uma loja com nome "${body.store_name}" nesta org.`,
          409,
        )
      }
      throw error
    }
    return successResponse(request, { store: data }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "client-stores-create")
  }
}
