import { NextRequest } from "next/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignGeneration")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Auth: get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new AppError("Não autorizado", 401)
    }

    // Resolve user identity: portal user or org member
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    let allowedOrgId: string | null = null
    if (!portalUser) {
      const { data: orgMember } = await adminClient
        .from("org_members")
        .select("org_id")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .single()

      if (!orgMember) {
        throw new AppError("Não autorizado", 401)
      }
      allowedOrgId = orgMember.org_id
    }

    // Fetch generation by id
    const { data: generation } = await adminClient
      .from("campaign_generations")
      .select("id, client_id, name, date, reference_doc_url, drive_folder_id, drive_folder_url, status, created_at, updated_at")
      .eq("id", id)
      .single()

    if (!generation) {
      throw new AppError("Geração não encontrada", 404)
    }

    // Check ownership: portal user checks client_id, admin checks via org
    if (portalUser) {
      if (generation.client_id !== portalUser.client_id) {
        throw new AppError("Acesso negado", 403)
      }
    } else if (allowedOrgId) {
      // Verify the generation's client belongs to the admin's org
      const { data: client } = await adminClient
        .from("clients")
        .select("id")
        .eq("id", generation.client_id)
        .eq("org_id", allowedOrgId)
        .single()
      if (!client) {
        throw new AppError("Acesso negado", 403)
      }
    }

    // Fetch generation stores ordered by created_at
    const { data: stores } = await adminClient
      .from("campaign_generation_stores")
      .select("id, store_id, status, version, error_message, generated_at")
      .eq("generation_id", id)
      .order("created_at", { ascending: true })

    // Build response — exclude client_id from generation
    const { client_id: _clientId, ...generationData } = generation

    log.info(`Generation ${id} fetched: status=${generation.status}, stores=${(stores || []).length}`)

    return successResponse(request, {
      generation: generationData,
      stores: stores || [],
    })
  } catch (error) {
    return errorResponse(request, error, "CampaignGeneration")
  }
}
