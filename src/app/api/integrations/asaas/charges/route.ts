import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"

// POST - Create new charge/payment
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const body = await request.json()
    const {
      clientId,
      value,
      billingType, // BOLETO, PIX, CREDIT_CARD, UNDEFINED
      dueDate,
      description,
      // Optional fields
      installmentCount,
      installmentValue,
      discount,
      interest,
      fine,
      postalService, // Send by mail
    } = body

    // Validate required fields
    if (!clientId || !value || !billingType || !dueDate) {
      return NextResponse.json(
        { error: "Campos obrigatórios: clientId, value, billingType, dueDate" },
        { status: 400 }
      )
    }

    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .single()

    if (!integration) {
      return NextResponse.json({ error: "Integração Asaas não ativa" }, { status: 400 })
    }

    // Get asaas_customer_id
    const { data: client } = await supabase
      .from("clients")
      .select("name, custom_fields")
      .eq("id", clientId)
      .single()

    const asaasCustomerId = (client?.custom_fields as Record<string, string>)?.asaas_customer_id

    if (!asaasCustomerId) {
      return NextResponse.json(
        { error: "Cliente não possui ID Asaas. Importe o cliente primeiro." },
        { status: 400 }
      )
    }

    const asaas = createAsaasService(integration.credentials)

    // Build payment object
    const paymentData: {
      customer: string
      billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED"
      value: number
      dueDate: string
      description?: string
      externalReference?: string
      postalService?: boolean
      installmentCount?: number
      installmentValue?: number
      discount?: { value: number; dueDateLimitDays: number; type: string }
      interest?: { value: number }
      fine?: { value: number }
    } = {
      customer: asaasCustomerId,
      billingType,
      value: Number(value),
      dueDate,
      description: description || `Cobrança - ${client?.name}`,
      externalReference: clientId, // Link to our client ID
    }

    // Add optional fields
    if (postalService) paymentData.postalService = true
    if (installmentCount && installmentCount > 1) {
      paymentData.installmentCount = installmentCount
      paymentData.installmentValue = installmentValue || value / installmentCount
    }
    if (discount?.value) {
      paymentData.discount = {
        value: discount.value,
        dueDateLimitDays: discount.dueDateLimitDays || 0,
        type: discount.type || "FIXED", // FIXED or PERCENTAGE
      }
    }
    if (interest?.value) {
      paymentData.interest = { value: interest.value }
    }
    if (fine?.value) {
      paymentData.fine = { value: fine.value }
    }

    // Create payment in Asaas
    const payment = await asaas.createPayment(paymentData)

    // Get payment links based on billing type
    const paymentLinks: {
      invoiceUrl?: string
      bankSlipUrl?: string
      pixQrCode?: { encodedImage: string; payload: string }
    } = {}

    if (billingType === "PIX") {
      try {
        const pixData = await asaas.getPaymentPixQrCode(payment.id)
        paymentLinks.pixQrCode = pixData
      } catch {
        console.log("Could not get PIX QR code yet")
      }
    }

    if (billingType === "BOLETO") {
      try {
        const boletoData = await asaas.getPaymentBankSlip(payment.id)
        paymentLinks.bankSlipUrl = boletoData.url
      } catch {
        console.log("Could not get bank slip yet")
      }
    }

    // Save to local invoices table
    await supabase.from("invoices").insert({
      asaas_id: payment.id,
      client_id: clientId,
      amount: value,
      due_date: dueDate,
      status: "pending",
      description: paymentData.description,
    })

    return NextResponse.json({
      success: true,
      payment: {
        id: payment.id,
        value: payment.value,
        status: payment.status,
        billingType: payment.billingType,
        dueDate: payment.dueDate,
        invoiceUrl: payment.invoiceUrl,
        ...paymentLinks,
      },
    })
  } catch (error) {
    console.error("Error creating charge:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar cobrança" },
      { status: 500 }
    )
  }
}

// DELETE - Cancel a payment
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const paymentId = searchParams.get("payment_id")

    if (!paymentId) {
      return NextResponse.json({ error: "payment_id é obrigatório" }, { status: 400 })
    }

    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .single()

    if (!integration) {
      return NextResponse.json({ error: "Integração Asaas não ativa" }, { status: 400 })
    }

    const asaas = createAsaasService(integration.credentials)
    await asaas.cancelPayment(paymentId)

    // Update local invoice
    await supabase
      .from("invoices")
      .update({ status: "cancelled" })
      .eq("asaas_id", paymentId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error canceling payment:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao cancelar cobrança" },
      { status: 500 }
    )
  }
}
