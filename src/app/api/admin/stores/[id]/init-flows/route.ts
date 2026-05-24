/**
 * POST /api/admin/stores/[id]/init-flows
 *   Cria os 7 flows padrao (welcome, site_abandoned, browse_abandonment,
 *   abandoned_cart, upsell, win_back, shipping_stages) + emails default
 *   por flow_type. Idempotente — usa NOT EXISTS.
 *   Welcome inicia "in_progress", outros "blocked".
 *   post_purchase fica fora (deprecated; legado preservado em retrocompat).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("InitFlows")

export const dynamic = "force-dynamic"

type FlowTypeKey =
  | "welcome"
  | "site_abandoned"
  | "browse_abandonment"
  | "abandoned_cart"
  | "upsell"
  | "win_back"
  | "shipping_stages"

const DEFAULT_FLOWS: Array<{
  flow_type: FlowTypeKey
  name: string
  description: string
  status: "blocked" | "in_progress"
  position: number
}> = [
  {
    flow_type: "welcome",
    name: "Welcome Flow",
    description: "Sequência de boas-vindas para novos inscritos",
    status: "in_progress",
    position: 1,
  },
  {
    flow_type: "site_abandoned",
    name: "Site Abandoned",
    description: "Recuperação de visitantes que saíram do site sem interagir",
    status: "blocked",
    position: 2,
  },
  {
    flow_type: "browse_abandonment",
    name: "Browse Abandoned",
    description: "Recuperação de navegação sem compra",
    status: "blocked",
    position: 3,
  },
  {
    flow_type: "abandoned_cart",
    name: "Carrinho Abandonado",
    description: "Recuperação de carrinho abandonado",
    status: "blocked",
    position: 4,
  },
  {
    flow_type: "upsell",
    name: "Upsell",
    description: "Upsell pós-compra para aumentar ticket médio",
    status: "blocked",
    position: 5,
  },
  {
    flow_type: "win_back",
    name: "Winback",
    description: "Reativação de clientes inativos",
    status: "blocked",
    position: 6,
  },
  {
    flow_type: "shipping_stages",
    name: "Etapas de Envio",
    description: "Notificações transacionais durante o envio do pedido",
    status: "blocked",
    position: 7,
  },
]

// Emails default que devem existir em cada flow. Welcome 1-5 vem do seed
// SQL antigo (20260607b); aqui complementamos com 6-8 e cobrimos os outros
// flow_types. shipping_stages tem nomes fixos, nao numerados.
const DEFAULT_EMAILS: Record<
  FlowTypeKey,
  Array<{ number: number; name: string; delay_hours: number }>
> = {
  welcome: [
    { number: 1, name: "Welcome 1", delay_hours: 0 },
    { number: 2, name: "Welcome 2", delay_hours: 24 },
    { number: 3, name: "Welcome 3", delay_hours: 48 },
    { number: 4, name: "Welcome 4", delay_hours: 96 },
    { number: 5, name: "Welcome 5", delay_hours: 120 },
    { number: 6, name: "Welcome 6", delay_hours: 144 },
    { number: 7, name: "Welcome 7", delay_hours: 168 },
    { number: 8, name: "Welcome 8", delay_hours: 192 },
  ],
  site_abandoned: [
    { number: 1, name: "Site Abandoned 1", delay_hours: 1 },
  ],
  browse_abandonment: [
    { number: 1, name: "Browse Abandoned 1", delay_hours: 1 },
    { number: 2, name: "Browse Abandoned 2", delay_hours: 24 },
    { number: 3, name: "Browse Abandoned 3", delay_hours: 48 },
    { number: 4, name: "Browse Abandoned 4", delay_hours: 72 },
    { number: 5, name: "Browse Abandoned 5", delay_hours: 120 },
  ],
  abandoned_cart: [
    { number: 1, name: "Carrinho Abandonado 1", delay_hours: 1 },
    { number: 2, name: "Carrinho Abandonado 2", delay_hours: 4 },
    { number: 3, name: "Carrinho Abandonado 3", delay_hours: 24 },
    { number: 4, name: "Carrinho Abandonado 4", delay_hours: 48 },
    { number: 5, name: "Carrinho Abandonado 5", delay_hours: 72 },
    { number: 6, name: "Carrinho Abandonado 6", delay_hours: 96 },
    { number: 7, name: "Carrinho Abandonado 7", delay_hours: 120 },
    { number: 8, name: "Carrinho Abandonado 8", delay_hours: 168 },
  ],
  upsell: [
    { number: 1, name: "Upsell 1", delay_hours: 24 },
    { number: 2, name: "Upsell 2", delay_hours: 72 },
    { number: 3, name: "Upsell 3", delay_hours: 168 },
    { number: 4, name: "Upsell 4", delay_hours: 336 },
  ],
  win_back: [
    { number: 1, name: "Winback 1", delay_hours: 0 },
    { number: 2, name: "Winback 2", delay_hours: 168 },
    { number: 3, name: "Winback 3", delay_hours: 336 },
  ],
  shipping_stages: [
    { number: 1, name: "Pedido Pago", delay_hours: 0 },
    { number: 2, name: "Pedido em separação", delay_hours: 0 },
    { number: 3, name: "Pedido em coleta", delay_hours: 0 },
    { number: 4, name: "Atraso na Entrega", delay_hours: 0 },
    { number: 5, name: "Pedido Enviado", delay_hours: 0 },
  ],
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    // 1. Verifica flows existentes
    const { data: existing, error: fetchErr } = await admin
      .from("email_flows")
      .select("id, flow_type")
      .eq("store_id", storeId)
    if (fetchErr) throw fetchErr

    const existingByType = new Map(
      (existing ?? []).map((f) => [f.flow_type as string, f.id as string]),
    )
    const toInsert = DEFAULT_FLOWS.filter(
      (f) => !existingByType.has(f.flow_type),
    ).map((f) => ({ ...f, store_id: storeId }))

    let createdFlows: Array<{ id: string; flow_type: string }> = []
    if (toInsert.length > 0) {
      const { data: inserted, error: insErr } = await admin
        .from("email_flows")
        .insert(toInsert)
        .select("id, flow_type")
      if (insErr) throw insErr
      createdFlows = inserted ?? []
      for (const f of createdFlows) {
        existingByType.set(f.flow_type, f.id)
      }
    }

    // 2. Garante emails default em todos os flows (idempotente)
    let createdEmails = 0
    for (const flow of DEFAULT_FLOWS) {
      const flowId = existingByType.get(flow.flow_type)
      if (!flowId) continue
      const defaultEmails = DEFAULT_EMAILS[flow.flow_type]
      if (!defaultEmails || defaultEmails.length === 0) continue

      const { data: existingEmails, error: emailFetchErr } = await admin
        .from("email_flow_emails")
        .select("number")
        .eq("flow_id", flowId)
      if (emailFetchErr) throw emailFetchErr
      const existingNumbers = new Set(
        (existingEmails ?? []).map((e) => e.number as number),
      )

      const emailsToInsert = defaultEmails
        .filter((e) => !existingNumbers.has(e.number))
        .map((e) => ({
          flow_id: flowId,
          number: e.number,
          name: e.name,
          status: "draft" as const,
          delay_hours: e.delay_hours,
        }))

      if (emailsToInsert.length > 0) {
        const { error: emailInsErr } = await admin
          .from("email_flow_emails")
          .insert(emailsToInsert)
        if (emailInsErr) throw emailInsErr
        createdEmails += emailsToInsert.length
      }
    }

    return successResponse(request, {
      created: createdFlows.length,
      skipped: DEFAULT_FLOWS.length - createdFlows.length,
      emails_created: createdEmails,
    })
  } catch (error) {
    log.error("Init flows error:", error)
    return errorResponse(request, error, "init-flows")
  }
}
