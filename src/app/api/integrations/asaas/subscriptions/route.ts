import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { errorResponse, successResponse, requireAuth, AppError, ValidationError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { validateMonetaryValue } from "@/lib/schemas/common"
import { linkSubscriptionStores } from "@/lib/services/subscription-stores"
import { logger } from "@/lib/logger"

const log = logger.child("AsaasSubscriptions")

// GET - Get subscriptions for a client
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const clientId = request.nextUrl.searchParams.get("client_id")

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

    let asaasCustomerId: string | undefined
    if (clientId) {
      const { data: client } = await supabase.from("clients").select("custom_fields").eq("id", clientId).single()
      asaasCustomerId = (client?.custom_fields as Record<string, string>)?.asaas_customer_id
    }

    if (!asaasCustomerId) {
      return successResponse(request, { subscriptions: [], message: "Cliente não possui ID Asaas vinculado" })
    }

    const credentials = decryptCredentialsJson(integration.credentials)
    const environment = (credentials.environment as string) || "sandbox"
    const asaasBaseUrl = environment === "production"
      ? "https://api.asaas.com/v3"
      : "https://sandbox.asaas.com/api/v3"

    const response = await fetch(
      `${asaasBaseUrl}/subscriptions?customer=${asaasCustomerId}`,
      { headers: { "Content-Type": "application/json", access_token: credentials.api_key as string } }
    )

    if (!response.ok) {
      throw new AppError("Erro ao buscar assinaturas", 500)
    }

    const { data: subscriptions } = await response.json()

    const mappedSubscriptions = subscriptions?.map((sub: {
      id: string; customer: string; value: number; status: string;
      cycle: string; nextDueDate: string; description?: string; billingType: string;
    }) => ({
      id: sub.id, customer: sub.customer, value: sub.value, status: sub.status,
      statusLabel: getSubscriptionStatusLabel(sub.status), cycle: sub.cycle,
      cycleLabel: getCycleLabel(sub.cycle), nextDueDate: sub.nextDueDate,
      description: sub.description, billingType: sub.billingType,
      isActive: sub.status === "ACTIVE",
    })) || []

    return successResponse(request, {
      subscriptions: mappedSubscriptions,
      hasActiveSubscription: mappedSubscriptions.some((s: { isActive: boolean }) => s.isActive),
    })
  } catch (error) {
    return errorResponse(request, error, "AsaasSubscriptions GET")
  }
}

// POST - Create new subscription
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const body = await request.json()
    const { clientId, value, cycle, billingType, nextDueDate, description, storeIds } = body

    validateMonetaryValue(value)
    const stores: string[] = Array.isArray(storeIds)
      ? [...new Set((storeIds as unknown[]).filter((s): s is string => typeof s === "string"))]
      : []

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

    const { data: client } = await supabase.from("clients").select("custom_fields").eq("id", clientId).single()
    const asaasCustomerId = (client?.custom_fields as Record<string, string>)?.asaas_customer_id

    if (!asaasCustomerId) {
      throw new AppError("Cliente não possui ID Asaas", 400)
    }

    const asaas = createAsaasService(decryptCredentialsJson(integration.credentials))
    const subscription = await asaas.createSubscription({
      customer: asaasCustomerId, billingType, value, nextDueDate, cycle, description,
    })

    // Stub local IMEDIATO (o sync criaria o mesmo depois, idempotente
    // por asaas_subscription_id) — é o que permite vincular as lojas
    // agora, sem esperar a sincronização. Best-effort: a assinatura já
    // existe no Asaas.
    let localId: string | null = null
    let storesLinked = false
    try {
      const admin = createAdminClient()
      const { data: existing } = await admin
        .from("client_subscriptions")
        .select("id")
        .eq("client_id", clientId)
        .eq("asaas_subscription_id", subscription.id)
        .maybeSingle()
      if (existing) {
        localId = existing.id
      } else {
        const { data: stub, error } = await admin
          .from("client_subscriptions")
          .insert({
            client_id: clientId,
            name: description || "Assinatura Asaas",
            value: Number(value),
            cycle: cycle || "MONTHLY",
            payment_method: "asaas",
            status: "active",
            start_date: new Date().toISOString().slice(0, 10),
            next_due_date: subscription.nextDueDate ?? nextDueDate,
            asaas_subscription_id: subscription.id,
          })
          .select("id")
          .single()
        if (error) throw error
        localId = stub.id
      }
      if (localId && stores.length > 0) {
        const { data: own } = await admin.from("client_stores").select("id, client_id").in("id", stores)
        const valid = (own ?? []).filter((s) => s.client_id === clientId).map((s) => s.id)
        storesLinked = await linkSubscriptionStores(admin, localId, valid)
      }
    } catch (err) {
      log.warn("stub local da assinatura Asaas não criado", {
        subscriptionId: subscription.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    return successResponse(
      request,
      { subscription, local_subscription_id: localId, stores_linked: storesLinked },
      { status: 201 },
    )
  } catch (error) {
    return errorResponse(request, error, "AsaasSubscriptions POST")
  }
}

// DELETE - Cancel subscription
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const subscriptionId = request.nextUrl.searchParams.get("subscription_id")
    if (!subscriptionId) {
      throw new ValidationError("subscription_id é obrigatório")
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
    const result = await asaas.cancelSubscription(subscriptionId)

    return successResponse(request, { deleted: result.deleted })
  } catch (error) {
    return errorResponse(request, error, "AsaasSubscriptions DELETE")
  }
}

function getSubscriptionStatusLabel(status: string): string {
  const labels: Record<string, string> = { ACTIVE: "Ativa", INACTIVE: "Inativa", EXPIRED: "Expirada" }
  return labels[status] || status
}

function getCycleLabel(cycle: string): string {
  const labels: Record<string, string> = {
    WEEKLY: "Semanal", BIWEEKLY: "Quinzenal", MONTHLY: "Mensal",
    BIMONTHLY: "Bimestral", QUARTERLY: "Trimestral", SEMIANNUALLY: "Semestral", YEARLY: "Anual",
  }
  return labels[cycle] || cycle
}
