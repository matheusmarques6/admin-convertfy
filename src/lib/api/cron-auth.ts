import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"

/**
 * Validates cron endpoint authorization using CRON_SECRET.
 *
 * Returns null if authenticated, or a NextResponse error to return immediately.
 * Uses crypto.timingSafeEqual to prevent timing attacks on the Bearer token.
 *
 * @see src/lib/api/n8n-auth.ts — same pattern for webhook secrets
 */
export function requireCronAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error("CRON_SECRET not configured")
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }

  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const expected = `Bearer ${cronSecret}`
  const a = Buffer.from(authHeader)
  const b = Buffer.from(expected)

  if (a.byteLength !== b.byteLength || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null // authenticated OK
}
