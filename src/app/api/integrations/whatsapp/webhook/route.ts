import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac, timingSafeEqual } from "crypto"
import { logger } from "@/lib/logger"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

const log = logger.child("WhatsAppWebhook")
import { WhatsAppService } from "@/lib/integrations/whatsapp"

// Create Supabase client lazily to avoid build-time errors
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Verify WhatsApp webhook signature (X-Hub-Signature-256)
 * Meta sends HMAC SHA-256 signature of the payload
 */
function verifyWebhookSignature(
  payload: string,
  signatureHeader: string | null
): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) {
    if (process.env.NODE_ENV === "development") {
      log.warn("WHATSAPP_APP_SECRET not configured — skipping verification in development mode")
      return true
    }
    log.error("WHATSAPP_APP_SECRET is not configured — rejecting webhook payload (server misconfiguration)")
    return false
  }

  if (!signatureHeader) {
    log.warn("Missing X-Hub-Signature-256 header")
    return false
  }

  const expectedSignature = signatureHeader.replace("sha256=", "")
  const computedSignature = createHmac("sha256", appSecret)
    .update(payload, "utf8")
    .digest("hex")

  try {
    const a = Buffer.from(expectedSignature, "hex")
    const b = Buffer.from(computedSignature, "hex")
    return a.byteLength === b.byteLength && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// GET - Webhook verification
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

  // Use timing-safe comparison for token verification
  if (mode === "subscribe" && token && verifyToken) {
    try {
      const a = Buffer.from(token)
      const b = Buffer.from(verifyToken)
      if (a.byteLength === b.byteLength && timingSafeEqual(a, b)) {
        log.debug("WhatsApp webhook verified")
        return new NextResponse(challenge, { status: 200 })
      }
    } catch {
      // Fall through to 403
    }
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 })
}

// POST - Receive messages and status updates
export async function POST(request: NextRequest) {
  // Rate limiting
  const limited = await checkRateLimit(request, "webhook:whatsapp", RATE_LIMITS.webhook)
  if (limited) return limited

  try {
    // Read raw body for signature verification
    const rawBody = await request.text()

    // Verify HMAC signature from Meta
    const signature = request.headers.get("X-Hub-Signature-256")
    if (!verifyWebhookSignature(rawBody, signature)) {
      log.warn("Invalid WhatsApp webhook signature")
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const body = JSON.parse(rawBody)

    // Verify it's a WhatsApp message
    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ error: "Invalid object type" }, { status: 400 })
    }

    const { messages, statuses } = WhatsAppService.parseWebhook(body)

    // Process incoming messages
    for (const message of messages) {
      await handleIncomingMessage(message)
    }

    // Process status updates
    for (const status of statuses) {
      await handleStatusUpdate(status)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    log.error("Error processing WhatsApp webhook:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

async function handleIncomingMessage(message: {
  from: string
  id: string
  timestamp: string
  type: string
  text?: string
}) {
  log.debug("Incoming WhatsApp message:", message)

  const supabase = getSupabaseAdmin()

  // Try to find client by phone number
  const phoneNumber = message.from.replace(/^55/, "") // Remove Brazil code
  const phoneVariants = [
    phoneNumber,
    `+55${phoneNumber}`,
    `55${phoneNumber}`,
    phoneNumber.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3"),
  ]

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, phone")
    .or(phoneVariants.map((p) => `phone.ilike.%${p}%`).join(","))
    .limit(1)
    .single()

  if (client) {
    // Log activity for known client
    await supabase.from("activities").insert({
      client_id: client.id,
      type: "whatsapp_received" as never,
      description: `Mensagem recebida via WhatsApp${message.text ? `: "${message.text.substring(0, 100)}..."` : ""}`,
      metadata: {
        message_id: message.id,
        from: message.from,
        type: message.type,
        text: message.text,
        timestamp: message.timestamp,
      },
    })

    log.debug(`Message logged for client: ${client.name}`)
  } else {
    log.debug(`No client found for phone: ${message.from}`)
  }
}

async function handleStatusUpdate(status: {
  id: string
  recipientId: string
  status: "sent" | "delivered" | "read"
  timestamp: string
}) {
  log.debug("WhatsApp status update:", status)

  const supabase = getSupabaseAdmin()

  // Update message status in activities if we're tracking it
  const { data: activities } = await supabase
    .from("activities")
    .select("id, metadata")
    .eq("type", "whatsapp_sent")
    .contains("metadata", { message_id: status.id })
    .limit(1)

  if (activities && activities.length > 0) {
    const activity = activities[0]
    await supabase
      .from("activities")
      .update({
        metadata: {
          ...(activity.metadata as Record<string, unknown>),
          delivery_status: status.status,
          delivery_timestamp: status.timestamp,
        },
      })
      .eq("id", activity.id)
  }
}
