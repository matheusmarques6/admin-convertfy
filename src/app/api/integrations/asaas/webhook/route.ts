import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { timingSafeEqual } from "crypto"
import { mapAsaasStatusToInternal } from "@/lib/integrations/asaas"
import type { AsaasPaymentStatus } from "@/lib/integrations/types"
import { handleAsaasRefundWebhook } from "@/lib/services/refund.service"
import { buildInvoiceRowFromPayment, resolveClientForPayment } from "@/lib/services/asaas-invoice-mirror"
import { isMissingClassificationColumn, stripClassification } from "@/lib/services/charge-classification"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationsAsaasWebhook")

// Create Supabase client lazily to avoid build-time errors
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface AsaasWebhookPayload {
  event: string
  payment?: {
    id: string
    customer: string
    value: number
    status: string
    billingType: string
    dueDate: string
    paymentDate?: string
    clientPaymentDate?: string
    description?: string
    externalReference?: string
    /** Assinatura de origem (sub_…) quando o pagamento nasceu de uma. */
    subscription?: string
  }
  subscription?: {
    id: string
    customer: string
    value: number
    status: string
    nextDueDate: string
  }
}

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, "webhook:asaas", RATE_LIMITS.webhook)
  if (limited) return limited

  try {
    // Verify webhook token using timing-safe comparison
    const webhookToken = request.headers.get("asaas-access-token")
    const expectedToken = process.env.ASAAS_WEBHOOK_SECRET

    if (!expectedToken) {
      log.error("ASAAS_WEBHOOK_SECRET not configured")
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
    }

    if (!webhookToken) {
      log.warn("Missing Asaas webhook token")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const a = Buffer.from(webhookToken)
    const b = Buffer.from(expectedToken)

    if (a.byteLength !== b.byteLength || !timingSafeEqual(a, b)) {
      log.warn("Invalid Asaas webhook token")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = (await request.json()) as AsaasWebhookPayload
    log.debug("Asaas webhook received:", payload.event)

    switch (payload.event) {
      case "PAYMENT_CREATED":
      case "PAYMENT_UPDATED":
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED":
      case "PAYMENT_OVERDUE":
      case "PAYMENT_DELETED":
        await handlePaymentEvent(payload)
        break
      case "PAYMENT_REFUNDED":
        await handlePaymentEvent(payload, { skipStatusUpdate: true })
        try {
          await handleRefundCompletion(payload)
        } catch (error) {
          log.error("[Refund Webhook] Error processing refund completion:", error)
          // Do not re-throw — Asaas will resend if needed
        }
        break

      case "PAYMENT_DUNNING_RECEIVED":
      case "PAYMENT_DUNNING_REQUESTED":
        await handleDunningEvent(payload)
        break

      default:
        log.debug("Unhandled Asaas event:", payload.event)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    log.error("Error processing Asaas webhook:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

interface HandlePaymentOptions {
  /** When true, skip invoice status update (let refund service decide) */
  skipStatusUpdate?: boolean
}

async function handlePaymentEvent(payload: AsaasWebhookPayload, options?: HandlePaymentOptions) {
  const payment = payload.payment
  if (!payment) return

  const supabase = getSupabaseAdmin()
  const status = mapAsaasStatusToInternal(payment.status as AsaasPaymentStatus)

  // Find invoice by Asaas ID
  const { data: invoice, error: findError } = await supabase
    .from("invoices")
    .select("*")
    .eq("asaas_id", payment.id)
    .single()

  if (findError && findError.code !== "PGRST116") {
    log.error("Error finding invoice:", findError)
    return
  }

  if (invoice) {
    // Update existing invoice
    // When skipStatusUpdate is true (PAYMENT_REFUNDED), the refund service
    // determines the final status (partial refund stays 'paid', full refund becomes 'refunded')
    const updateData: Record<string, unknown> = {
      payment_date: payment.paymentDate || payment.clientPaymentDate,
      updated_at: new Date().toISOString(),
    }
    if (!options?.skipStatusUpdate) {
      updateData.status = status
    }

    const { error: updateError } = await supabase
      .from("invoices")
      .update(updateData)
      .eq("id", invoice.id)

    if (updateError) {
      log.error("Error updating invoice:", updateError)
      return
    }

    // Log activity (skip for refund events — refund service handles its own logging)
    if (!options?.skipStatusUpdate) {
      await supabase.from("activities").insert({
        client_id: invoice.client_id,
        type: status === "paid" ? "payment_received" : "payment_overdue",
        description: `Pagamento ${status === "paid" ? "confirmado" : "atualizado"}: R$ ${payment.value.toFixed(2)}`,
        metadata: { asaas_id: payment.id, status },
      })
    }

    log.debug(`Invoice ${invoice.id} updated to status: ${status}`)
  } else {
    // Espelho novo: cliente e linha pelo módulo compartilhado com o sync
    // (externalReference → custom_fields.asaas_customer_id; sem org aqui,
    // o webhook não tem sessão). Sem cliente, não há onde pendurar.
    const clientId = await resolveClientForPayment(supabase, null, payment)
    if (clientId) {
      const row = buildInvoiceRowFromPayment(
        { ...payment, status: payment.status as AsaasPaymentStatus, subscription: payment.subscription },
        clientId,
      )
      let { error: insertError } = await supabase.from("invoices").insert(row)
      if (insertError && isMissingClassificationColumn(insertError)) {
        ;({ error: insertError } = await supabase.from("invoices").insert(stripClassification(row)))
      }
      if (insertError) {
        // 23505 = o sync/espelho gravou primeiro (índice único 20261119) — nada a fazer.
        log.error("Error creating invoice:", insertError)
      } else {
        log.debug(`New invoice created for client ${clientId}`)
      }
    }
  }
}

async function handleRefundCompletion(payload: AsaasWebhookPayload) {
  const payment = payload.payment
  if (!payment) return

  // NOTE: Asaas PAYMENT_REFUNDED webhook payload does not include a separate
  // refund amount field. payment.value is the full payment value, not the refunded
  // amount. For partial refunds, the refund service queries the actual refund records
  // from the database to determine the correct amount.
  await handleAsaasRefundWebhook({
    asaasPaymentId: payment.id,
    refundedValue: payment.value,
  })
}

async function handleDunningEvent(payload: AsaasWebhookPayload) {
  const payment = payload.payment
  if (!payment) return

  const supabase = getSupabaseAdmin()

  // Find invoice and update to overdue
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("asaas_id", payment.id)
    .single()

  if (invoice) {
    await supabase
      .from("invoices")
      .update({ status: "overdue" })
      .eq("id", invoice.id)

    // Log activity
    await supabase.from("activities").insert({
      client_id: invoice.client_id,
      type: "payment_overdue",
      description: `Assinatura em atraso: R$ ${payment.value.toFixed(2)}`,
      metadata: { asaas_id: payment.id },
    })
  }
}

// Handle GET for webhook verification
export async function GET() {
  return NextResponse.json({ status: "Asaas webhook endpoint active" })
}
