import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("ClientContracts")

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    const { client_id, plan_name, monthly_value, start_date, end_date, status, notes, document_url } = body

    if (!client_id || !plan_name || monthly_value === null || monthly_value === undefined || !start_date || !status) {
      throw new AppError("Campos obrigatórios: client_id, plan_name, monthly_value, start_date, status", 400)
    }

    const validStatuses = ["active", "expired", "cancelled", "pending"]
    if (!validStatuses.includes(status)) {
      throw new AppError(`Status inválido. Use: ${validStatuses.join(", ")}`, 400)
    }

    if (Number(monthly_value) < 0) {
      throw new AppError("Valor mensal não pode ser negativo", 400)
    }

    // Verify user has access to this client (RLS enforced)
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", client_id)
      .single()

    if (clientError || !client) {
      throw new AppError("Cliente não encontrado ou acesso negado", 404)
    }

    const { data: contract, error: insertError } = await supabase
      .from("contracts")
      .insert({
        client_id,
        plan_name,
        monthly_value: Number(monthly_value),
        start_date,
        end_date: end_date || null,
        status,
        notes: notes || null,
        document_url: document_url || null,
      })
      .select()
      .single()

    if (insertError) {
      log.error("Failed to create contract", insertError)
      throw new AppError("Erro ao criar contrato", 500)
    }

    return successResponse(request, contract, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "ClientContracts")
  }
}
