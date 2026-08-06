/**
 * POST /api/crm/forms/[id]/conversion-events/test
 *
 * Dispara um evento de verdade para a Meta, com dados fictícios, e
 * devolve a resposta CRUA dela. É o teste ponta a ponta que faltava:
 * confirma em segundos se o pixel e o token deste formulário conseguem
 * publicar o evento — sem esperar um cadastro real acontecer.
 *
 * Duas decisões que importam:
 *
 * 1. Os dados são FICTÍCIOS (`teste-integracao@convertfy.me`), nunca de
 *    um cliente. O objetivo é validar a conexão, não empurrar alguém
 *    para um público.
 * 2. O evento NÃO entra em `crm_conversion_events`. A fila é o registro
 *    dos cadastros reais, e um teste ali contaminaria os contadores do
 *    diagnóstico logo acima na tela.
 *
 * Se o formulário tem código de teste configurado, ele é usado: o
 * evento aparece só na aba "Testar eventos" da Meta e não entra nos
 * relatórios. Sem o código, o evento é real — a resposta diz isso com
 * todas as letras para quem clicou.
 */

import { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { decrypt } from "@/lib/crypto"
import { normalizeTrackingConfig } from "@/types/form-tracking"
import { metaEventName } from "@/lib/tracking/meta-event-name"
import {
  buildMetaServerEvent,
  buildMetaUserData,
  sendMetaConversionEvent,
} from "@/lib/integrations/meta-capi"

const log = logger.child("ConversionTestEvent")

export const dynamic = "force-dynamic"
export const maxDuration = 60

const bodySchema = z.object({
  /** "qualified" (padrão) ou "lead". */
  event: z.enum(["qualified", "lead"]).default("qualified"),
})

/** Contato fictício — nunca usar dados de cliente num teste. */
const TEST_LEAD = {
  email: "teste-integracao@convertfy.me",
  phone: "5541999999999",
  firstName: "Teste",
  lastName: "Integracao",
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: formId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const raw = await request.json().catch(() => ({}))
    const body = bodySchema.parse(raw)

    const { data: form } = await admin
      .from("crm_forms")
      .select("id, org_id, name, facebook_pixel_id, meta_capi_token, meta_test_event_code, tracking_config")
      .eq("id", formId)
      .maybeSingle<{
        id: string
        org_id: string
        name: string
        facebook_pixel_id: string | null
        meta_capi_token: string | null
        meta_test_event_code: string | null
        tracking_config: unknown
      }>()

    if (!form || form.org_id !== orgId) {
      throw new AppError("Formulário não encontrado", 404, "not-found")
    }
    if (!form.facebook_pixel_id) {
      throw new AppError(
        "Falta o ID do pixel neste formulário — preencha e salve antes de testar.",
        422,
        "missing-pixel",
      )
    }
    if (!form.meta_capi_token) {
      throw new AppError(
        "Falta o token da Conversions API — preencha e salve antes de testar.",
        422,
        "missing-token",
      )
    }

    let accessToken: string
    try {
      accessToken = decrypt(form.meta_capi_token)
    } catch {
      throw new AppError(
        "Não foi possível ler o token salvo. Cole o token de novo e salve o formulário.",
        422,
        "token-decrypt",
      )
    }

    const cfg = normalizeTrackingConfig(form.tracking_config)
    // Mesma sanitização do envio real — testar com um nome e produzir
    // outro esconderia justamente o problema que o teste deve pegar.
    const eventName =
      body.event === "lead" ? "Lead" : metaEventName(cfg.qualified_lead.event_name)
    const eventId = `test-${randomUUID()}`

    const userData = buildMetaUserData({
      ...TEST_LEAD,
      externalId: `test-${formId}`,
      clientIpAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      clientUserAgent: request.headers.get("user-agent") ?? null,
    })

    const event = buildMetaServerEvent({
      eventName,
      eventId,
      eventTime: Math.floor(Date.now() / 1000),
      userData,
      customData: {
        // Marca clara do lado da Meta: dá para filtrar/ignorar depois.
        test_event: true,
        origem: "teste manual do admin",
        formulario: form.name,
      },
    })

    const result = await sendMetaConversionEvent({
      pixelId: form.facebook_pixel_id,
      accessToken,
      testEventCode: form.meta_test_event_code ?? null,
      event,
    })

    const received = Number((result.body?.events_received as number | undefined) ?? 0)
    const ok = result.ok && received >= 1
    const metaError = (result.body?.error ?? null) as Record<string, unknown> | null

    log.info("evento de teste enviado", {
      formId,
      eventName,
      ok,
      status: result.status,
      by: user.id,
    })

    return successResponse(request, {
      ok,
      event_name: eventName,
      event_id: eventId,
      events_received: received,
      /** Identificador que a Meta usa no suporte dela. */
      fbtrace_id: (result.body?.fbtrace_id as string | undefined) ?? null,
      http_status: result.status,
      used_test_code: Boolean(form.meta_test_event_code),
      test_event_code: form.meta_test_event_code ?? null,
      error: metaError
        ? {
            message: (metaError.message as string | undefined) ?? "Erro sem mensagem",
            type: (metaError.type as string | undefined) ?? null,
            code: (metaError.code as number | undefined) ?? null,
            subcode: (metaError.error_subcode as number | undefined) ?? null,
          }
        : null,
      where_to_look: form.meta_test_event_code
        ? 'Gerenciador de Eventos → seu pixel → aba "Testar eventos". O evento aparece em segundos e NÃO entra nos relatórios.'
        : 'Gerenciador de Eventos → seu pixel → aba "Visão geral". Pode levar alguns minutos. Como não há código de teste configurado, este evento CONTA nos relatórios.',
    })
  } catch (error) {
    log.error("test event error:", error)
    return errorResponse(request, error, "conversion-test-event")
  }
}
