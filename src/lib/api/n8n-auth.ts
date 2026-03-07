import crypto from "crypto"
import { NextRequest } from "next/server"
import { AppError } from "@/lib/api/errors"

/**
 * Validates a shared secret from request headers using timing-safe comparison.
 * Used for machine-to-machine auth with N8N webhooks.
 */
export function requireWebhookSecret(
  request: NextRequest,
  envVar = "N8N_WEBHOOK_SECRET",
  headerName = "x-webhook-secret",
): void {
  const secret = request.headers.get(headerName)
  const expected = process.env[envVar]
  if (!expected) throw new AppError("Webhook secret not configured", 500)
  if (!secret) throw new AppError("Missing webhook secret", 401)
  const a = Buffer.from(secret)
  const b = Buffer.from(expected)
  if (a.byteLength !== b.byteLength || !crypto.timingSafeEqual(a, b)) {
    throw new AppError("Unauthorized", 401)
  }
}
