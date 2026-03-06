// TODO [TECH-DEBT INC-15/16]: Financial data comes from 3 sources (client_charges, invoices, contracts).
// Credentials are stored in integrations.credentials JSON, while Klaviyo uses client_stores columns.
// Standardize credential storage and document the financial data flow.
import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { errorResponse, successResponse, requireAuth, AppError, ValidationError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
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
      description: description || `Cobrança - ${client?.name}`,
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

    await supabase.from("invoices").insert({
      asaas_id: payment.id, client_id: clientId, amount: value,
      due_date: dueDate, status: "pending", description: paymentData.description,
    })

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
