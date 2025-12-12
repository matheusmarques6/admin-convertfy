import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"

// POST - Import customers from Asaas
export async function POST() {
  try {
    const supabase = await createClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    // Get Asaas integration credentials
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("*")
      .eq("type", "asaas")
      .eq("is_active", true)
      .single()

    if (intError || !integration) {
      return NextResponse.json(
        { error: "Integração Asaas não encontrada ou inativa. Configure a integração primeiro." },
        { status: 400 }
      )
    }

    const asaas = createAsaasService(integration.credentials)

    // Fetch all customers from Asaas (paginated)
    let offset = 0
    const limit = 100
    let allCustomers: Array<{
      id: string
      name: string
      email: string
      phone?: string
      cpfCnpj?: string
      company?: string
      address?: string
      addressNumber?: string
      complement?: string
      province?: string
      postalCode?: string
      city?: string
      state?: string
      externalReference?: string
    }> = []

    let hasMore = true
    while (hasMore) {
      const { data: customers, totalCount } = await asaas.listCustomers({ offset, limit })
      allCustomers = [...allCustomers, ...customers]
      offset += limit
      hasMore = offset < totalCount
    }

    let imported = 0
    let updated = 0
    let errors = 0

    for (const customer of allCustomers) {
      try {
        // Check if client already exists by asaas_customer_id or email
        const { data: existingByAsaas } = await supabase
          .from("clients")
          .select("id")
          .eq("asaas_customer_id", customer.id)
          .single()

        const { data: existingByEmail } = await supabase
          .from("clients")
          .select("id")
          .eq("email", customer.email)
          .single()

        const existingClient = existingByAsaas || existingByEmail

        const clientData = {
          name: customer.name,
          email: customer.email,
          phone: customer.phone || null,
          company: customer.company || null,
          cpf_cnpj: customer.cpfCnpj || null,
          asaas_customer_id: customer.id,
          address: customer.address ? {
            street: customer.address,
            number: customer.addressNumber,
            complement: customer.complement,
            neighborhood: customer.province,
            postal_code: customer.postalCode,
            city: customer.city,
            state: customer.state,
          } : null,
          status: "active" as const,
          health_score: 100,
          tags: [] as string[],
          custom_fields: {} as Record<string, unknown>,
        }

        if (existingClient) {
          // Update existing client
          await supabase
            .from("clients")
            .update({
              ...clientData,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingClient.id)
          updated++
        } else {
          // Create new client
          await supabase.from("clients").insert(clientData)
          imported++
        }
      } catch (err) {
        console.error(`Error importing customer ${customer.id}:`, err)
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
      message: `Importação concluída`,
      stats: {
        total: allCustomers.length,
        imported,
        updated,
        errors,
      },
    })
  } catch (error) {
    console.error("Error importing Asaas customers:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao importar clientes",
      },
      { status: 500 }
    )
  }
}

// GET - Get import status and customer count from Asaas
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    // Check if Asaas integration is active
    const { data: integration } = await supabase
      .from("integrations")
      .select("is_active, last_sync, credentials")
      .eq("type", "asaas")
      .single()

    if (!integration?.is_active) {
      return NextResponse.json({
        connected: false,
        asaasCustomers: 0,
        localClients: 0,
        syncedClients: 0,
      })
    }

    // Get customer count from Asaas
    const asaas = createAsaasService(integration.credentials)
    const { totalCount: asaasCustomers } = await asaas.listCustomers({ limit: 1 })

    // Get local client counts
    const { count: localClients } = await supabase
      .from("clients")
      .select("*", { count: "exact", head: true })

    const { count: syncedClients } = await supabase
      .from("clients")
      .select("*", { count: "exact", head: true })
      .not("asaas_customer_id", "is", null)

    return NextResponse.json({
      connected: true,
      lastSync: integration.last_sync,
      asaasCustomers,
      localClients: localClients || 0,
      syncedClients: syncedClients || 0,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    )
  }
}
