import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"

// GET - Get subscriptions for a client
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const clientId = searchParams.get("client_id")

    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .single()

    if (!integration) {
      return NextResponse.json({ error: "Integração Asaas não ativa" }, { status: 400 })
    }

    // Get asaas_customer_id from client
    let asaasCustomerId: string | undefined

    if (clientId) {
      const { data: client } = await supabase
        .from("clients")
        .select("custom_fields")
        .eq("id", clientId)
        .single()

      asaasCustomerId = (client?.custom_fields as Record<string, string>)?.asaas_customer_id
    }

    if (!asaasCustomerId) {
      return NextResponse.json({
        success: true,
        subscriptions: [],
        message: "Cliente não possui ID Asaas vinculado"
      })
    }

    // Fetch subscriptions from Asaas
    const response = await fetch(
      `https://api.asaas.com/v3/subscriptions?customer=${asaasCustomerId}`,
      {
        headers: {
          "Content-Type": "application/json",
          access_token: integration.credentials.api_key,
        },
      }
    )

    if (!response.ok) {
      throw new Error("Erro ao buscar assinaturas")
    }

    const { data: subscriptions } = await response.json()

    // Map subscription status
    const mappedSubscriptions = subscriptions?.map((sub: {
      id: string
      customer: string
      value: number
      status: string
      cycle: string
      nextDueDate: string
      description?: string
      billingType: string
    }) => ({
      id: sub.id,
      customer: sub.customer,
      value: sub.value,
      status: sub.status,
      statusLabel: getSubscriptionStatusLabel(sub.status),
      cycle: sub.cycle,
      cycleLabel: getCycleLabel(sub.cycle),
      nextDueDate: sub.nextDueDate,
      description: sub.description,
      billingType: sub.billingType,
      isActive: sub.status === "ACTIVE",
    })) || []

    return NextResponse.json({
      success: true,
      subscriptions: mappedSubscriptions,
      hasActiveSubscription: mappedSubscriptions.some((s: { isActive: boolean }) => s.isActive),
    })
  } catch (error) {
    console.error("Error fetching subscriptions:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao buscar assinaturas" },
      { status: 500 }
    )
  }
}

// POST - Create new subscription
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const body = await request.json()
    const { clientId, value, cycle, billingType, nextDueDate, description } = body

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
      .select("custom_fields")
      .eq("id", clientId)
      .single()

    const asaasCustomerId = (client?.custom_fields as Record<string, string>)?.asaas_customer_id

    if (!asaasCustomerId) {
      return NextResponse.json({ error: "Cliente não possui ID Asaas" }, { status: 400 })
    }

    const asaas = createAsaasService(integration.credentials)
    const subscription = await asaas.createSubscription({
      customer: asaasCustomerId,
      billingType,
      value,
      nextDueDate,
      cycle,
      description,
    })

    return NextResponse.json({
      success: true,
      subscription,
    })
  } catch (error) {
    console.error("Error creating subscription:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar assinatura" },
      { status: 500 }
    )
  }
}

function getSubscriptionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: "Ativa",
    INACTIVE: "Inativa",
    EXPIRED: "Expirada",
  }
  return labels[status] || status
}

function getCycleLabel(cycle: string): string {
  const labels: Record<string, string> = {
    WEEKLY: "Semanal",
    BIWEEKLY: "Quinzenal",
    MONTHLY: "Mensal",
    BIMONTHLY: "Bimestral",
    QUARTERLY: "Trimestral",
    SEMIANNUALLY: "Semestral",
    YEARLY: "Anual",
  }
  return labels[cycle] || cycle
}
