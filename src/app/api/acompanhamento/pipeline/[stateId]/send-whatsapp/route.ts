import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { sendTextViaChannel } from "@/lib/services/whatsapp-channel-send.service"
import { logger } from "@/lib/logger"

const log = logger.child("AcompanhamentoSendWhatsApp")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

function sanitizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const d = raw.replace(/\D/g, "")
  if (d.length < 10 || d.length > 15) return null
  if (d.length === 10 || d.length === 11) return `55${d}`
  return d
}

/**
 * POST /api/acompanhamento/pipeline/[stateId]/send-whatsapp
 *
 * Envia a ai_message do state pelo WhatsApp do cliente via canal da org.
 * Quando sucesso:
 *  - Marca state como Etapa 4
 *  - Stamp feedback_sent_at + feedback_method='whatsapp'
 *  - Stamp feedback_sent_by = user atual
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stateId: string }> },
) {
  try {
    const { stateId } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const admin = createAdminClient()

    const { data: stateRaw } = await admin
      .from("weekly_pipeline_states")
      .select(
        "id, org_id, ai_message, current_stage, " +
          "store:client_stores(id, store_name, " +
          "client:clients!client_stores_client_id_fkey(id, name, phone))",
      )
      .eq("id", stateId)
      .maybeSingle()

    if (!stateRaw) throw new AppError("Estado não encontrado", 404)

    const state = stateRaw as unknown as {
      id: string
      org_id: string
      ai_message: string | null
      current_stage: number
      store: {
        id: string
        store_name: string
        client: { id: string; name: string | null; phone: string | null } | { id: string; name: string | null; phone: string | null }[] | null
      } | null
    }

    if (!state.ai_message?.trim()) {
      throw new AppError("Mensagem IA vazia. Gere ou edite antes de enviar.", 400)
    }

    const store = state.store
    const client = Array.isArray(store?.client) ? store?.client[0] : store?.client
    const phone = sanitizePhone(client?.phone)

    if (!phone) {
      throw new AppError(
        "Cliente sem WhatsApp cadastrado. Adicione o telefone em /admin/clients antes.",
        400,
      )
    }

    // Canal WhatsApp default da org (cloud oficial OU evolution via QR)
    const { data: channelRaw } = await admin
      .from("crm_channels")
      .select("provider, config, external_id")
      .eq("org_id", state.org_id)
      .eq("type", "whatsapp")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    const channel = channelRaw as unknown as {
      provider: string | null
      config: Record<string, unknown> | null
      external_id: string | null
    } | null

    if (!channel) {
      throw new AppError(
        "Canal WhatsApp não configurado. Configure em /admin/comercial/canais antes.",
        400,
      )
    }

    const result = await sendTextViaChannel(channel, phone, state.ai_message)

    if (result.error?.code === "config_missing") {
      throw new AppError(
        "Canal WhatsApp não configurado. Configure em /admin/comercial/canais antes.",
        400,
      )
    }

    if (!result.success) {
      log.error("[Acompanhamento] WhatsApp send failed", { stateId, error: result.error })
      throw new AppError(
        `Falha ao enviar WhatsApp: ${result.error?.message ?? "erro desconhecido"}`,
        500,
      )
    }

    // Marca como enviado
    await admin
      .from("weekly_pipeline_states")
      .update({
        current_stage: 4,
        feedback_sent_at: new Date().toISOString(),
        feedback_sent_by: user.id,
        feedback_method: "whatsapp",
      })
      .eq("id", stateId)

    log.info("[Acompanhamento] WhatsApp enviado com sucesso", {
      stateId,
      messageId: result.message_id,
      to: phone.slice(0, 6) + "****",
    })

    return successResponse(request, {
      sent: true,
      message_id: result.message_id,
      to: phone,
    })
  } catch (error) {
    return errorResponse(request, error, "AcompanhamentoSendWhatsApp")
  }
}
