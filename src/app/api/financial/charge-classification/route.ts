/**
 * PUT /api/financial/charge-classification — reclassifica uma cobrança
 * já existente (tipo, meses de referência, loja), venha ela do Asaas
 * (`invoices`, endereçada pelo id do payment) ou do financeiro local
 * (`client_charges`).
 *
 * Existe porque a classificação nasceu DEPOIS das cobranças: as 67
 * faturas do Asaas e as locais antigas foram classificadas por regex
 * na migration 20261113 e o financeiro precisa corrigir à mão o que a
 * regex errou ("Fatura - Vivazz" era comissão).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireOrgRoles, FINANCIAL_REPORT_ROLES } from "@/lib/api/require-org-admin"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  isMissingClassificationColumn,
  parseChargeClassification,
} from "@/lib/services/charge-classification"
import { logger } from "@/lib/logger"

const log = logger.child("ChargeClassification")

export const dynamic = "force-dynamic"

export async function PUT(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    await requireOrgRoles(user.id, FINANCIAL_REPORT_ROLES)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const source = body.source
    const id = typeof body.id === "string" ? body.id : ""
    if ((source !== "asaas" && source !== "local") || !id) {
      throw new AppError("source (asaas|local) e id são obrigatórios", 400, "validation-error")
    }
    const classification = parseChargeClassification(body)
    if (Object.keys(classification).length === 0) {
      throw new AppError("Nada para atualizar", 400, "validation-error")
    }

    // Localiza a linha e o cliente dela — a loja precisa ser desse cliente
    // e o cliente precisa ser da org de quem edita (admin client bypassa RLS).
    const table = source === "asaas" ? "invoices" : "client_charges"
    let query = admin.from(table).select("id, client_id")
    query = source === "asaas" ? query.or(`asaas_id.eq.${id},id.eq.${id}`) : query.eq("id", id)
    const { data: row } = await query.limit(1).maybeSingle()
    if (!row) {
      throw new AppError(
        source === "asaas"
          ? "Fatura ainda não sincronizada localmente — sincronize o Asaas e tente de novo."
          : "Cobrança não encontrada",
        404,
        "not-found",
      )
    }
    const { data: client } = await admin.from("clients").select("id, org_id").eq("id", row.client_id).maybeSingle()
    if (!client || client.org_id !== orgId) throw new AppError("Cobrança não encontrada", 404, "not-found")

    if (classification.store_id) {
      const { data: store } = await admin
        .from("client_stores")
        .select("id, client_id")
        .eq("id", classification.store_id)
        .maybeSingle()
      if (!store || store.client_id !== row.client_id) {
        throw new AppError("A loja informada não pertence a este cliente", 422, "validation-error")
      }
    }

    const { data, error } = await admin
      .from(table)
      .update({ ...classification, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .select("id, charge_type, reference_months, store_id")
      .single()
    if (error) {
      if (isMissingClassificationColumn(error)) {
        throw new AppError(
          "Classificação de cobrança indisponível — aplique a migration 20261113_cobranca_tipo_meses_lojas.",
          422,
          "validation-error",
        )
      }
      throw error
    }

    log.info("cobrança reclassificada", { source, id: row.id, ...classification })
    return successResponse(request, { success: true, charge: data })
  } catch (error) {
    return errorResponse(request, error, "charge-classification")
  }
}
