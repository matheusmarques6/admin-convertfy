import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationsAsaasCustomers")

// POST - Import customers from Asaas
export async function POST(_request: NextRequest) {
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
      throw new AppError("Integração Asaas não encontrada ou inativa. Configure a integração primeiro.", 400)
    }

    const asaas = createAsaasService(decryptCredentialsJson(integration.credentials))

    // Fetch all customers from Asaas (paginated)
    let offset = 0
    const limit = 100
    let allCustomers: Array<{
      id: string
      name: string
      email?: string
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
        // Check if client already exists by email
        const { data: existingClient } = await supabase
          .from("clients")
          .select("id, custom_fields")
          .eq("email", customer.email)
          .single()

        // Store Asaas data in custom_fields JSON column
        const asaasData = {
          asaas_customer_id: customer.id,
          cpf_cnpj: customer.cpfCnpj || null,
          asaas_address: customer.address || null,
          asaas_address_number: customer.addressNumber || null,
          asaas_complement: customer.complement || null,
          asaas_neighborhood: customer.province || null,
          asaas_postal_code: customer.postalCode || null,
          asaas_city: customer.city || null,
          asaas_state: customer.state || null,
        }

        if (existingClient) {
          // Update existing client - merge custom_fields
          const existingCustomFields = (existingClient.custom_fields as Record<string, unknown>) || {}
          const { error: updateError } = await supabase
            .from("clients")
            .update({
              name: customer.name,
              phone: customer.phone || null,
              company: customer.company || null,
              custom_fields: { ...existingCustomFields, ...asaasData },
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingClient.id)

          if (updateError) {
            log.error(`Error updating ${customer.email}:`, updateError.message)
            errors++
          } else {
            updated++
          }
        } else {
          // Create new client with basic fields
          const { error: insertError } = await supabase
            .from("clients")
            .insert({
              name: customer.name,
              email: customer.email,
              phone: customer.phone || null,
              company: customer.company || null,
              status: "active",
              health_score: 100,
              tags: [],
              custom_fields: asaasData,
            })

          if (insertError) {
            log.error(`Error inserting ${customer.email}:`, insertError.message)
            errors++
          } else {
            imported++
          }
        }
      } catch (err) {
        log.error(`Error importing customer ${customer.id}:`, err)
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
    log.error("Error importing Asaas customers:", error)
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
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    await requireAuth(supabase)

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
    const asaas = createAsaasService(decryptCredentialsJson(integration.credentials))
    const { totalCount: asaasCustomers } = await asaas.listCustomers({ limit: 1 })

    // Get local client counts
    const { count: localClients } = await supabase
      .from("clients")
      .select("*", { count: "exact", head: true })

    // Count clients that have asaas_customer_id in custom_fields
    const { data: allClients } = await supabase
      .from("clients")
      .select("custom_fields")

    const syncedClients = allClients?.filter(
      (c) => c.custom_fields && (c.custom_fields as Record<string, unknown>).asaas_customer_id
    ).length || 0

    return NextResponse.json({
      connected: true,
      lastSync: integration.last_sync,
      asaasCustomers,
      localClients: localClients || 0,
      syncedClients,
    })
  } catch (error) {
    return errorResponse(request, error, "IntegrationsAsaasCustomers")
  }
}
