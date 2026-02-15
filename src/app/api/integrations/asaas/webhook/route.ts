import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { createClient } from "@supabase/supabase-js"
import { timingSafeEqual } from "crypto"
import { mapAsaasStatusToInternal } from "@/lib/integrations/asaas"
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
  try {
    // Verify webhook token using timing-safe comparison
    const webhookToken = request.headers.get("asaas-access-token")
    const expectedToken = process.env.ASAAS_WEBHOOK_SECRET

    if (expectedToken) {
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
    }

    const payload = (await request.json()) as AsaasWebhookPayload
    log.debug("Asaas webhook received:", payload.event)

    switch (payload.event) {
      case "PAYMENT_CREATED":
      case "PAYMENT_UPDATED":
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED":
      case "PAYMENT_OVERDUE":
      case "PAYMENT_REFUNDED":
      case "PAYMENT_DELETED":
        await handlePaymentEvent(payload)
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

async function handlePaymentEvent(payload: AsaasWebhookPayload) {
  const payment = payload.payment
  if (!payment) return

  const supabase = getSupabaseAdmin()
  const status = mapAsaasStatusToInternal(payment.status as never)

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
    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        status,
        payment_date: payment.paymentDate || payment.clientPaymentDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id)

    if (updateError) {
      log.error("Error updating invoice:", updateError)
      return
    }

    // Log activity
    await supabase.from("activities").insert({
      client_id: invoice.client_id,
      type: status === "paid" ? "payment_received" : "payment_overdue",
      description: `Pagamento ${status === "paid" ? "confirmado" : "atualizado"}: R$ ${payment.value.toFixed(2)}`,
      metadata: { asaas_id: payment.id, status },
    })

    log.debug(`Invoice ${invoice.id} updated to status: ${status}`)
  } else if (payment.externalReference) {
    // Try to find client by external reference (client_id)
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("id", payment.externalReference)
      .single()

    if (client) {
      // Create new invoice
      const { error: insertError } = await supabase.from("invoices").insert({
        client_id: client.id,
        asaas_id: payment.id,
        amount: payment.value,
        due_date: payment.dueDate,
        payment_date: payment.paymentDate || payment.clientPaymentDate,
        status,
        description: payment.description,
      })

      if (insertError) {
        log.error("Error creating invoice:", insertError)
      } else {
        log.debug(`New invoice created for client ${client.id}`)
      }
    }
  }
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
      description: `Cobrança em atraso: R$ ${payment.value.toFixed(2)}`,
      metadata: { asaas_id: payment.id },
    })
  }
}

// Handle GET for webhook verification
export async function GET() {
  return NextResponse.json({ status: "Asaas webhook endpoint active" })
}
