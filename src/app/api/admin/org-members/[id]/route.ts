import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// GET - Get single org member with full details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    // Fetch member with all related data
    const { data: member, error } = await supabase
      .from("org_members")
      .select(`
        *,
        organization:organizations(id, name, slug, type),
        profile:profiles(id, name, email, avatar_url, role)
      `)
      .eq("id", id)
      .single()

    if (error || !member) {
      return NextResponse.json({ error: "Membro não encontrado" }, { status: 404, headers: corsHeaders() })
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
    }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Org Member] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
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
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403, headers: corsHeaders() })
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
        profile:profiles(id, name, email, avatar_url)
      `)
      .single()

    if (updateError) {
      console.error("[Org Member] Update error:", updateError)
      return NextResponse.json({ error: "Erro ao atualizar membro" }, { status: 500, headers: corsHeaders() })
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

    return NextResponse.json({ member, message: "Membro atualizado com sucesso" }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Org Member] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
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
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403, headers: corsHeaders() })
    }

    const adminClient = createAdminClient()

    // Get member info before deletion
    const { data: member } = await supabase
      .from("org_members")
      .select("*, profile:profiles(name)")
      .eq("id", id)
      .single()

    // Soft delete by deactivating
    const { error: deleteError } = await adminClient
      .from("org_members")
      .update({ is_active: false })
      .eq("id", id)

    if (deleteError) {
      console.error("[Org Member] Delete error:", deleteError)
      return NextResponse.json({ error: "Erro ao remover membro" }, { status: 500, headers: corsHeaders() })
    }

    // Log activity
    await supabase.from("activities").insert({
      user_id: user.id,
      type: "client_updated",
      description: `Membro "${member?.profile?.name}" foi desativado`,
      metadata: { member_id: id },
    })

    return NextResponse.json({ success: true, message: "Membro removido com sucesso" }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Org Member] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
