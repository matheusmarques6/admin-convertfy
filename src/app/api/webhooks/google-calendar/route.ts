import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { importMeetingsFromGoogle } from "@/lib/services/google-calendar-sync.service"
import { logger } from "@/lib/logger"

const log = logger.child("GoogleCalendarWebhook")

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Webhook de push notifications da Google Calendar API.
 *
 * O Google faz POST aqui a cada mudanca na agenda central (watch registrado
 * em startCalendarWatch). Identificamos a org pelo X-Goog-Channel-ID, validamos
 * o token, e rodamos o import na hora (Google -> admin em tempo real).
 *
 * Deve responder 2xx rapido; o Google reenvia em caso de erro.
 */
export async function POST(request: NextRequest) {
  const channelId = request.headers.get("x-goog-channel-id")
  const resourceState = request.headers.get("x-goog-resource-state")
  const channelToken = request.headers.get("x-goog-channel-token")

  // Handshake inicial do watch — nao ha mudanca a processar
  if (!channelId || resourceState === "sync") {
    return NextResponse.json({ ok: true })
  }

  try {
    const adminClient = createAdminClient()
    const { data: row } = await adminClient
      .from("user_google_tokens")
      .select("user_id, calendar_channel_token")
      .eq("user_type", "org")
      .eq("calendar_channel_id", channelId)
      .maybeSingle()

    // Canal desconhecido (ex.: token rotacionado) — responde 200 pra parar retries
    if (!row) {
      log.warn("Push para canal desconhecido", { channelId })
      return NextResponse.json({ ok: true })
    }

    // Valida o token secreto ecoado pelo Google
    if (row.calendar_channel_token && channelToken !== row.calendar_channel_token) {
      log.warn("Token de canal invalido", { channelId })
      return NextResponse.json({ error: "invalid token" }, { status: 401 })
    }

    // Import na hora (org_id = user_id na linha org)
    const res = await importMeetingsFromGoogle(row.user_id)
    log.info("Import via push", { orgId: row.user_id, ...res })

    return NextResponse.json({ ok: true, ...res })
  } catch (err) {
    log.error("Falha no webhook do Google Calendar", {
      error: err instanceof Error ? err.message : String(err),
    })
    // 200 mesmo em erro interno evita retempestade de retries do Google;
    // o cron horario reconcilia o que faltar.
    return NextResponse.json({ ok: false })
  }
}
