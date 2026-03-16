/**
 * Refund Service
 *
 * Centralized logic for refund processing:
 * - initiateAsaasRefund: async refund via Asaas gateway (status: requested -> webhook confirms)
 * - processManualRefund: sync refund for local charges (status: processed immediately)
 * - handleAsaasRefundWebhook: processes Asaas webhook confirmation
 * - listRefunds: paginated query with org scoping
 *
 * All writes use createAdminClient() (service role, bypasses RLS).
 * DB trigger `check_refund_total_limit` provides concurrency protection via SELECT FOR UPDATE.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("RefundService")

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InitiateAsaasRefundParams {
  invoiceId: string
  orgId: string
  userId: string
  amount?: number
  reason: string
}

interface ProcessManualRefundParams {
  chargeId: string
  orgId: string
  userId: string
  amount?: number
  reason: string
}

interface HandleAsaasRefundWebhookParams {
  asaasPaymentId: string
  refundedValue: number
}

interface ListRefundsParams {
  orgId: string
  clientId?: string
  status?: string
  page?: number
  limit?: number
}

interface RefundResult {
  refundId: string
  status: string
  originalAmount: number
  refundAmount: number
}

interface ListRefundsResult {
  refunds: Array<Record<string, unknown>>
  total: number
  page: number
}

// ---------------------------------------------------------------------------
// Rate Limiting (in-memory, per org — resets on cold start)
// ---------------------------------------------------------------------------

const refundRateLimit = new Map<string, { count: number; resetAt: number }>()
const REFUND_RATE_LIMIT = { windowMs: 60_000, max: 5 }

function checkRefundRateLimit(orgId: string): void {
  const now = Date.now()

  // Prune expired entries if map grows large
  if (refundRateLimit.size > 100) {
    for (const [key, entry] of refundRateLimit) {
      if (now > entry.resetAt) refundRateLimit.delete(key)
    }
  }

  const entry = refundRateLimit.get(orgId)

  if (!entry || now > entry.resetAt) {
    refundRateLimit.set(orgId, { count: 1, resetAt: now + REFUND_RATE_LIMIT.windowMs })
    return
  }

  if (entry.count >= REFUND_RATE_LIMIT.max) {
    throw new AppError("Limite de reembolsos excedido. Tente novamente em 1 minuto.", 429)
  }

  entry.count++
}

// ---------------------------------------------------------------------------
// Activity Logging (best-effort — never fails the main operation)
// ---------------------------------------------------------------------------

type RefundActivityType =
  | "refund_initiated"
  | "refund_manual"
  | "refund_completed"
  | "refund_failed"

async function logRefundActivity(
  type: RefundActivityType,
  clientId: string,
  userId: string | null,
  metadata: Record<string, unknown>,
) {
  try {
    const adminClient = createAdminClient()
    await adminClient.from("activities").insert({
      client_id: clientId,
      user_id: userId,
      type,
      description: formatActivityDescription(type, metadata),
      metadata,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    log.warn(`Failed to log activity ${type}`, { error: err, clientId, metadata })
  }
}

function formatActivityDescription(
  type: RefundActivityType,
  metadata: Record<string, unknown>,
): string {
  const amount = metadata.amount as number | undefined
  const amountStr = amount != null ? `R$ ${amount.toFixed(2)}` : ""

  switch (type) {
    case "refund_initiated":
      return `Reembolso Asaas iniciado: ${amountStr}`
    case "refund_manual":
      return `Reembolso manual processado: ${amountStr}`
    case "refund_completed":
      return `Reembolso Asaas confirmado: ${amountStr}`
    case "refund_failed":
      return `Reembolso Asaas falhou: ${metadata.error_message ?? "erro desconhecido"}`
  }
}

// ---------------------------------------------------------------------------
// Asaas Service Helper
// ---------------------------------------------------------------------------

async function getAsaasServiceForOrg(orgId: string) {
  const adminClient = createAdminClient()

  const { data: integration } = await adminClient
    .from("integrations")
    .select("credentials, is_active")
    .eq("type", "asaas")
    .eq("is_active", true)
    .eq("org_id", orgId)
    .single()

  if (!integration) {
    throw new AppError("Integração Asaas não ativa para esta organização", 400)
  }

  return createAsaasService(decryptCredentialsJson(integration.credentials))
}

// ---------------------------------------------------------------------------
// initiateAsaasRefund
// ---------------------------------------------------------------------------

export async function initiateAsaasRefund(
  params: InitiateAsaasRefundParams,
): Promise<RefundResult> {
  const { invoiceId, orgId, userId, amount, reason } = params

  checkRefundRateLimit(orgId)

  const adminClient = createAdminClient()

  // 1. Fetch and validate invoice
  const { data: invoice, error: invoiceError } = await adminClient
    .from("invoices")
    .select("id, amount, status, asaas_id, client_id")
    .eq("id", invoiceId)
    .single()

  if (invoiceError || !invoice) {
    throw new AppError("Invoice não encontrada", 400)
  }

  if (invoice.status !== "paid") {
    throw new AppError("Apenas faturas pagas podem ser reembolsadas", 400)
  }

  if (!invoice.asaas_id) {
    throw new AppError(
      "Esta fatura não possui pagamento Asaas vinculado. Use reembolso manual.",
      400,
    )
  }

  // 2. Validate org ownership (invoice -> client -> org_id)
  const { data: client } = await adminClient
    .from("clients")
    .select("id, org_id")
    .eq("id", invoice.client_id)
    .single()

  if (!client || client.org_id !== orgId) {
    throw new AppError("Acesso negado", 403)
  }

  // 3. Check already refunded amount
  const { data: summary } = await adminClient
    .from("refund_summaries")
    .select("total_refunded")
    .eq("invoice_id", invoiceId)
    .maybeSingle()

  const alreadyRefunded = Number(summary?.total_refunded ?? 0)
  const originalAmount = Number(invoice.amount)
  const remaining = originalAmount - alreadyRefunded

  if (remaining <= 0) {
    throw new AppError("Esta fatura já foi totalmente reembolsada", 409)
  }

  const refundAmount = amount ?? remaining

  if (refundAmount <= 0) {
    throw new AppError("Valor de reembolso deve ser maior que zero", 400)
  }

  if (refundAmount > remaining) {
    throw new AppError(
      `Valor excede o disponível para reembolso (R$ ${remaining.toFixed(2)})`,
      400,
    )
  }

  // 4. Call Asaas API
  const asaasService = await getAsaasServiceForOrg(orgId)

  try {
    await asaasService.refundPayment(invoice.asaas_id, refundAmount)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erro desconhecido"
    log.error(`Asaas refund failed for invoice ${invoiceId}: ${errorMessage}`)

    // Insert failed refund record
    await adminClient.from("refunds").insert({
      invoice_id: invoiceId,
      client_id: invoice.client_id,
      amount: refundAmount,
      reason,
      source: "asaas",
      status: "failed",
      processed_by: userId,
    })

    // Log failure activity (best-effort)
    await logRefundActivity("refund_failed", invoice.client_id, userId, {
      invoice_id: invoiceId,
      amount: refundAmount,
      error_message: errorMessage,
    })

    throw new AppError(
      `Falha ao processar reembolso via Asaas: ${errorMessage}`,
      502,
    )
  }

  // 5. Insert refund record (status: requested — awaits webhook confirmation)
  const { data: refund, error: insertError } = await adminClient
    .from("refunds")
    .insert({
      invoice_id: invoiceId,
      client_id: invoice.client_id,
      amount: refundAmount,
      reason,
      source: "asaas",
      status: "requested",
      processed_by: userId,
    })
    .select("id")
    .single()

  if (insertError || !refund) {
    log.error("Failed to insert refund record after Asaas call", { invoiceId, insertError })
    throw new AppError("Reembolso enviado ao Asaas mas falha ao registrar localmente", 500)
  }

  log.info(`Initiated asaas refund for invoice ${invoiceId}, amount ${refundAmount}`)

  // 6. Activity log (best-effort)
  await logRefundActivity("refund_initiated", invoice.client_id, userId, {
    refund_id: refund.id,
    amount: refundAmount,
    reason,
    invoice_id: invoiceId,
  })

  return {
    refundId: refund.id,
    status: "requested",
    originalAmount,
    refundAmount,
  }
}

// ---------------------------------------------------------------------------
// processManualRefund
// ---------------------------------------------------------------------------

export async function processManualRefund(
  params: ProcessManualRefundParams,
): Promise<RefundResult> {
  const { chargeId, orgId, userId, amount, reason } = params

  checkRefundRateLimit(orgId)

  const adminClient = createAdminClient()

  // 1. Fetch and validate charge
  const { data: charge, error: chargeError } = await adminClient
    .from("client_charges")
    .select("id, value, status, client_id")
    .eq("id", chargeId)
    .single()

  if (chargeError || !charge) {
    throw new AppError("Assinatura não encontrada", 400)
  }

  if (charge.status !== "paid") {
    throw new AppError("Apenas assinaturas pagas podem ser reembolsadas", 400)
  }

  // 2. Validate org ownership (charge -> client -> org_id)
  const { data: client } = await adminClient
    .from("clients")
    .select("id, org_id")
    .eq("id", charge.client_id)
    .single()

  if (!client || client.org_id !== orgId) {
    throw new AppError("Acesso negado", 403)
  }

  // 3. Check already refunded amount
  const { data: summary } = await adminClient
    .from("refund_summaries")
    .select("total_refunded")
    .eq("charge_id", chargeId)
    .maybeSingle()

  const alreadyRefunded = Number(summary?.total_refunded ?? 0)
  const originalAmount = Number(charge.value)
  const remaining = originalAmount - alreadyRefunded

  if (remaining <= 0) {
    throw new AppError("Esta assinatura já foi totalmente reembolsada", 409)
  }

  const refundAmount = amount ?? remaining

  if (refundAmount <= 0) {
    throw new AppError("Valor de reembolso deve ser maior que zero", 400)
  }

  if (refundAmount > remaining) {
    throw new AppError(
      `Valor excede o disponível para reembolso (R$ ${remaining.toFixed(2)})`,
      400,
    )
  }

  // 4. Insert refund record (manual = processed immediately)
  const { data: refund, error: insertError } = await adminClient
    .from("refunds")
    .insert({
      charge_id: chargeId,
      client_id: charge.client_id,
      amount: refundAmount,
      reason,
      source: "manual",
      status: "processed",
      processed_by: userId,
      processed_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (insertError || !refund) {
    log.error("Failed to insert manual refund record", { chargeId, insertError })
    throw new AppError("Falha ao registrar reembolso manual", 500)
  }

  // 5. If full refund: update charge status to 'refunded'
  const newRemaining = remaining - refundAmount
  if (newRemaining <= 0) {
    const { error: updateError } = await adminClient
      .from("client_charges")
      .update({ status: "refunded" })
      .eq("id", chargeId)

    if (updateError) {
      log.warn("Failed to update charge status to refunded", { chargeId, updateError })
    }
  }

  log.info(`Processed manual refund for charge ${chargeId}, amount ${refundAmount}`)

  // 6. Activity log (best-effort)
  await logRefundActivity("refund_manual", charge.client_id, userId, {
    refund_id: refund.id,
    amount: refundAmount,
    reason,
    charge_id: chargeId,
  })

  return {
    refundId: refund.id,
    status: "processed",
    originalAmount,
    refundAmount,
  }
}

// ---------------------------------------------------------------------------
// handleAsaasRefundWebhook
// ---------------------------------------------------------------------------

export async function handleAsaasRefundWebhook(
  params: HandleAsaasRefundWebhookParams,
): Promise<void> {
  const { asaasPaymentId, refundedValue } = params

  const adminClient = createAdminClient()

  // 1. Find invoice by asaas_id
  const { data: invoice } = await adminClient
    .from("invoices")
    .select("id, amount, client_id")
    .eq("asaas_id", asaasPaymentId)
    .single()

  if (!invoice) {
    log.warn(`Webhook refund: no invoice found for asaas_id ${asaasPaymentId} — skipping`)
    return
  }

  // 2. Look for pending refund record
  const { data: pendingRefund } = await adminClient
    .from("refunds")
    .select("id")
    .eq("invoice_id", invoice.id)
    .eq("status", "requested")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (pendingRefund) {
    // 3a. Update existing pending refund to processed
    const { error: updateError } = await adminClient
      .from("refunds")
      .update({
        status: "processed",
        asaas_refund_id: `${asaasPaymentId}:${refundedValue}`,
        processed_at: new Date().toISOString(),
      })
      .eq("id", pendingRefund.id)

    if (updateError) {
      log.error("Failed to update pending refund to processed", {
        refundId: pendingRefund.id,
        updateError,
      })
    }

    log.info(`Webhook confirmed refund ${pendingRefund.id} for invoice ${invoice.id}`)

    // Activity log (best-effort)
    await logRefundActivity("refund_completed", invoice.client_id, null, {
      refund_id: pendingRefund.id,
      amount: refundedValue,
      invoice_id: invoice.id,
    })
  } else {
    // 3b. No pending refund — create retroactive record (webhook came without admin trigger)
    log.warn(
      `No pending refund found for invoice ${invoice.id} — creating retroactive record`,
    )

    // Use upsert with asaas_refund_id for idempotency
    // asaas_refund_id = "asaasPaymentId:amount" as a composite key for uniqueness
    const asaasRefundId = `${asaasPaymentId}:${refundedValue}`

    const { data: retroRefund, error: insertError } = await adminClient
      .from("refunds")
      .upsert(
        {
          invoice_id: invoice.id,
          client_id: invoice.client_id,
          amount: refundedValue,
          reason: "Reembolso processado diretamente no Asaas",
          source: "asaas",
          status: "processed",
          asaas_refund_id: asaasRefundId,
          processed_by: null,
          processed_at: new Date().toISOString(),
        },
        { onConflict: "asaas_refund_id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle()

    if (insertError) {
      log.error("Failed to insert retroactive refund record", {
        invoiceId: invoice.id,
        insertError,
      })
      return
    }

    if (retroRefund) {
      await logRefundActivity("refund_completed", invoice.client_id, null, {
        refund_id: retroRefund.id,
        amount: refundedValue,
        invoice_id: invoice.id,
        retroactive: true,
      })
    }
  }

  // 4. Check if invoice is fully refunded
  const { data: updatedSummary } = await adminClient
    .from("refund_summaries")
    .select("total_refunded")
    .eq("invoice_id", invoice.id)
    .maybeSingle()

  const totalRefunded = Number(updatedSummary?.total_refunded ?? 0)
  const invoiceAmount = Number(invoice.amount)

  if (totalRefunded >= invoiceAmount) {
    const { error: statusError } = await adminClient
      .from("invoices")
      .update({ status: "refunded" })
      .eq("id", invoice.id)

    if (statusError) {
      log.error("Failed to update invoice status to refunded", {
        invoiceId: invoice.id,
        statusError,
      })
    } else {
      log.info(`Invoice ${invoice.id} fully refunded (total: ${totalRefunded})`)
    }
  }
}

// ---------------------------------------------------------------------------
// listRefunds
// ---------------------------------------------------------------------------

export async function listRefunds(
  params: ListRefundsParams,
): Promise<ListRefundsResult> {
  const { orgId, clientId, status, page = 1, limit: rawLimit = 20 } = params

  const limit = Math.min(Math.max(rawLimit, 1), 100)
  const offset = (Math.max(page, 1) - 1) * limit

  const adminClient = createAdminClient()

  // Build query: refunds joined with clients for org scoping
  let query = adminClient
    .from("refunds")
    .select(
      `
      id,
      amount,
      reason,
      source,
      status,
      created_at,
      processed_at,
      processed_by,
      invoice_id,
      charge_id,
      client_id,
      clients!inner ( id, name, org_id ),
      invoices ( id, description ),
      client_charges ( id, description )
    `,
      { count: "exact" },
    )
    .eq("clients.org_id", orgId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (clientId) {
    query = query.eq("client_id", clientId)
  }

  if (status) {
    query = query.eq("status", status)
  }

  const { data, count, error } = await query

  if (error) {
    log.error("Failed to list refunds", { orgId, error })
    throw new AppError("Falha ao listar reembolsos", 500)
  }

  // Transform results for cleaner response
  const refunds = (data ?? []).map((row: Record<string, unknown>) => {
    const clients = row.clients as { name?: string } | null
    const invoices = row.invoices as { description?: string } | null
    const charges = row.client_charges as { description?: string } | null

    return {
      id: row.id,
      amount: row.amount,
      reason: row.reason,
      source: row.source,
      status: row.status,
      created_at: row.created_at,
      processed_at: row.processed_at,
      processed_by: row.processed_by,
      invoice_id: row.invoice_id,
      charge_id: row.charge_id,
      client_id: row.client_id,
      client_name: clients?.name ?? null,
      parent_description: invoices?.description ?? charges?.description ?? null,
    }
  })

  return {
    refunds,
    total: count ?? 0,
    page,
  }
}
