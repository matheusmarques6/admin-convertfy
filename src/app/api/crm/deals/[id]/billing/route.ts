/**
 * POST /api/crm/deals/[id]/billing — fechamento financeiro da venda ganha.
 *
 * Num único gesto: garante o cliente (lead → cliente via
 * ensureClientForDeal), atualiza os dados confirmados no dialog e gera
 * a cobrança no financeiro do cliente:
 *   - subscription: cria `client_subscriptions` (ciclo mensal) + a 1ª
 *     mensalidade em `client_charges` (vinculada por subscription_id)
 *   - charge: cobrança única (setup/entrada) em `client_charges`
 *
 * Tudo desagua em `unified_invoices` — a MESMA fonte do financeiro do
 * cliente, do payment status do onboarding e do cash collect do funil.
 * É o que mantém venda, cobrança e operação sincronizadas.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { ensureClientForDeal } from "@/lib/services/crm-client-link.service"

const log = logger.child("CrmDealBilling")

export const dynamic = "force-dynamic"

const PAYMENT_METHODS = ["pix_direto", "asaas", "boleto", "cartao", "wise"] as const

const bodySchema = z.object({
  client: z
    .object({
      name: z.string().min(1).max(160).optional(),
      email: z.string().email().nullable().optional(),
      phone: z.string().max(40).nullable().optional(),
      company: z.string().max(160).nullable().optional(),
    })
    .optional(),
  subscription: z
    .object({
      value: z.number().positive().max(999_999_999),
      next_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      payment_method: z.enum(PAYMENT_METHODS).optional().default("pix_direto"),
      name: z.string().max(160).optional(),
    })
    .optional(),
  charge: z
    .object({
      value: z.number().positive().max(999_999_999),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      payment_method: z.enum(PAYMENT_METHODS).optional().default("pix_direto"),
      description: z.string().max(240).optional(),
    })
    .optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    uuid().parse(id)
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = bodySchema.parse(body)

    const { data: deal } = await admin
      .from("deals")
      .select("id, title, client_id, lead_id")
      .eq("id", id)
      .maybeSingle()
    if (!deal) throw new AppError("Negócio não encontrado", 404, "not-found")

    // Garante o cliente (converte o lead se ainda não converteu).
    let clientId = deal.client_id as string | null
    if (!clientId) {
      const linked = await ensureClientForDeal(admin, id)
      clientId = linked.client_id
    }
    if (!clientId) {
      throw new AppError(
        "Negócio sem cliente nem lead — vincule um cliente pela ficha antes de gerar a cobrança.",
        422,
        "validation-error",
      )
    }

    // Dados confirmados no dialog (preencher-vazio não: aqui o usuário
    // REVISOU os campos, então o que veio sobrescreve).
    if (parsed.client && Object.keys(parsed.client).length > 0) {
      const updates: Record<string, unknown> = {}
      if (parsed.client.name?.trim()) updates.name = parsed.client.name.trim()
      if (parsed.client.email !== undefined) updates.email = parsed.client.email?.trim() || null
      if (parsed.client.phone !== undefined) updates.phone = parsed.client.phone?.trim() || null
      if (parsed.client.company !== undefined)
        updates.company = parsed.client.company?.trim() || null
      if (Object.keys(updates).length > 0) {
        const { error } = await admin.from("clients").update(updates).eq("id", clientId)
        if (error) log.warn("[Billing] update do cliente falhou", { clientId, error: error.message })
      }
    }

    let subscriptionId: string | null = null
    const chargeIds: string[] = []
    const summary: string[] = []

    if (parsed.subscription) {
      const s = parsed.subscription
      const { data: sub, error } = await admin
        .from("client_subscriptions")
        .insert({
          client_id: clientId,
          name: s.name?.trim() || `Assinatura — ${deal.title}`.slice(0, 160),
          value: s.value,
          cycle: "MONTHLY",
          payment_method: s.payment_method,
          status: "active",
          start_date: new Date().toISOString().split("T")[0],
          next_due_date: s.next_due_date,
          notes: `Gerada no fechamento do negócio "${deal.title}"`,
        })
        .select("id")
        .single()
      if (error) throw error
      subscriptionId = sub.id

      // 1ª mensalidade já entra no contas-a-receber — sem ela a
      // assinatura existe mas nada aparece pra cobrar.
      const { data: firstCharge, error: cErr } = await admin
        .from("client_charges")
        .insert({
          client_id: clientId,
          subscription_id: sub.id,
          description: `1ª mensalidade — ${deal.title}`.slice(0, 240),
          value: s.value,
          due_date: s.next_due_date,
          payment_method: s.payment_method,
          status: "pending",
        })
        .select("id")
        .single()
      if (cErr) {
        log.warn("[Billing] assinatura criada mas 1ª mensalidade falhou", {
          subscriptionId,
          error: cErr.message,
        })
      } else {
        chargeIds.push(firstCharge.id)
      }
      summary.push(`assinatura mensal de R$ ${s.value}`)
    }

    if (parsed.charge) {
      const c = parsed.charge
      const { data: charge, error } = await admin
        .from("client_charges")
        .insert({
          client_id: clientId,
          description: (c.description?.trim() || `Cobrança — ${deal.title}`).slice(0, 240),
          value: c.value,
          due_date: c.due_date,
          payment_method: c.payment_method,
          status: "pending",
        })
        .select("id")
        .single()
      if (error) throw error
      chargeIds.push(charge.id)
      summary.push(`cobrança única de R$ ${c.value}`)
    }

    if (summary.length > 0) {
      await admin.from("crm_deal_activities").insert({
        deal_id: id,
        type: "system",
        content: `Fechamento: ${summary.join(" + ")} gerada no financeiro do cliente`,
        created_by: user.id,
        is_internal: true,
      })
    }

    log.info("[Billing] fechamento", { dealId: id, clientId, subscriptionId, charges: chargeIds.length })
    return successResponse(request, {
      client_id: clientId,
      subscription_id: subscriptionId,
      charge_ids: chargeIds,
    })
  } catch (error) {
    log.error("Deal billing error:", error)
    return errorResponse(request, error, "crm-deal-billing")
  }
}
