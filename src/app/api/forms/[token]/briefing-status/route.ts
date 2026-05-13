import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const admin = createAdminClient()
    const { data: onb } = await admin
      .from("onboardings")
      .select("id, briefing_status, briefing, briefing_confirmed_by_client")
      .eq("form_token", token)
      .maybeSingle()
    if (!onb)
      return NextResponse.json({ error: "Token inválido" }, { status: 404 })
    return NextResponse.json({
      success: true,
      status: onb.briefing_status,
      briefing: onb.briefing,
      confirmed: onb.briefing_confirmed_by_client,
    })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}
