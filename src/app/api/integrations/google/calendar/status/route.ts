import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getConnectionStatus } from "@/lib/services/google-auth.service"
import { errorResponse } from "@/lib/api/errors"

/**
 * GET /api/integrations/google/calendar/status
 *
 * Returns the current user's Google Calendar connection status.
 * Response: { connected, google_email, is_active, last_synced_at, sync_error }
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

    const status = await getConnectionStatus(user.id, "profile")
    return NextResponse.json(status)
  } catch (error) {
    return errorResponse(request, error, "GoogleCalendarStatus")
  }
}
