import { NextRequest, NextResponse } from "next/server"
import { confirmBriefing } from "@/lib/services/onboarding-pipeline.service"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const body = await request.json()
    if (!body.briefing) {
      return NextResponse.json(
        { error: "briefing obrigatorio" },
        { status: 400 },
      )
    }
    const result = await confirmBriefing(token, body.briefing)
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Falha" },
        { status: 400 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}
