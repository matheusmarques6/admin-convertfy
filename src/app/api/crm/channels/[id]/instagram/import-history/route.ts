/**
 * POST /api/crm/channels/[id]/instagram/import-history — puxa as
 * conversas recentes da Conversations API e materializa no inbox.
 *
 * Mesmo formato do webhook (thread por channel_id+contact_external_id,
 * mensagem idempotente por thread_id+external_id), então conversa que
 * já existe só ganha as mensagens que faltam. Mensagens entram com
 * `is_historical` + created_at retroativo (padrão da importação do
 * WhatsApp): não contam como não-lidas e o trigger GREATEST impede que
 * conversa antiga suba no inbox.
 *
 * Threads NOVAS nascem `resolved` — importação não é atendimento
 * pendente; se o contato mandar DM nova, o webhook reabre.
 *
 * A Conversations API entrega só a janela recente da Meta (~20
 * conversas, últimas mensagens). É "puxar o histórico recente", não
 * migração completa — o resumo da resposta deixa isso claro.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import {
  fetchInstagramConversations,
  resolveAndHealInstagramChannel,
} from "@/lib/services/instagram-activity.service"
import type { InstagramChannelConfig } from "@/lib/services/instagram-graph.service"

const log = logger.child("IgImportHistory")

export const dynamic = "force-dynamic"
export const maxDuration = 120

const bodySchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  messages_per_conversation: z.number().int().min(1).max(100).default(25),
})

type Admin = ReturnType<typeof createAdminClient>

type ChannelRow = {
  id: string
  org_id: string
  type: string
  display_name: string
  external_id: string
  config: Record<string, unknown> | null
}

async function resolveThread(
  admin: Admin,
  args: {
    orgId: string
    channelId: string
    contactExternalId: string
    contactName: string | null
    lastMessageAt: string | null
  },
): Promise<{ id: string; created: boolean } | null> {
  const { data: existing } = await admin
    .from("crm_threads")
    .select("id, contact_name")
    .eq("channel_id", args.channelId)
    .eq("contact_external_id", args.contactExternalId)
    .maybeSingle<{ id: string; contact_name: string | null }>()

  if (existing) {
    // Webhook de DM não traz username — a importação é a chance de
    // nomear a conversa que estava só com o ID numérico.
    if (args.contactName && !existing.contact_name) {
      await admin.from("crm_threads").update({ contact_name: args.contactName }).eq("id", existing.id)
    }
    return { id: existing.id, created: false }
  }

  const { data: created, error } = await admin
    .from("crm_threads")
    .insert({
      org_id: args.orgId,
      channel_id: args.channelId,
      contact_external_id: args.contactExternalId,
      contact_name: args.contactName,
      status: "resolved",
      last_message_at: args.lastMessageAt ?? new Date().toISOString(),
    })
    .select("id")
    .single()

  if (error || !created) {
    log.error("[IgImport] erro ao criar thread", { error: error?.message })
    return null
  }
  return { id: created.id, created: true }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const raw = await request.json().catch(() => ({}))
    const body = bodySchema.parse(raw)

    const { data: channel } = await admin
      .from("crm_channels")
      .select("id, org_id, type, display_name, external_id, config")
      .eq("id", channelId)
      .maybeSingle<ChannelRow>()

    if (!channel || channel.org_id !== orgId) {
      throw new AppError("Canal não encontrado", 404, "not-found")
    }
    if (channel.type !== "instagram") {
      throw new AppError("Importação de conversas só existe para canais Instagram", 422, "unsupported-channel")
    }

    const rawConfig = channel.config ?? {}
    const storedIg: InstagramChannelConfig = {
      instagram_business_account_id:
        (typeof rawConfig.instagram_business_account_id === "string"
          ? rawConfig.instagram_business_account_id
          : null) || channel.external_id,
      access_token: typeof rawConfig.access_token === "string" ? rawConfig.access_token : "",
    }

    // Mesmo diagnóstico/auto-cura do painel: ID de Página vira o IG ID
    // vinculado antes de qualquer chamada (senão tudo cai em #100).
    const healed = await resolveAndHealInstagramChannel(admin, channel, rawConfig, storedIg)
    const config = healed.config
    const accountId = config.instagram_business_account_id

    const convRes = await fetchInstagramConversations(config, {
      limit: body.limit,
      messagesPerConversation: body.messages_per_conversation,
      pageId: healed.pageId,
    })
    if (!convRes.ok) {
      // A mensagem do diagnóstico (ID de Página sem IG, token sem
      // permissão) é mais acionável que o erro cru da edge.
      throw new AppError(
        healed.resolution.error?.message ?? convRes.error.message,
        502,
        "graph-api-error",
      )
    }

    let threadsCreated = 0
    let threadsMatched = 0
    let messagesImported = 0
    let messagesSkipped = 0
    let conversationsSkipped = 0
    // A coluna is_historical vem da migration 20261065 — sem ela, o
    // retry grava sem a flag (mensagem antiga contaria como não-lida,
    // mas a importação não morre).
    let historicalColumnMissing = false

    for (const conv of convRes.data) {
      const contact = conv.participants.find((p) => p.id && p.id !== accountId && p.id !== channel.external_id)
      if (!contact || conv.messages.length === 0) {
        conversationsSkipped++
        continue
      }

      const newestTime = conv.messages.reduce<string | null>(
        (acc, m) => (m.created_time && (!acc || m.created_time > acc) ? m.created_time : acc),
        conv.updated_time,
      )

      const thread = await resolveThread(admin, {
        orgId,
        channelId,
        contactExternalId: contact.id,
        contactName: contact.username,
        lastMessageAt: newestTime,
      })
      if (!thread) {
        conversationsSkipped++
        continue
      }
      if (thread.created) threadsCreated++
      else threadsMatched++

      const rows = conv.messages
        .filter((m) => m.id)
        .map((m) => {
          const outbound = m.from_id === accountId || m.from_id === channel.external_id
          return {
            thread_id: thread.id,
            org_id: orgId,
            external_id: m.id,
            direction: outbound ? "outbound" : "inbound",
            content_type: "text",
            body: m.message?.trim() ? m.message : "[anexo]",
            metadata: {
              source: "ig_history_import",
              conversation_id: conv.id,
              from_id: m.from_id,
              from_username: m.from_username,
            },
            sent_by_kind: outbound ? "system" : "contact",
            status: outbound ? "sent" : "received",
            ...(historicalColumnMissing
              ? {}
              : { is_historical: true }),
            ...(m.created_time ? { created_at: m.created_time } : {}),
          }
        })
      if (rows.length === 0) continue

      let { data: inserted, error } = await admin
        .from("crm_messages")
        .upsert(rows, { onConflict: "thread_id,external_id", ignoreDuplicates: true })
        .select("id")

      if (error && !historicalColumnMissing && /is_historical|42703/i.test(`${error.code} ${error.message}`)) {
        historicalColumnMissing = true
        const stripped = rows.map(({ is_historical: _omit, ...rest }) => rest)
        const retry = await admin
          .from("crm_messages")
          .upsert(stripped, { onConflict: "thread_id,external_id", ignoreDuplicates: true })
          .select("id")
        inserted = retry.data
        error = retry.error
      }

      if (error) {
        log.error("[IgImport] erro ao gravar mensagens", { threadId: thread.id, error: error.message })
        continue
      }
      const count = inserted?.length ?? 0
      messagesImported += count
      messagesSkipped += rows.length - count
    }

    log.info("[IgImport] concluído", {
      channelId,
      conversations: convRes.data.length,
      threadsCreated,
      messagesImported,
      by: user.id,
    })

    return successResponse(request, {
      conversations: convRes.data.length,
      conversations_skipped: conversationsSkipped,
      threads_created: threadsCreated,
      threads_matched: threadsMatched,
      messages_imported: messagesImported,
      messages_skipped: messagesSkipped,
      historical_flag_available: !historicalColumnMissing,
      note: "A API oficial entrega só a janela recente de conversas — importações repetidas só acrescentam o que faltar.",
    })
  } catch (error) {
    log.error("instagram import-history error:", error)
    return errorResponse(request, error, "crm-instagram-import-history")
  }
}
