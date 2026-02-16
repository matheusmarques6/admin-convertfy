import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalBranding")

/**
 * GET /api/portal/branding
 *
 * Returns the organization branding for the logged-in portal user.
 * Used by the portal layout to dynamically show agency logo, colors, and name.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const user = await requireAuth(supabase)

    // Get portal user → client → organization
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      // Not a portal user — return default branding
      return successResponse(request, {
        name: "Convertfy",
        logo_url: null,
        primary_color: "#3b82f6",
      })
    }

    // Get client's org_id
    const { data: client } = await adminClient
      .from("clients")
      .select("org_id")
      .eq("id", portalUser.client_id)
      .single()

    if (!client?.org_id) {
      return successResponse(request, {
        name: "Convertfy",
        logo_url: null,
        primary_color: "#3b82f6",
      })
    }

    // Get organization branding
    const { data: org } = await adminClient
      .from("organizations")
      .select("name, logo_url, primary_color")
      .eq("id", client.org_id)
      .single()

    return successResponse(request, {
      name: org?.name || "Convertfy",
      logo_url: org?.logo_url || null,
      primary_color: org?.primary_color || "#3b82f6",
    })
  } catch (error) {
    log.error("Error fetching branding", error)
    return errorResponse(request, error, "PortalBranding")
  }
}
