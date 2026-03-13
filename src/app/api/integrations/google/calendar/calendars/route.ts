import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidAccessToken, GoogleTokenRevokedError } from "@/lib/services/google-auth.service"
import { GoogleCalendarService } from "@/lib/integrations/google-calendar"
import { errorResponse } from "@/lib/api/errors"

/**
 * GET /api/integrations/google/calendar/calendars
 *
 * Returns the list of Google Calendars available for the authenticated user.
 * Filters to calendars where the user has write access (owner or writer).
 *
 * Response: { calendars: { id, summary, primary, accessRole }[] }
 * Error: { error: 'not_connected' } with status 401 if no valid token
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

    // Get valid access token (auto-refreshes if expired)
    let accessToken: string | null
    try {
      accessToken = await getValidAccessToken(user.id, "profile")
    } catch (err) {
      if (err instanceof GoogleTokenRevokedError) {
        return NextResponse.json({ error: "not_connected" }, { status: 401 })
      }
      throw err
    }

    if (!accessToken) {
      return NextResponse.json({ error: "not_connected" }, { status: 401 })
    }

    // Fetch calendar list from Google
    const calendarService = new GoogleCalendarService({ accessToken })
    const calendars = await calendarService.getCalendarList()

    // Filter to writable calendars only (owner or writer)
    const writableCalendars = calendars
      .filter((cal) => cal.accessRole === "owner" || cal.accessRole === "writer")
      .map((cal) => ({
        id: cal.id,
        summary: cal.summary,
        primary: cal.primary || false,
        accessRole: cal.accessRole,
      }))

    return NextResponse.json({ calendars: writableCalendars })
  } catch (error) {
    return errorResponse(request, error, "GoogleCalendarCalendars")
  }
}
