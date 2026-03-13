import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { syncRsvpFromGoogle } from "@/lib/services/google-calendar-sync.service"
import { errorResponse } from "@/lib/api/errors"

/**
 * POST /api/integrations/google/calendar/sync
 *
 * Manually triggers RSVP sync from Google Calendar for the authenticated user.
 * Fetches all scheduled meetings with google_event_id, queries Google for
 * attendee RSVP status, and updates meeting_participants.google_rsvp_status.
 *
 * AC 42.11.2
 *
 * Response: { synced_count, errors_count, details: [...] }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const report = await syncRsvpFromGoogle(user.id)

    return NextResponse.json(report)
  } catch (error) {
    return errorResponse(request, error, "GoogleCalendarSync")
  }
}
