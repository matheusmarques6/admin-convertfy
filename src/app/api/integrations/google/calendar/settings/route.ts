import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse } from "@/lib/api/errors"

/**
 * GET /api/integrations/google/calendar/settings
 *
 * Returns the current calendar settings for the authenticated user.
 * Response: { selected_calendar_id, auto_meet }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminClient = createAdminClient()
    const { data: record, error } = await adminClient
      .from("user_google_tokens")
      .select("selected_calendar_id, auto_meet")
      .eq("user_type", "profile")
      .eq("user_id", user.id)
      .single()

    if (error || !record) {
      return NextResponse.json(
        { selected_calendar_id: "primary", auto_meet: true }
      )
    }

    return NextResponse.json({
      selected_calendar_id: record.selected_calendar_id || "primary",
      auto_meet: record.auto_meet ?? true,
    })
  } catch (error) {
    return errorResponse(request, error, "GoogleCalendarSettingsGet")
  }
}

/**
 * PATCH /api/integrations/google/calendar/settings
 *
 * Updates calendar settings for the authenticated user.
 * Body: { selected_calendar_id?: string, auto_meet?: boolean }
 * Response: { selected_calendar_id, auto_meet }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const updateFields: Record<string, unknown> = {}

    if (typeof body.selected_calendar_id === "string" && body.selected_calendar_id.length > 0) {
      updateFields.selected_calendar_id = body.selected_calendar_id
    }

    if (typeof body.auto_meet === "boolean") {
      updateFields.auto_meet = body.auto_meet
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()
    const { data: updated, error } = await adminClient
      .from("user_google_tokens")
      .update(updateFields)
      .eq("user_type", "profile")
      .eq("user_id", user.id)
      .select("selected_calendar_id, auto_meet")
      .single()

    if (error) {
      return NextResponse.json(
        { error: `Failed to update settings: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      selected_calendar_id: updated.selected_calendar_id || "primary",
      auto_meet: updated.auto_meet ?? true,
    })
  } catch (error) {
    return errorResponse(request, error, "GoogleCalendarSettingsPatch")
  }
}
