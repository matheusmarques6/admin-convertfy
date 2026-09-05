// TODO [TECH-DEBT INC-15/16]: Financial data comes from 3 sources (client_charges, invoices, contracts).
// Credentials are stored in integrations.credentials JSON, while Klaviyo uses client_stores columns.
// Standardize credential storage and document the financial data flow.
import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { errorResponse, successResponse, requireAuth, AppError, ValidationError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { validateMonetaryValue } from "@/lib/schemas/common"
import {
  chargeStoreIds,
  isMissingClassificationColumn,
  isMissingStoreIdsColumn,
  parseChargeClassification,
  stripClassification,
  stripStoreIds,
} from "@/lib/services/charge-classification"
import { ensureAsaasInvoiceMirror, loadAsaasService } from "@/lib/services/asaas-invoice-mirror"
import { logger } from "@/lib/logger"

const log = logger.child("AsaasCharges")

// POST - Create new charge/payment
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const body = await request.json()
    const { clientId, value, billingType, dueDate, description, installmentCount, installmentValue, discount, interest, fine, postalService } = body

    if (!clientId || !value || !billingType || !dueDate) {
      throw new ValidationError("Campos obrigatórios: clientId, value, billingType, dueDate")
    }

    validateMonetaryValue(value)

    // Classificação (tipo / meses de referência / lojas) — aceita tanto
    // o vocabulário snake_case das rotas locais quanto camelCase.
    const classification = parseChargeClassification({
      charge_type: body.charge_type ?? body.chargeType,
      reference_months: body.reference_months ?? body.referenceMonths,
      ...(body.store_ids !== undefined || body.storeIds !== undefined
        ? { store_ids: body.store_ids ?? body.storeIds }
        : { store_id: body.store_id ?? body.storeId }),
    })
    const storeIds = chargeStoreIds(classification)
    if (storeIds.length > 0) {
      const { data: stores } = await supabase
        .from("client_stores")
        .select("id, client_id")
        .in("id", storeIds)
      const ok = new Set((stores ?? []).filter((s) => s.client_id === clientId).map((s) => s.id))
      if (storeIds.some((id) => !ok.has(id))) {
        throw new AppError("Alguma loja informada não pertence a este cliente", 422, "validation-error")
      }
    }

    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .eq("org_id", orgId)
      .single()

    if (!integration) {
      throw new AppError("Integração Asaas não ativa", 400)
    }

    const { data: client } = await supabase
      .from("clients")
      .select("name, custom_fields")
      .eq("id", clientId)
      .single()

    const asaasCustomerId = (client?.custom_fields as Record<string, string>)?.asaas_customer_id
    if (!asaasCustomerId) {
      throw new AppError("Cliente não possui ID Asaas. Importe o cliente primeiro.", 400)
    }

    const asaas = createAsaasService(decryptCredentialsJson(integration.credentials))

    const paymentData: {
      customer: string; billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
      value: number; dueDate: string; description?: string; externalReference?: string;
      postalService?: boolean; installmentCount?: number; installmentValue?: number;
      discount?: { value: number; dueDateLimitDays: number; type: string };
      interest?: { value: number }; fine?: { value: number };
    } = {
      customer: asaasCustomerId, billingType, value: Number(value), dueDate,
      description: description || `Assinatura - ${client?.name}`,
      externalReference: clientId,
    }

    if (postalService) paymentData.postalService = true
    if (installmentCount && installmentCount > 1) {
      paymentData.installmentCount = installmentCount
      paymentData.installmentValue = installmentValue || value / installmentCount
    }
    if (discount?.value) {
      paymentData.discount = { value: discount.value, dueDateLimitDays: discount.dueDateLimitDays || 0, type: discount.type || "FIXED" }
    }
    if (interest?.value) paymentData.interest = { value: interest.value }
    if (fine?.value) paymentData.fine = { value: fine.value }

    const payment = await asaas.createPayment(paymentData)

    const paymentLinks: { invoiceUrl?: string; bankSlipUrl?: string; pixQrCode?: { encodedImage: string; payload: string } } = {}

    if (billingType === "PIX") {
      try {
        const pixData = await asaas.getPaymentPixQrCode(payment.id)
        paymentLinks.pixQrCode = pixData
      } catch {
        log.debug("Could not get PIX QR code yet")
      }
    }

    if (billingType === "BOLETO") {
      try {
        const boletoData = await asaas.getPaymentBankSlip(payment.id)
        paymentLinks.bankSlipUrl = boletoData.url
      } catch {
        log.debug("Could not get bank slip yet")
      }
    }

    const invoiceRow: Record<string, unknown> = {
      asaas_id: payment.id, client_id: clientId, amount: value,
      due_date: dueDate, status: "pending", description: paymentData.description,
      charge_type: classification.charge_type ?? "other",
      reference_months: classification.reference_months ?? null,
      store_id: classification.store_id ?? null,
      store_ids: classification.store_ids ?? null,
    }
    let { error: invErr } = await supabase.from("invoices").insert(invoiceRow)
    if (invErr && isMissingStoreIdsColumn(invErr)) {
      // Migration 20261118 pendente — mantém a classificação, só sem a lista de lojas.
      ;({ error: invErr } = await supabase.from("invoices").insert(stripStoreIds(invoiceRow)))
    }
    if (invErr && isMissingClassificationColumn(invErr)) {
      // Migration 20261113 pendente — a fatura existe no Asaas, então o
      // espelho local entra sem a classificação (o sync completa depois).
      log.warn("invoices sem colunas de classificação — retry sem elas", { error: invErr.message })
      await supabase.from("invoices").insert(stripClassification(invoiceRow))
    } else if (invErr) {
      log.warn("espelho local da fatura Asaas falhou", { error: invErr.message, paymentId: payment.id })
    }

    return successResponse(request, {
      payment: {
        id: payment.id, value: payment.value, status: payment.status,
        billingType: payment.billingType, dueDate: payment.dueDate,
        invoiceUrl: payment.invoiceUrl, ...paymentLinks,
      },
    }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "AsaasCharges POST")
  }
}

/**
 * PUT - Pagamento MANUAL de uma cobrança Asaas.
 *
 * `action: "receive"` (default): o cliente pagou POR FORA do Asaas
 * (transferência internacional, Wise, PIX direto) — `receiveInCash` no
 * Asaas + espelho local `paid`. `action: "undo"`: desfaz a marcação
 * manual (`undoReceivedInCash`) e o espelho volta a `pending`.
 *
 * O espelho em `invoices` nasce aqui se ainda não existir
 * (`ensureAsaasInvoiceMirror`): cobrança gerada pela assinatura só
 * entrava no banco no sync, e o update local acertava 0 linhas —
 * classificação e carteira nunca viam o pagamento.
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const body = await request.json()
    const { paymentId, value, paymentDate, proofPath, action } = body as {
      paymentId?: string
      value?: number
      paymentDate?: string
      proofPath?: string
      action?: "receive" | "undo"
    }

    if (!paymentId) {
      throw new ValidationError("paymentId é obrigatório")
    }

    const admin = createAdminClient()
    const asaas = await loadAsaasService(admin, orgId)

    // Espelho local ANTES de mexer no Asaas: se o cliente não é da org,
    // devolve null e a rota não toca numa cobrança alheia.
    const mirror = await ensureAsaasInvoiceMirror(admin, orgId, paymentId)
    if (!mirror) {
      throw new AppError("Cobrança não encontrada no Asaas para esta organização", 404, "not-found")
    }

    if (action === "undo") {
      const undone = await asaas.undoReceivedInCash(paymentId)
      const { error } = await admin
        .from("invoices")
        .update({ status: "pending", payment_date: null })
        .eq("id", mirror.id)
      if (error) log.warn("espelho local não voltou a pending", { error: error.message, paymentId })
      return successResponse(request, {
        success: true,
        payment: { id: undone.id, status: undone.status },
      })
    }

    // O receiveInCash exige o valor recebido; se não vier no body, busca no Asaas.
    const receivedValue = value ?? (await asaas.getPayment(paymentId)).value
    validateMonetaryValue(receivedValue)

    const paidOn = paymentDate || new Date().toISOString().split("T")[0]
    const received = await asaas.receivePaymentInCash(paymentId, {
      paymentDate: paidOn,
      value: Number(receivedValue),
      notifyCustomer: false,
    })

    // Reflete localmente (o espelho existe — garantido acima)
    const { error: updErr } = await admin
      .from("invoices")
      .update({ status: "paid", payment_date: paidOn })
      .eq("id", mirror.id)
    if (updErr) log.warn("espelho local não marcou paid", { error: updErr.message, paymentId })

    // Comprovante anexado (best-effort — a coluna pode não existir se a
    // migration 20260924_payment_proof ainda não tiver sido aplicada)
    if (proofPath) {
      const { error: proofErr } = await admin
        .from("invoices")
        .update({ payment_proof_path: proofPath })
        .eq("id", mirror.id)
      if (proofErr) {
        log.info("Comprovante não persistido (coluna ausente?)", { error: proofErr.message })
      }
    }

    return successResponse(request, {
      success: true,
      mirror_created: mirror.created,
      payment: { id: received.id, status: received.status },
    })
  } catch (error) {
    return errorResponse(request, error, "AsaasCharges PUT")
  }
}

// DELETE - Cancel a payment
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const paymentId = request.nextUrl.searchParams.get("payment_id")
    if (!paymentId) {
      throw new ValidationError("payment_id é obrigatório")
    }

    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .eq("org_id", orgId)
      .single()

    if (!integration) {
      throw new AppError("Integração Asaas não ativa", 400)
    }

    const asaas = createAsaasService(decryptCredentialsJson(integration.credentials))
    await asaas.cancelPayment(paymentId)

    await supabase.from("invoices").update({ status: "cancelled" }).eq("asaas_id", paymentId)

    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "AsaasCharges DELETE")
  }
}
