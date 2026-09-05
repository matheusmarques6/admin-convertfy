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
  chargeStoreIds,
  isMissingClassificationColumn,
  isMissingStoreIdsColumn,
  parseChargeClassification,
  stripStoreIds,
} from "@/lib/services/charge-classification"
import { ensureAsaasInvoiceMirror } from "@/lib/services/asaas-invoice-mirror"
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
    let { data: row } = await query.limit(1).maybeSingle()
    // Pagamento do Asaas ainda sem espelho local (a assinatura acabou de
    // gerar): o espelho nasce agora, em vez de mandar o usuário sincronizar.
    if (!row && source === "asaas" && id.startsWith("pay_")) {
      const mirrored = await ensureAsaasInvoiceMirror(admin, orgId, id)
      if (mirrored) row = { id: mirrored.id, client_id: mirrored.client_id }
    }
    if (!row) {
      throw new AppError(
        source === "asaas"
          ? "Fatura não encontrada no Asaas nem localmente — confira o pagamento e tente de novo."
          : "Cobrança não encontrada",
        404,
        "not-found",
      )
    }
    const { data: client } = await admin.from("clients").select("id, org_id").eq("id", row.client_id).maybeSingle()
    if (!client || client.org_id !== orgId) throw new AppError("Cobrança não encontrada", 404, "not-found")

    const storeIds = chargeStoreIds(classification)
    if (storeIds.length > 0) {
      const { data: stores } = await admin
        .from("client_stores")
        .select("id, client_id")
        .in("id", storeIds)
      const ok = new Set((stores ?? []).filter((s) => s.client_id === row.client_id).map((s) => s.id))
      if (storeIds.some((s) => !ok.has(s))) {
        throw new AppError("Alguma loja informada não pertence a este cliente", 422, "validation-error")
      }
    }

    const patch = { ...classification, updated_at: new Date().toISOString() }
    let upd = await admin
      .from(table)
      .update(patch)
      .eq("id", row.id)
      .select("id, charge_type, reference_months, store_id, store_ids")
      .single()
    if (upd.error && isMissingStoreIdsColumn(upd.error)) {
      // migration 20261118 pendente: grava sem store_ids (loja única em
      // store_id). Várias lojas não têm onde morar — avisa em vez de
      // gravar "sem loja" em silêncio.
      if ((classification.store_ids?.length ?? 0) > 1) {
        throw new AppError(
          "Cobrança com várias lojas indisponível — aplique a migration 20261118_cobranca_multi_loja.",
          422,
          "validation-error",
        )
      }
      upd = await admin
        .from(table)
        .update(stripStoreIds(patch))
        .eq("id", row.id)
        .select("id, charge_type, reference_months, store_id")
        .single()
    }
    const { data, error } = upd
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
