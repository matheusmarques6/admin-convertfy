/**
 * POST /api/webhooks/n8n/briefing-generated
 *
 * Callback do n8n quando o workflow termina de gerar o briefing.
 * Validacao via N8N_WEBHOOK_SECRET (header x-secret).
 *
 * Body: { onboarding_id: string, briefing: BriefingContent }
 */

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

function validateSecret(req: NextRequest): boolean {
  const expected = process.env.N8N_WEBHOOK_SECRET
  if (!expected) return false
  const provided = req.headers.get("x-secret") ?? ""
  if (provided.length !== expected.length) return false
  return crypto.timingSafeEqual(
    Buffer.from(provided),
    Buffer.from(expected),
  )
}

export async function POST(request: NextRequest) {
  if (!validateSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    if (!body.onboarding_id || !body.briefing) {
      return NextResponse.json(
        { error: "onboarding_id e briefing obrigatorios" },
        { status: 400 },
      )
    }
    const admin = createAdminClient()
    const now = new Date().toISOString()
    await admin
      .from("onboardings")
      .update({
        briefing: { ...body.briefing, generated_at: now },
        briefing_status: "generated_pending_review",
        briefing_generated_at: now,
      })
      .eq("id", body.onboarding_id)

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}
