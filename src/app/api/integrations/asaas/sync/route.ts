import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import {
  isMissingClassificationColumn,
  stripClassification,
} from "@/lib/services/charge-classification"
import { buildInvoiceRowFromPayment, resolveClientForPayment } from "@/lib/services/asaas-invoice-mirror"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationsAsaasSync")

export async function POST() {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("id, credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .eq("org_id", orgId)
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
          .select("id, charge_type")
          .eq("asaas_id", payment.id)
          .single()

        // Cliente e linha vêm do módulo compartilhado com o webhook e o
        // espelho sob demanda (antes o fallback por customer lia a coluna
        // `clients.asaas_customer_id`, vazia — o dado mora em custom_fields).
        const clientId = await resolveClientForPayment(supabase, orgId, payment)
        const invoiceData = buildInvoiceRowFromPayment(
          payment,
          clientId,
          (existingInvoice as { charge_type?: string } | null)?.charge_type,
        )

        const write = async (row: Record<string, unknown>) =>
          existingInvoice
            ? supabase
                .from("invoices")
                .update({ ...row, updated_at: new Date().toISOString() })
                .eq("id", existingInvoice.id)
            : supabase.from("invoices").insert(row)

        let { error: wErr } = await write(invoiceData)
        if (wErr && isMissingClassificationColumn(wErr)) {
          ;({ error: wErr } = await write(stripClassification(invoiceData)))
        }
        if (wErr) throw wErr
        if (existingInvoice) updated++
        else synced++
      } catch (err) {
        log.error(`Error syncing payment ${payment.id}:`, err)
        errors++
      }
    }

    // Sync subscriptions Asaas -> client_subscriptions (stubs locais).
    // Pra cada cliente da org com asaas_customer_id, busca subscriptions
    // ativas no Asaas e cria/atualiza stub local linkado por
    // asaas_subscription_id (idempotente).
    let subsSynced = 0
    let subsUpdated = 0
    let subsErrors = 0
    try {
      const { data: clientsWithAsaas } = await supabase
        .from("clients")
        .select("id, custom_fields")
        .eq("org_id", orgId)
        .not("custom_fields->asaas_customer_id", "is", null)
      for (const c of clientsWithAsaas ?? []) {
        const asaasCust = (c.custom_fields as Record<string, string>)
          ?.asaas_customer_id
        if (!asaasCust) continue
        try {
          const env = (credentials.environment as string) || "sandbox"
          const baseUrl =
            env === "production"
              ? "https://api.asaas.com/v3"
              : "https://sandbox.asaas.com/api/v3"
          const resp = await fetch(
            `${baseUrl}/subscriptions?customer=${asaasCust}`,
            {
              headers: {
                "Content-Type": "application/json",
                access_token: credentials.api_key as string,
              },
            },
          )
          if (!resp.ok) continue
          const j = (await resp.json()) as {
            data?: Array<{
              id: string
              value: number
              status: string
              cycle?: string
              nextDueDate?: string
              dateCreated?: string
              description?: string
            }>
          }
          for (const sub of j.data ?? []) {
            const { data: existing } = await supabase
              .from("client_subscriptions")
              .select("id")
              .eq("client_id", c.id)
              .eq("asaas_subscription_id", sub.id)
              .maybeSingle()
            const payload = {
              client_id: c.id,
              name: sub.description ?? "Assinatura Asaas",
              value: Number(sub.value) || 0,
              cycle: sub.cycle ?? "MONTHLY",
              payment_method: "asaas",
              status:
                sub.status === "ACTIVE"
                  ? "active"
                  : sub.status.toLowerCase(),
              start_date:
                sub.dateCreated?.slice(0, 10) ??
                new Date().toISOString().slice(0, 10),
              next_due_date:
                sub.nextDueDate ??
                new Date().toISOString().slice(0, 10),
              asaas_subscription_id: sub.id,
            }
            if (existing) {
              await supabase
                .from("client_subscriptions")
                .update(payload)
                .eq("id", existing.id)
              subsUpdated++
            } else {
              await supabase.from("client_subscriptions").insert(payload)
              subsSynced++
            }
          }
        } catch (e) {
          subsErrors++
          log.warn(`Falha ao sincronizar subs do cliente ${c.id}`, e)
        }
      }
    } catch (e) {
      log.warn("Sync subscriptions Asaas (best-effort) falhou", e)
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
        subscriptions: {
          synced: subsSynced,
          updated: subsUpdated,
          errors: subsErrors,
        },
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
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const { data: integration } = await supabase
      .from("integrations")
      .select("last_sync, is_active")
      .eq("type", "asaas")
      .eq("org_id", orgId)
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
