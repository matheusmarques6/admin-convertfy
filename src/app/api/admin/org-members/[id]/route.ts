import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("AdminOrgMembers")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - Get single org member with full details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    // Fetch member with all related data
    const { data: member, error } = await supabase
      .from("org_members")
      .select(`
        *,
        organization:organizations(id, name, slug, type),
        profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url, role)
      `)
      .eq("id", id)
      .single()

    if (error || !member) {
      throw new AppError("Membro não encontrado", 404)
    }

    // Fetch features
    const { data: features } = await supabase
      .from("org_member_features")
      .select(`
        *,
        feature:features_catalog(key, name, description, category, icon)
      `)
      .eq("org_member_id", id)

    // Fetch store access
    const { data: storeAccess } = await supabase
      .from("agent_store_access")
      .select(`
        *,
        store:client_stores(id, store_name, store_url, platform, client:clients(id, name))
      `)
      .eq("org_member_id", id)

    return NextResponse.json({
      member: {
        ...member,
        features: features || [],
        store_access: storeAccess || [],
      },
    }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    return errorResponse(request, error, "AdminOrgMembers")
  }
}

// PUT - Update org member
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Get the member being updated to check org
    const { data: targetMember } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("id", id)
      .single()

    if (!targetMember) {
      throw new AppError("Membro não encontrado", 404)
    }

    // Check if user has permission: system admin OR org owner/admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const isSystemAdmin = profile?.role === "admin"

    const { data: userOrgMember } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", targetMember.org_id)
      .eq("profile_id", user.id)
      .single()

    const isOrgAdmin = userOrgMember?.role === "owner" || userOrgMember?.role === "manager"

    if (!isSystemAdmin && !isOrgAdmin) {
      throw new AppError("Acesso negado", 403)
    }

    const body = await request.json()
    const adminClient = createAdminClient()

    // Update member basic info
    const updateData: Record<string, unknown> = {}
    if (body.role) updateData.role = body.role
    if (body.job_title !== undefined) updateData.job_title = body.job_title
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const { data: member, error: updateError } = await adminClient
      .from("org_members")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        organization:organizations(id, name, slug),
        profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
      `)
      .single()

    if (updateError) {
      log.error("[Org Member] Update error:", updateError)
      throw new AppError("Erro ao atualizar membro", 500)
    }

    // Update features if provided
    if (body.features !== undefined) {
      // Remove all existing features
      await adminClient
        .from("org_member_features")
        .delete()
        .eq("org_member_id", id)

      // Add new features
      if (body.features.length > 0) {
        const featureInserts = body.features.map((featureKey: string) => ({
          org_member_id: id,
          feature_key: featureKey,
          enabled: true,
          granted_by: user.id,
        }))

        await adminClient
          .from("org_member_features")
          .insert(featureInserts)
      }
    }

    // Update store access if provided
    if (body.store_ids !== undefined) {
      // Remove all existing access
      await adminClient
        .from("agent_store_access")
        .delete()
        .eq("org_member_id", id)

      // Add new access
      if (body.store_ids.length > 0) {
        const accessInserts = body.store_ids.map((storeId: string) => ({
          org_member_id: id,
          store_id: storeId,
          can_view: true,
          can_edit: body.can_edit || false,
          can_manage_onboarding: body.can_manage_onboarding || false,
          can_manage_campaigns: body.can_manage_campaigns || false,
          can_manage_reports: body.can_manage_reports || false,
          assigned_by: user.id,
        }))

        await adminClient
          .from("agent_store_access")
          .insert(accessInserts)
      }
    }

    return successResponse(request, { member, message: "Membro atualizado com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "AdminOrgMembers")
  }
}

// DELETE - Remove org member (soft delete by deactivating)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Get the member being deleted to check org
    const { data: targetMember } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("id", id)
      .single()

    if (!targetMember) {
      throw new AppError("Membro não encontrado", 404)
    }

    // Check if user has permission: system admin OR org owner/admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const isSystemAdmin = profile?.role === "admin"

    const { data: userOrgMember } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", targetMember.org_id)
      .eq("profile_id", user.id)
      .single()

    const isOrgAdmin = userOrgMember?.role === "owner" || userOrgMember?.role === "manager"

    if (!isSystemAdmin && !isOrgAdmin) {
      throw new AppError("Acesso negado", 403)
    }

    const adminClient = createAdminClient()

    // Get member info before deletion
    const { data: member } = await supabase
      .from("org_members")
      .select("*, profile:profiles!org_members_profile_id_fkey(name)")
      .eq("id", id)
      .single()

    // Soft delete by deactivating
    const { error: deleteError } = await adminClient
      .from("org_members")
      .update({ is_active: false })
      .eq("id", id)

    if (deleteError) {
      log.error("[Org Member] Delete error:", deleteError)
      throw new AppError("Erro ao remover membro", 500)
    }

    // Log activity
    await supabase.from("activities").insert({
      user_id: user.id,
      type: "client_updated",
      description: `Membro "${member?.profile?.name}" foi desativado`,
      metadata: { member_id: id },
    })

    return successResponse(request, { success: true, message: "Membro removido com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "AdminOrgMembers")
  }
}
