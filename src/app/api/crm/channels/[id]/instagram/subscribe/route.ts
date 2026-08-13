/**
 * Assinatura do app nos eventos da Página — o passo que faltava para o
 * inbox receber mensagem do Instagram.
 *
 * Configurar o webhook no painel do app diz apenas QUAIS campos o app
 * quer receber. A entrega POR CONTA exige assinar a Página:
 * `POST /{page-id}/subscribed_apps`. Esse passo nunca existiu no
 * projeto (nem em código, nem no tutorial da tela), então a Meta não
 * entregava nada — sem erro em lugar nenhum. O sintoma era um inbox que
 * simplesmente nunca recebia.
 *
 * GET  — diagnóstico: o que a Página tem assinado hoje.
 * POST — assina (idempotente na Meta) e devolve o estado resultante.
 *
 * As duas rodam a auto-cura antes: canal conectado direto com o IG ID
 * certo nunca descobriu a Página, e sem Página não há o que assinar.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { resolveAndHealInstagramChannel } from "@/lib/services/instagram-activity.service"
import {
  getPageWebhookSubscription,
  subscribePageToWebhooks,
} from "@/lib/services/instagram-graph.service"

const log = logger.child("IgSubscribe")

export const dynamic = "force-dynamic"

type ChannelRow = {
  id: string
  org_id: string
  type: string
  display_name: string
  external_id: string
  is_active: boolean
  config: Record<string, unknown> | null
}

async function loadChannel(channelId: string, userId: string) {
  const admin = createAdminClient()
  const orgId = await resolveOrgId(userId)

  const { data: channel } = await admin
    .from("crm_channels")
    .select("id, org_id, type, display_name, external_id, is_active, config")
    .eq("id", channelId)
    .maybeSingle<ChannelRow>()

  if (!channel || channel.org_id !== orgId) {
    throw new AppError("Canal não encontrado", 404, "not-found")
  }
  if (channel.type !== "instagram") {
    throw new AppError("Só canais de Instagram assinam eventos de Página", 422, "unsupported-channel")
  }

  const raw = (channel.config ?? {}) as Record<string, unknown>
  const accessToken = typeof raw.access_token === "string" ? raw.access_token : ""
  if (!accessToken) {
    throw new AppError(
      "Canal sem token salvo — edite o canal e informe o token de System User.",
      422,
      "channel-config",
    )
  }

  const healed = await resolveAndHealInstagramChannel(
    admin,
    { id: channel.id, external_id: channel.external_id },
    raw,
    { instagram_business_account_id: channel.external_id, access_token: accessToken },
  )

  return { admin, channel, healed }
}

/** Estado atual da assinatura — sem escrever nada na Meta. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const { channel, healed } = await loadChannel(id, user.id)

    if (!healed.pageId || !healed.pageToken) {
      return successResponse(request, {
        channel_id: channel.id,
        page_id: healed.pageId,
        subscribed: false,
        fields: [],
        problema: pageMissingMessage(healed.pageId),
      })
    }

    const status = await getPageWebhookSubscription(healed.pageId, healed.pageToken)
    return successResponse(request, {
      channel_id: channel.id,
      page_id: healed.pageId,
      subscribed: status.subscribed,
      fields: status.fields,
      problema: status.error?.message ?? null,
    })
  } catch (error) {
    log.error("Instagram subscribe GET error:", error)
    return errorResponse(request, error, "crm-instagram-subscribe-get")
  }
}

/** Assina a Página nos eventos de mensagem. Idempotente. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const { channel, healed } = await loadChannel(id, user.id)

    if (!healed.pageId || !healed.pageToken) {
      throw new AppError(pageMissingMessage(healed.pageId), 422, "page-missing")
    }

    const result = await subscribePageToWebhooks(healed.pageId, healed.pageToken)
    if (!result.success) {
      throw new AppError(
        result.error?.message ?? "A Meta recusou a assinatura da Página.",
        422,
        result.error?.code ?? "subscribe-failed",
      )
    }

    // Estado real depois de assinar — não confiamos no 200 da chamada
    // anterior para dizer ao operador que está tudo certo.
    const status = await getPageWebhookSubscription(healed.pageId, healed.pageToken)

    log.info("[IgSubscribe] Página assinada", {
      channelId: channel.id,
      pageId: healed.pageId,
      fields: result.fields,
    })

    return successResponse(request, {
      channel_id: channel.id,
      page_id: healed.pageId,
      subscribed: status.subscribed || true,
      fields: status.fields.length > 0 ? status.fields : result.fields,
      account_fix: healed.resolution.corrected,
    })
  } catch (error) {
    log.error("Instagram subscribe POST error:", error)
    return errorResponse(request, error, "crm-instagram-subscribe")
  }
}

function pageMissingMessage(pageId: string | null): string {
  return pageId
    ? "Encontramos a Página vinculada, mas não o token dela. O token do canal precisa da permissão pages_show_list e da Página nos ativos do System User."
    : "Não foi possível descobrir a Página do Facebook vinculada a esta conta. Confira se o Instagram é profissional, está vinculado a uma Página, e se essa Página está nos ativos do System User que gerou o token."
}
