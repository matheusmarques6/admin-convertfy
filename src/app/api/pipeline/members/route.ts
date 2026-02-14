import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// POST /api/pipeline/members - Add a member to a pipeline
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const { pipeline_id, user_id, role } = body

    if (!pipeline_id || !user_id || !role) {
      return NextResponse.json(
        { error: "pipeline_id, user_id e role são obrigatórios" },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // Insert member
    const { data, error } = await adminClient
      .from("pipeline_members")
      .insert({
        pipeline_id,
        user_id,
        role,
        added_by: user.id,
      })
      .select(`
        *,
        user:profiles!pipeline_members_user_id_fkey (id, name, email, avatar_url, role)
      `)
      .single()

    if (error) {
      console.error("Error adding pipeline member:", error)
      return NextResponse.json(
        { error: `Erro ao adicionar membro: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Pipeline member error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}

// PATCH /api/pipeline/members - Update member role
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const { member_id, role } = body

    if (!member_id || !role) {
      return NextResponse.json(
        { error: "member_id e role são obrigatórios" },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    const { error } = await adminClient
      .from("pipeline_members")
      .update({ role })
      .eq("id", member_id)

    if (error) {
      console.error("Error updating member role:", error)
      return NextResponse.json(
        { error: `Erro ao atualizar role: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Pipeline member update error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}

// DELETE /api/pipeline/members - Remove member
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const memberId = searchParams.get("id")

    if (!memberId) {
      return NextResponse.json(
        { error: "ID do membro é obrigatório" },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    const { error } = await adminClient
      .from("pipeline_members")
      .delete()
      .eq("id", memberId)

    if (error) {
      console.error("Error removing member:", error)
      return NextResponse.json(
        { error: `Erro ao remover membro: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Pipeline member delete error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}
