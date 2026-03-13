import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { disconnectGoogle } from "@/lib/services/google-auth.service"
import { errorResponse } from "@/lib/api/errors"

/**
 * POST /api/integrations/google/calendar/disconnect
 *
 * Disconnects the current user's Google Calendar integration.
 * Revokes the token at Google (best effort) and deletes the record.
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

    await disconnectGoogle(user.id, "profile")
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(request, error, "GoogleCalendarDisconnect")
  }
}
