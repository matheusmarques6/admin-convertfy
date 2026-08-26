/**
 * POST /api/webhooks/vault-sync — push do repo do vault (GitHub webhook).
 *
 * Valida HMAC SHA-256 (X-Hub-Signature-256, secret VAULT_WEBHOOK_SECRET —
 * mesmo padrão do webhook do WhatsApp) e dispara o sync. Push em branch
 * diferente do configurado responde 200 no-op (o GitHub manda tudo).
 */

import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { syncVault } from "@/lib/vault/vault-sync.service"
import { logger } from "@/lib/logger"

const log = logger.child("VaultSyncWebhook")

export const dynamic = "force-dynamic"
export const maxDuration = 300

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.VAULT_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.byteLength === b.byteLength && crypto.timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 })
  }

  // ping do GitHub na criação do webhook
  if (request.headers.get("x-github-event") === "ping") {
    return NextResponse.json({ pong: true })
  }

  let ref = ""
  try {
    ref = (JSON.parse(rawBody) as { ref?: string }).ref ?? ""
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 })
  }
  const branch = process.env.VAULT_BRANCH?.trim() || "main"
  if (ref && ref !== `refs/heads/${branch}`) {
    return NextResponse.json({ skipped: true, reason: `push em ${ref}, sync segue ${branch}` })
  }

  const result = await syncVault({ trigger: "webhook" })
  log.info("webhook.synced", { status: result.status, sha: result.commitSha?.slice(0, 8) })
  return NextResponse.json(result)
}
