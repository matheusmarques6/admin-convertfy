import { NextResponse } from "next/server"
import { requireAuth, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { logger } from "@/lib/logger"
import { stripBrazilCountryCode } from "@/lib/utils/phone"

const log = logger.child("IntegrationsAsaasCustomersUpdate")

interface UpdateCustomerBody {
  clientId: string
}

// PATCH - Update an existing customer in Asaas
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const body: UpdateCustomerBody = await request.json()

    if (!body.clientId) {
      throw new AppError("clientId é obrigatório", 400)
    }

    // Fetch client with org_id scoping (multi-tenant security)
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", body.clientId)
      .eq("org_id", orgId)
      .single()

    if (clientError || !client) {
      throw new AppError("Cliente não encontrado", 404)
    }

    // Extract asaas_customer_id from custom_fields
    const customFields = (client.custom_fields as Record<string, unknown>) || {}
    const asaasCustomerId = customFields.asaas_customer_id as string | undefined

    if (!asaasCustomerId) {
      throw new AppError("Cliente não possui ID do Asaas vinculado", 400)
    }

    // Fetch active Asaas integration for org
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("id, credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .eq("org_id", orgId)
      .single()

    if (intError || !integration) {
      throw new AppError("Integração Asaas não encontrada ou inativa. Configure a integração primeiro.", 400)
    }

    const asaas = createAsaasService(decryptCredentialsJson(integration.credentials))

    // Extract address from custom_fields
    const addressData = (customFields.address as Record<string, string>) || {}

    // Sanitize inputs: strip non-digits from cpfCnpj, phone, postalCode
    const cleanCpfCnpj = client.cpf_cnpj?.replace(/\D/g, "") || undefined
    const cleanPhone = stripBrazilCountryCode(client.phone)
    const cleanPostalCode = addressData.postal_code?.replace(/\D/g, "") || undefined

    // Build payload with ALL syncable fields (no diff computation)
    const payload: Record<string, unknown> = {
      name: client.name || undefined,
      email: client.email || undefined,
      cpfCnpj: cleanCpfCnpj,
      phone: cleanPhone,
      mobilePhone: cleanPhone,
      address: addressData.street || undefined,
      addressNumber: addressData.number || undefined,
      complement: addressData.complement || undefined,
      province: addressData.neighborhood || undefined,
      postalCode: cleanPostalCode,
    }

    // Remove undefined values
    const cleanPayload = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v !== undefined)
    )

    const customer = await asaas.updateCustomer(asaasCustomerId, cleanPayload)

    return NextResponse.json({
      success: true,
      customer,
    })
  } catch (error) {
    log.error("Error updating Asaas customer:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao atualizar cliente no Asaas",
      },
      { status: error instanceof AppError ? error.statusCode : 500 }
    )
  }
}
