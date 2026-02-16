import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { AgentStoreAccessFormData } from "@/types"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("AdminStoreAccess")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - List store access records
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const orgMemberId = searchParams.get("org_member_id")
    const storeId = searchParams.get("store_id")
    const clientId = searchParams.get("client_id")

    let query = supabase
      .from("agent_store_access")
      .select(`
        *,
        org_member:org_members(
          id,
          role,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        ),
        store:client_stores(
          id,
          store_name,
          store_url,
          platform,
          client:clients(id, name, company)
        )
      `)
      .order("assigned_at", { ascending: false })

    if (orgMemberId) {
      query = query.eq("org_member_id", orgMemberId)
    }

    if (storeId) {
      query = query.eq("store_id", storeId)
    }

    // If client_id is provided, we need to filter by stores that belong to this client
    if (clientId) {
      const { data: clientStores } = await supabase
        .from("client_stores")
        .select("id")
        .eq("client_id", clientId)

      if (clientStores && clientStores.length > 0) {
        const storeIds = clientStores.map((s) => s.id)
        query = query.in("store_id", storeIds)
      } else {
        return successResponse(request, { access: [] })
      }
    }

    const { data: access, error } = await query

    if (error) {
      log.error("[Store Access] Error fetching:", error)
      throw new AppError("Erro ao buscar acessos", 500)
    }

    return successResponse(request, { access: access || [] })
  } catch (error) {
    return errorResponse(request, error, "AdminStoreAccess")
  }
}

// POST - Grant store access to a member
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      throw new AppError("Acesso negado", 403)
    }

    const body: AgentStoreAccessFormData = await request.json()

    if (!body.org_member_id || !body.store_id) {
      throw new AppError("Campos obrigatórios: org_member_id, store_id", 400)
    }

    const adminClient = createAdminClient()

    // Check if access already exists
    const { data: existing } = await supabase
      .from("agent_store_access")
      .select("id")
      .eq("org_member_id", body.org_member_id)
      .eq("store_id", body.store_id)
      .single()

    if (existing) {
      // Update existing access
      const { data: access, error: updateError } = await adminClient
        .from("agent_store_access")
        .update({
          can_view: body.can_view ?? true,
          can_edit: body.can_edit ?? false,
          can_manage_onboarding: body.can_manage_onboarding ?? false,
          can_manage_campaigns: body.can_manage_campaigns ?? false,
          can_manage_reports: body.can_manage_reports ?? false,
          notes: body.notes || null,
        })
        .eq("id", existing.id)
        .select(`
          *,
          store:client_stores(id, store_name, store_url, platform)
        `)
        .single()

      if (updateError) {
        log.error("[Store Access] Update error:", updateError)
        throw new AppError("Erro ao atualizar acesso", 500)
      }

      return successResponse(request, { access, message: "Acesso atualizado com sucesso" })
    }

    // Create new access
    const { data: access, error: insertError } = await adminClient
      .from("agent_store_access")
      .insert({
        org_member_id: body.org_member_id,
        store_id: body.store_id,
        can_view: body.can_view ?? true,
        can_edit: body.can_edit ?? false,
        can_manage_onboarding: body.can_manage_onboarding ?? false,
        can_manage_campaigns: body.can_manage_campaigns ?? false,
        can_manage_reports: body.can_manage_reports ?? false,
        assigned_by: user.id,
        notes: body.notes || null,
      })
      .select(`
        *,
        store:client_stores(id, store_name, store_url, platform)
      `)
      .single()

    if (insertError) {
      log.error("[Store Access] Insert error:", insertError)
      throw new AppError("Erro ao criar acesso", 500)
    }

    return successResponse(request, { access, message: "Acesso concedido com sucesso" }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "AdminStoreAccess")
  }
}

// DELETE - Remove store access (bulk or single)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      throw new AppError("Acesso negado", 403)
    }

    const searchParams = request.nextUrl.searchParams
    const accessId = searchParams.get("id")
    const orgMemberId = searchParams.get("org_member_id")
    const storeId = searchParams.get("store_id")

    const adminClient = createAdminClient()

    if (accessId) {
      // Delete by ID
      const { error } = await adminClient
        .from("agent_store_access")
        .delete()
        .eq("id", accessId)

      if (error) {
        log.error("[Store Access] Delete error:", error)
        throw new AppError("Erro ao remover acesso", 500)
      }
    } else if (orgMemberId && storeId) {
      // Delete by member + store combination
      const { error } = await adminClient
        .from("agent_store_access")
        .delete()
        .eq("org_member_id", orgMemberId)
        .eq("store_id", storeId)

      if (error) {
        log.error("[Store Access] Delete error:", error)
        throw new AppError("Erro ao remover acesso", 500)
      }
    } else {
      throw new AppError("Parâmetros obrigatórios: id ou (org_member_id + store_id)", 400)
    }

    return successResponse(request, { success: true, message: "Acesso removido com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "AdminStoreAccess")
  }
}
