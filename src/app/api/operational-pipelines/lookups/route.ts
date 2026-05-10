/**
 * GET /api/operational-pipelines/lookups
 *
 * Retorna em uma unica chamada os dados que os dialogs do operational
 * board precisam pra preencher pickers: membros da org, clientes,
 * lojas. Acessivel a qualquer membro ativo da org.
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const [membersQ, clientsQ, storesQ] = await Promise.all([
      admin
        .from("org_members")
        .select(
          "id, role, profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)",
        )
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("role", { ascending: true }),
      admin
        .from("clients")
        .select("id, name, company")
        .eq("org_id", orgId)
        .order("name"),
      admin
        .from("client_stores")
        .select("id, store_name, platform, client_id")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("store_name"),
    ])

    return successResponse(request, {
      members: membersQ.data ?? [],
      clients: clientsQ.data ?? [],
      stores: storesQ.data ?? [],
    })
  } catch (error) {
    return errorResponse(request, error, "operational-lookups")
  }
}
