import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import {
  errorResponse,
  successResponse,
  requireAuth,
  requireRole,
  parseAndValidate,
  ConflictError,
} from "@/lib/api/errors"
import { organizationCreateSchema } from "@/lib/schemas/common"
import { logger } from "@/lib/logger"

const log = logger.child("Organizations")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - List organizations
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get("type")
    const activeOnly = searchParams.get("active_only") !== "false"

    let query = supabase
      .from("organizations")
      .select("*")
      .order("name", { ascending: true })

    if (type) {
      query = query.eq("type", type)
    }

    if (activeOnly) {
      query = query.eq("is_active", true)
    }

    const { data: organizations, error } = await query

    if (error) {
      log.error("Error fetching organizations", { error: error.message })
      throw error
    }

    // Get member count for each organization
    const orgsWithCounts = await Promise.all(
      (organizations || []).map(async (org) => {
        const { count } = await supabase
          .from("org_members")
          .select("*", { count: "exact", head: true })
          .eq("org_id", org.id)
          .eq("is_active", true)

        return {
          ...org,
          member_count: count || 0,
        }
      })
    )

    return successResponse(request, { organizations: orgsWithCounts })
  } catch (error) {
    return errorResponse(request, error, "Organizations GET")
  }
}

// POST - Create new organization
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireRole(supabase, ["admin"])

    const body = await parseAndValidate(request, organizationCreateSchema)

    // Check if slug already exists
    const { data: existing } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", body.slug)
      .single()

    if (existing) {
      throw new ConflictError("Este slug já está em uso")
    }

    const adminClient = createAdminClient()

    const { data: organization, error: insertError } = await adminClient
      .from("organizations")
      .insert({
        name: body.name,
        slug: body.slug,
        settings: {},
      })
      .select()
      .single()

    if (insertError) {
      log.error("Insert error", { error: insertError.message })
      throw insertError
    }

    return successResponse(request, { organization }, {
      status: 201,
      message: "Organização criada com sucesso",
    })
  } catch (error) {
    return errorResponse(request, error, "Organizations POST")
  }
}
