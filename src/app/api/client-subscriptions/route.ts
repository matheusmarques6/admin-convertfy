import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireOrgRoles, FINANCIAL_REPORT_ROLES } from "@/lib/api/require-org-admin"
import { validateMonetaryValue } from "@/lib/schemas/common"
import { logger } from "@/lib/logger"

const log = logger.child("ClientSubscriptions")

// GET - Lista subscriptions filtradas por client_id (?client_id=xxx)
// Mergeia 2 fontes:
//  - Banco local (client_subscriptions) — assinaturas PIX direto/Wise/Manual
//  - Asaas API (via custom_fields.asaas_customer_id) — assinaturas Asaas
// Resilientes: se uma fonte falhar, retorna a outra.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const clientId = request.nextUrl.searchParams.get("client_id")
    if (!clientId) {
      throw new AppError("client_id query parameter is required", 400)
    }

    // 1. Local subs (admin pra contornar RLS de financeiro)
    const admin = createAdminClient()
    type LocalSub = {
      id: string
      client_id: string
      name: string
      value: number | string
      cycle: string
      payment_method: string
      status: string
      start_date: string
      next_due_date: string
      notes: string | null
      asaas_subscription_id: string | null
      source: "local"
    }
    let localSubs: LocalSub[] = []
    try {
      const res = await admin
        .from("client_subscriptions")
        .select(
          "id, client_id, name, value, cycle, payment_method, status, start_date, next_due_date, notes, asaas_subscription_id",
        )
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
      if (!res.error && res.data) {
        localSubs = (res.data as Omit<LocalSub, "source">[]).map((s) => ({
          ...s,
          source: "local",
        }))
      }
    } catch (e) {
      log.warn("local subs fetch failed", { e })
    }

    // 2. Asaas subs (chamada interna ao endpoint existente)
    // Como ja temos /api/integrations/asaas/subscriptions, fazemos fetch
    // server-to-server reaproveitando os cookies do user.
    type AsaasMapped = {
      id: string
      client_id: string
      name: string
      value: number | string
      cycle: string
      payment_method: string
      status: string
      start_date: string
      next_due_date: string
      notes: string | null
      asaas_subscription_id: string
      source: "asaas"
    }
    let asaasSubs: AsaasMapped[] = []
    try {
      // Pega asaas_customer_id do cliente
      const { data: client } = await admin
        .from("clients")
        .select("custom_fields, org_id")
        .eq("id", clientId)
        .maybeSingle()
      const asaasCustomerId = (client?.custom_fields as Record<string, string> | null)
        ?.asaas_customer_id
      if (asaasCustomerId && client?.org_id) {
        const { data: integration } = await admin
          .from("integrations")
          .select("credentials, is_active")
          .eq("type", "asaas")
          .eq("is_active", true)
          .eq("org_id", client.org_id)
          .maybeSingle()
        if (integration?.credentials) {
          const { decryptCredentialsJson } = await import("@/lib/crypto")
          const creds = decryptCredentialsJson(integration.credentials)
          const env = (creds.environment as string) || "sandbox"
          const baseUrl =
            env === "production"
              ? "https://api.asaas.com/v3"
              : "https://sandbox.asaas.com/api/v3"
          const resp = await fetch(
            `${baseUrl}/subscriptions?customer=${asaasCustomerId}`,
            {
              headers: {
                "Content-Type": "application/json",
                access_token: creds.api_key as string,
              },
            },
          )
          if (resp.ok) {
            const j = (await resp.json()) as {
              data?: Array<{
                id: string
                value: number
                status: string
                cycle: string
                nextDueDate: string
                description?: string
                billingType: string
                dateCreated?: string
              }>
            }
            asaasSubs = (j.data ?? []).map((s) => ({
              id: s.id,
              client_id: clientId,
              name: s.description ?? "Assinatura Asaas",
              value: s.value,
              cycle: s.cycle,
              payment_method:
                s.billingType === "UNDEFINED"
                  ? "asaas"
                  : (s.billingType?.toLowerCase() ?? "asaas"),
              status: s.status === "ACTIVE" ? "active" : s.status.toLowerCase(),
              start_date: s.dateCreated ?? s.nextDueDate,
              next_due_date: s.nextDueDate,
              notes: null,
              asaas_subscription_id: s.id,
              source: "asaas",
            }))
          }
        }
      }
    } catch (e) {
      log.warn("asaas subs fetch failed", { e, user: user.id })
    }

    // 3. Merge: descarta locais que ja estao mapeadas no Asaas
    //    (asaas_subscription_id == id da subscription Asaas)
    const asaasIdsLinked = new Set(
      localSubs.map((s) => s.asaas_subscription_id).filter(Boolean) as string[],
    )
    const asaasOnlyExtra = asaasSubs.filter(
      (s) => !asaasIdsLinked.has(s.asaas_subscription_id),
    )

    return successResponse(request, {
      subscriptions: [...localSubs, ...asaasOnlyExtra],
    })
  } catch (error) {
    return errorResponse(request, error, "ClientSubscriptions")
  }
}

// POST - Create a new subscription
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireOrgRoles(user.id, FINANCIAL_REPORT_ROLES)

    const body = await request.json()
    const { client_id, name, value, cycle, payment_method, status, start_date, next_due_date, notes } = body

    if (!client_id) {
      throw new AppError("client_id is required", 400)
    }
    if (!name || !value) {
      throw new AppError("name and value are required", 400)
    }

    validateMonetaryValue(value)

    const subscriptionData: Record<string, unknown> = {
      client_id,
      name,
      value,
      cycle: cycle || "MONTHLY",
      payment_method: payment_method || "pix_direto",
      status: status || "active",
      start_date: start_date || new Date().toISOString().split("T")[0],
      next_due_date: next_due_date || start_date || new Date().toISOString().split("T")[0],
      notes: notes || null,
    }

    const { data, error } = await supabase
      .from("client_subscriptions")
      .insert(subscriptionData)
      .select()
      .single()

    if (error) throw error

    log.info("Subscription created", { subscription_id: data.id, client_id })
    return successResponse(request, { success: true, subscription: data })
  } catch (error) {
    return errorResponse(request, error, "ClientSubscriptions")
  }
}

// DELETE - Delete a subscription by id
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireOrgRoles(user.id, FINANCIAL_REPORT_ROLES)

    const id = request.nextUrl.searchParams.get("id")

    if (!id) {
      throw new AppError("id query parameter is required", 400)
    }

    const { error } = await supabase
      .from("client_subscriptions")
      .delete()
      .eq("id", id)

    if (error) throw error

    log.info("Subscription deleted", { subscription_id: id })
    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "ClientSubscriptions")
  }
}

// PATCH - Cancel a subscription (set status to "cancelled")
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireOrgRoles(user.id, FINANCIAL_REPORT_ROLES)

    const body = await request.json()
    const { id } = body

    if (!id) {
      throw new AppError("id is required", 400)
    }

    const { data, error } = await supabase
      .from("client_subscriptions")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    log.info("Subscription cancelled", { subscription_id: id })
    return successResponse(request, { success: true, subscription: data })
  } catch (error) {
    return errorResponse(request, error, "ClientSubscriptions")
  }
}
