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

// GET - Get single meeting
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const { id } = await params
    const adminClient = createAdminClient()

    const { data: meeting, error } = await adminClient
      .from("meetings")
      .select(`
        *,
        client:clients(id, name, company),
        user:profiles!meetings_user_id_fkey(id, name, email, avatar_url),
        participants:meeting_participants(
          id,
          participant_id,
          participant_type,
          is_organizer,
          response_status,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        )
      `)
      .eq("id", id)
      .single()

    if (error || !meeting) {
      return NextResponse.json({ error: "Reunião não encontrada" }, { status: 404, headers: corsHeaders() })
    }

    // Transform data
    const transformedMeeting = {
      ...meeting,
      client: Array.isArray(meeting.client) ? meeting.client[0] : meeting.client,
      user: Array.isArray(meeting.user) ? meeting.user[0] : meeting.user,
      participants: (meeting.participants || []).map((p: Record<string, unknown>) => ({
        ...p,
        profile: Array.isArray(p.profile) ? p.profile[0] : p.profile,
      })),
    }

    return NextResponse.json({ meeting: transformedMeeting }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Meeting] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// PUT - Update meeting
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const { id } = await params
    const body = await request.json()

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}

    if (body.title !== undefined) updateData.title = body.title
    if (body.client_id !== undefined) updateData.client_id = body.client_id || null
    if (body.scheduled_at !== undefined) updateData.scheduled_at = body.scheduled_at
    if (body.duration_minutes !== undefined) updateData.duration_minutes = body.duration_minutes
    if (body.status !== undefined) updateData.status = body.status
    if (body.meeting_url !== undefined) updateData.meeting_url = body.meeting_url || null
    if (body.notes !== undefined) updateData.notes = body.notes || null

    const { error: updateError } = await adminClient
      .from("meetings")
      .update(updateData)
      .eq("id", id)

    if (updateError) {
      console.error("[Meeting] Update error:", updateError)
      return NextResponse.json({ error: "Erro ao atualizar reunião" }, { status: 500, headers: corsHeaders() })
    }

    // Update participants if provided
    if (body.participants !== undefined) {
      // Get existing participants
      const { data: existingParticipants } = await adminClient
        .from("meeting_participants")
        .select("*")
        .eq("meeting_id", id)

      const existing = existingParticipants || []
      const newParticipants: Array<{ id: string; type: string }> = body.participants || []

      // Find organizer (keep them)
      const organizer = existing.find(p => p.is_organizer)

      // Remove non-organizer participants that are not in the new list
      const toRemove = existing.filter(p =>
        !p.is_organizer &&
        !newParticipants.some(np => np.id === p.participant_id && (np.type || "profile") === p.participant_type)
      )

      if (toRemove.length > 0) {
        await adminClient
          .from("meeting_participants")
          .delete()
          .in("id", toRemove.map(p => p.id))
      }

      // Add new participants that don't exist yet
      const toAdd = newParticipants.filter(np =>
        np.id !== organizer?.participant_id && // Don't add if it's the organizer
        !existing.some(ep => ep.participant_id === np.id && ep.participant_type === (np.type || "profile"))
      )

      if (toAdd.length > 0) {
        const participantInserts = toAdd.map((p) => ({
          meeting_id: id,
          participant_id: p.id,
          participant_type: p.type || "profile",
          is_organizer: false,
          response_status: "pending",
        }))

        const { error: addError } = await adminClient
          .from("meeting_participants")
          .insert(participantInserts)

        if (addError) {
          console.error("[Meeting] Error adding participants:", addError)
        }
      }
    }

    // Fetch updated meeting with participants
    const { data: meeting } = await adminClient
      .from("meetings")
      .select(`
        *,
        client:clients(id, name, company),
        user:profiles!meetings_user_id_fkey(id, name, email, avatar_url),
        participants:meeting_participants(
          id,
          participant_id,
          participant_type,
          is_organizer,
          response_status,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        )
      `)
      .eq("id", id)
      .single()

    if (!meeting) {
      return NextResponse.json({ error: "Reunião não encontrada" }, { status: 404, headers: corsHeaders() })
    }

    // Transform data
    const transformedMeeting = {
      ...meeting,
      client: Array.isArray(meeting.client) ? meeting.client[0] : meeting.client,
      user: Array.isArray(meeting.user) ? meeting.user[0] : meeting.user,
      participants: (meeting.participants || []).map((p: Record<string, unknown>) => ({
        ...p,
        profile: Array.isArray(p.profile) ? p.profile[0] : p.profile,
      })),
    }

    return NextResponse.json(
      { meeting: transformedMeeting, message: "Reunião atualizada com sucesso" },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Meeting] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// DELETE - Delete meeting
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const { id } = await params
    const adminClient = createAdminClient()

    const { error: deleteError } = await adminClient
      .from("meetings")
      .delete()
      .eq("id", id)

    if (deleteError) {
      console.error("[Meeting] Delete error:", deleteError)
      return NextResponse.json({ error: "Erro ao excluir reunião" }, { status: 500, headers: corsHeaders() })
    }

    return NextResponse.json({ message: "Reunião excluída com sucesso" }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Meeting] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
