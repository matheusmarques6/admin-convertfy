/**
 * GET /api/conteudo/posts/[id]/leads — contatos que comentaram no post e
 * depois abriram conversa no direct (comment gate), com o estágio no CRM.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { leadsDoPostService } from "@/lib/services/conteudo-dashboard.service"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const r = await leadsDoPostService(admin, orgId, id)
    return successResponse(request, r)
  } catch (error) {
    return errorResponse(request, error, "conteudo-post-leads")
  }
}
