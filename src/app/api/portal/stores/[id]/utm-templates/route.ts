import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalUtmTemplates")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - List active UTM templates for a portal store (read-only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: storeId } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const adminClient = createAdminClient()

    // Get portal user
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("id, client_id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Nao autorizado", 401)
    }

    // Verify store belongs to client
    const { data: store } = await adminClient
      .from("client_stores")
      .select("id, org_id")
      .eq("id", storeId)
      .eq("client_id", portalUser.client_id)
      .single()

    if (!store) {
      throw new AppError("Loja nao encontrada", 404)
    }

    // Fetch active templates (exclude soft-deleted, exclude sensitive fields)
    const { data: templates, error: templatesError } = await adminClient
      .from("utm_templates")
      .select(
        "id, name, description, utm_source, utm_medium, utm_campaign, utm_content, utm_term, usage_count, created_at"
      )
      .eq("store_id", storeId)
      .eq("org_id", store.org_id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("usage_count", { ascending: false })

    if (templatesError) {
      log.error("[Portal UTM Templates] Query error:", templatesError)
      throw new AppError("Erro ao buscar templates", 500)
    }

    return NextResponse.json(
      {
        success: true,
        templates: templates || [],
        fetchedAt: new Date().toISOString(),
      },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(
      request,
      error,
      "GET /api/portal/stores/[id]/utm-templates"
    )
  }
}
