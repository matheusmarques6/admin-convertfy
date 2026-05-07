/**
 * POST /api/crm/inbox/threads/[id]/messages
 *
 * Envia uma mensagem via o channel da thread. Cria registro local
 * com status=queued e atualiza pra sent/failed apos resposta da API
 * do provedor.
 *
 * Body:
 *   { type: "text" | "image" | "document" | "template", body?: string, ... }
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { sendWhatsAppMessage } from "@/lib/services/whatsapp-cloud.service"

const log = logger.child("CrmInboxSend")

export const dynamic = "force-dynamic"

const sendSchema = z.object({
  type: z.enum(["text", "image", "document", "template"]).default("text"),
  body: z.string().min(1).max(4000).optional(),
  image_url: z.string().url().optional(),
  document_url: z.string().url().optional(),
  document_filename: z.string().optional(),
  template_name: z.string().optional(),
  template_language: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: threadId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = sendSchema.parse(body)

    if (parsed.type === "text" && !parsed.body) {
      throw new AppError("body obrigatorio para mensagens text", 400, "validation")
    }

    // Le thread + channel
    type ChannelRow = {
      id: string
      type: string
      config: Record<string, unknown> | null
      external_id: string | null
    }
    type ThreadRow = {
      id: string
      org_id: string
      contact_external_id: string
      channel: ChannelRow | ChannelRow[] | null
    }

    const { data: thread } = await admin
      .from("crm_threads")
      .select("id, org_id, contact_external_id, channel:crm_channels (id, type, config, external_id)")
      .eq("id", threadId)
      .single<ThreadRow>()

    if (!thread) {
      throw new AppError("Thread nao encontrada", 404, "not-found")
    }

    const channel: ChannelRow | null = Array.isArray(thread.channel)
      ? (thread.channel[0] ?? null)
      : thread.channel
    if (!channel || channel.type !== "whatsapp") {
      throw new AppError(
        "Apenas channels WhatsApp sao suportados nesta versao",
        400,
        "channel-unsupported",
      )
    }

    // Cria mensagem local primeiro (status=queued)
    const { data: localMsg, error: createErr } = await admin
      .from("crm_messages")
      .insert({
        thread_id: threadId,
        org_id: thread.org_id,
        direction: "outbound",
        content_type: parsed.type === "text" ? "text" : parsed.type,
        body: parsed.body || null,
        media_url: parsed.image_url || parsed.document_url || null,
        sent_by: user.id,
        sent_by_kind: "agent",
        status: "queued",
      })
      .select("id")
      .single()

    if (createErr || !localMsg) throw createErr || new Error("Falha ao criar mensagem")

    // Envia via WhatsApp Cloud API
    const config = (channel.config as Record<string, string | undefined>) || {}
    const result = await sendWhatsAppMessage(
      {
        phone_number_id: channel.external_id || config.phone_number_id || "",
        access_token: config.access_token || "",
        business_account_id: config.business_account_id,
      },
      parsed.type === "text"
        ? { to: thread.contact_external_id, type: "text", text: { body: parsed.body! } }
        : parsed.type === "image"
          ? { to: thread.contact_external_id, type: "image", image: { link: parsed.image_url!, caption: parsed.body } }
          : parsed.type === "document"
            ? { to: thread.contact_external_id, type: "document", document: { link: parsed.document_url!, filename: parsed.document_filename, caption: parsed.body } }
            : {
                to: thread.contact_external_id,
                type: "template",
                template: {
                  name: parsed.template_name!,
                  language: { code: parsed.template_language || "pt_BR" },
                },
              },
    )

    if (result.success) {
      await admin
        .from("crm_messages")
        .update({
          external_id: result.message_id,
          status: "sent",
          status_updated_at: new Date().toISOString(),
        })
        .eq("id", localMsg.id)
    } else {
      await admin
        .from("crm_messages")
        .update({
          status: "failed",
          error_code: result.error?.code,
          error_message: result.error?.message,
        })
        .eq("id", localMsg.id)
      log.error("[Inbox] WhatsApp send failed", result.error)
    }

    // Reseta unread (agente respondeu)
    await admin.from("crm_threads").update({ unread_count: 0 }).eq("id", threadId)

    return successResponse(request, {
      message_id: localMsg.id,
      sent: result.success,
      error: result.error,
    })
  } catch (error) {
    log.error("Inbox send error:", error)
    return errorResponse(request, error, "crm-inbox-send")
  }
}
