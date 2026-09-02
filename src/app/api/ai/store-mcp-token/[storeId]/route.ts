/**
 * Gestão do token do servidor MCP da loja (/api/mcp/stores/[id]):
 *  GET    → status (existe? desde quando) + URL do endpoint
 *  POST   → gera/rotaciona (devolve o token em claro UMA vez)
 *  DELETE → revoga
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  generateStoreMcpToken,
  revokeStoreMcpToken,
  storeMcpTokenStatus,
} from "@/lib/ai/store-mcp-token.service"

export const dynamic = "force-dynamic"

async function assertStoreInOrg(storeId: string, orgId: string): Promise<void> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("client_stores")
    .select("id")
    .eq("id", storeId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!data) throw new AppError("Loja não encontrada", 404, "not-found")
}

function endpointUrl(request: NextRequest, storeId: string): string {
  const origin = request.nextUrl.origin
  return `${origin}/api/mcp/stores/${storeId}`
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ storeId: string }> },
) {
  try {
    const { storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    await assertStoreInOrg(storeId, orgId)
    const status = await storeMcpTokenStatus(storeId)
    return successResponse(request, { ...status, url: endpointUrl(request, storeId) })
  } catch (error) {
    return errorResponse(request, error, "store-mcp-token-status")
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ storeId: string }> },
) {
  try {
    const { storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    await assertStoreInOrg(storeId, orgId)
    const token = await generateStoreMcpToken(storeId)
    return successResponse(request, { token, url: endpointUrl(request, storeId) })
  } catch (error) {
    return errorResponse(request, error, "store-mcp-token-generate")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ storeId: string }> },
) {
  try {
    const { storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    await assertStoreInOrg(storeId, orgId)
    await revokeStoreMcpToken(storeId)
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "store-mcp-token-revoke")
  }
}
