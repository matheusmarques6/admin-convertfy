import { NextResponse } from "next/server"
import { requireAuth, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { logger } from "@/lib/logger"
import { stripBrazilCountryCode } from "@/lib/utils/phone"

const log = logger.child("IntegrationsAsaasCustomersCreate")

interface CreateCustomerBody {
  name: string
  cpfCnpj: string
  email?: string
  phone?: string
  mobilePhone?: string
  address?: string
  addressNumber?: string
  complement?: string
  province?: string
  postalCode?: string
  externalReference?: string
  notificationDisabled?: boolean
}

// POST - Create a single customer in Asaas
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const body: CreateCustomerBody = await request.json()

    if (!body.name) {
      throw new AppError("Nome é obrigatório", 400)
    }

    if (!body.cpfCnpj) {
      throw new AppError("CPF/CNPJ é obrigatório", 400)
    }

    if (!body.email && !body.phone && !body.mobilePhone) {
      throw new AppError("Email ou telefone é obrigatório", 400)
    }

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

    // Check if customer already exists by cpfCnpj
    try {
      const existing = await asaas.listCustomers({ cpfCnpj: body.cpfCnpj, limit: 1 })
      if (existing.data && existing.data.length > 0) {
        // Customer already exists, return existing customer
        return NextResponse.json({
          success: true,
          customer: existing.data[0],
          message: "Cliente já existe no Asaas",
          alreadyExists: true,
        })
      }
    } catch {
      // Ignore search error and try to create
    }

    // Clean CPF/CNPJ (remove non-numeric characters)
    const cleanCpfCnpj = body.cpfCnpj.replace(/\D/g, "")

    // Clean phone numbers
    const cleanPhone = stripBrazilCountryCode(body.phone)
    const cleanMobilePhone = stripBrazilCountryCode(body.mobilePhone) || cleanPhone

    // Clean postal code
    const cleanPostalCode = body.postalCode?.replace(/\D/g, "") || undefined

    // Create customer in Asaas
    const customer = await asaas.createCustomer({
      name: body.name,
      cpfCnpj: cleanCpfCnpj,
      email: body.email || undefined,
      phone: cleanPhone,
      mobilePhone: cleanMobilePhone,
      address: body.address || undefined,
      addressNumber: body.addressNumber || undefined,
      complement: body.complement || undefined,
      province: body.province || undefined,
      postalCode: cleanPostalCode,
      externalReference: body.externalReference || undefined,
      notificationDisabled: body.notificationDisabled ?? false,
    })

    return NextResponse.json({
      success: true,
      customer,
      message: "Cliente criado no Asaas com sucesso",
    })
  } catch (error) {
    log.error("Error creating Asaas customer:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao criar cliente no Asaas",
      },
      { status: error instanceof AppError ? error.statusCode : 500 }
    )
  }
}
