import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService, mapAsaasStatusToInternal } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationsAsaasSync")

export async function POST() {
  try {
    const supabase = await createClient()

    // Verify authentication
    await requireAuth(supabase)

    // Get Asaas integration credentials
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("id, credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .single()

    if (intError || !integration) {
      throw new AppError("Integração Asaas não encontrada ou inativa", 400)
    }

    const credentials = decryptCredentialsJson(integration.credentials)
    const asaas = createAsaasService(credentials)

    // Fetch payments from Asaas
    const { data: payments, totalCount } = await asaas.listPayments({ limit: 100 })

    let synced = 0
    let updated = 0
    let errors = 0

    for (const payment of payments) {
      try {
        // Check if invoice already exists
        const { data: existingInvoice } = await supabase
          .from("invoices")
          .select("id")
          .eq("asaas_id", payment.id)
          .single()

        const status = mapAsaasStatusToInternal(payment.status as never)

        // Try to find client by external reference
        let clientId = null
        if (payment.externalReference) {
          const { data: client } = await supabase
            .from("clients")
            .select("id")
            .eq("id", payment.externalReference)
            .single()
          clientId = client?.id
        }

        // If no client found by reference, try by Asaas customer ID
        if (!clientId && payment.customer) {
          const { data: client } = await supabase
            .from("clients")
            .select("id")
            .eq("asaas_customer_id", payment.customer)
            .single()
          clientId = client?.id
        }

        const invoiceData = {
          asaas_id: payment.id,
          client_id: clientId,
          amount: payment.value,
          due_date: payment.dueDate,
          payment_date: payment.paymentDate || payment.clientPaymentDate || null,
          status,
          description: payment.description || `Cobrança Asaas #${payment.id}`,
        }

        if (existingInvoice) {
          // Update existing invoice
          await supabase
            .from("invoices")
            .update({
              ...invoiceData,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingInvoice.id)
          updated++
        } else {
          // Create new invoice
          await supabase.from("invoices").insert(invoiceData)
          synced++
        }
      } catch (err) {
        log.error(`Error syncing payment ${payment.id}:`, err)
        errors++
      }
    }

    // Update last sync time
    await supabase
      .from("integrations")
      .update({ last_sync: new Date().toISOString() })
      .eq("id", integration.id)

    return NextResponse.json({
      success: true,
      message: `Sincronização concluída`,
      stats: {
        total: totalCount,
        synced,
        updated,
        errors,
      },
    })
  } catch (error) {
    log.error("Error syncing Asaas:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao sincronizar",
      },
      { status: 500 }
    )
  }
}

// GET - Get sync status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    await requireAuth(supabase)

    const { data: integration } = await supabase
      .from("integrations")
      .select("last_sync, is_active")
      .eq("type", "asaas")
      .single()

    // Get invoice stats
    const { data: invoices } = await supabase
      .from("invoices")
      .select("status, amount")
      .not("asaas_id", "is", null)

    const stats = {
      total: invoices?.length || 0,
      paid: invoices?.filter(i => i.status === "paid").reduce((sum, i) => sum + Number(i.amount), 0) || 0,
      pending: invoices?.filter(i => i.status === "pending").reduce((sum, i) => sum + Number(i.amount), 0) || 0,
      overdue: invoices?.filter(i => i.status === "overdue").reduce((sum, i) => sum + Number(i.amount), 0) || 0,
    }

    return NextResponse.json({
      connected: integration?.is_active || false,
      lastSync: integration?.last_sync,
      stats,
    })
  } catch (error) {
    return errorResponse(request, error, "IntegrationsAsaasSync")
  }
}
