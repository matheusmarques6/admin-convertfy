/**
 * Espelho local (`invoices`) de UM pagamento do Asaas, sob demanda.
 *
 * O Financeiro do cliente lista os pagamentos AO VIVO da API do Asaas
 * (inclusive os que a assinatura acabou de gerar), mas classificação,
 * comprovante e carteira moram na tabela `invoices` — que só o sync
 * preenchia. Classificar ou marcar pago um pagamento recém-nascido
 * dava "Fatura ainda não sincronizada localmente". Aqui o espelho
 * nasce na hora: busca o payment no Asaas, resolve o cliente pelo
 * `asaas_customer_id` (custom_fields) ou pelo externalReference e
 * insere a linha. Idempotente por asaas_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { createAsaasService, mapAsaasStatusToInternal } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { AppError } from "@/lib/api/errors"
import { isMissingClassificationColumn, stripClassification } from "@/lib/services/charge-classification"
import { logger } from "@/lib/logger"

const log = logger.child("AsaasInvoiceMirror")

export interface MirroredInvoice {
  id: string
  client_id: string | null
  created: boolean
}

export async function loadAsaasService(admin: SupabaseClient, orgId: string) {
  const { data: integration } = await admin
    .from("integrations")
    .select("credentials, is_active")
    .eq("type", "asaas")
    .eq("is_active", true)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!integration) throw new AppError("Integração Asaas não ativa", 400)
  return createAsaasService(decryptCredentialsJson(integration.credentials))
}

/**
 * Garante a linha em `invoices` para o payment. Devolve null quando o
 * payment não existe no Asaas (ou não é da org).
 */
export async function ensureAsaasInvoiceMirror(
  admin: SupabaseClient,
  orgId: string,
  paymentId: string,
): Promise<MirroredInvoice | null> {
  const { data: existing } = await admin
    .from("invoices")
    .select("id, client_id")
    .eq("asaas_id", paymentId)
    .maybeSingle()
  if (existing) {
    // Espelho de outra org não é "encontrado" — o admin client bypassa RLS.
    if (existing.client_id) {
      const { data: owner } = await admin.from("clients").select("org_id").eq("id", existing.client_id).maybeSingle()
      if (owner && owner.org_id !== orgId) return null
    }
    return { id: existing.id, client_id: existing.client_id, created: false }
  }

  const asaas = await loadAsaasService(admin, orgId)
  let payment
  try {
    payment = await asaas.getPayment(paymentId)
  } catch (err) {
    log.warn("payment não encontrado no Asaas", { paymentId, error: err instanceof Error ? err.message : String(err) })
    return null
  }

  // Cliente: externalReference (id do cliente) → asaas_customer_id
  let clientId: string | null = null
  if (payment.externalReference) {
    const { data } = await admin
      .from("clients")
      .select("id")
      .eq("id", payment.externalReference)
      .eq("org_id", orgId)
      .maybeSingle()
    clientId = data?.id ?? null
  }
  if (!clientId && payment.customer) {
    const { data } = await admin
      .from("clients")
      .select("id")
      .eq("org_id", orgId)
      .eq("custom_fields->>asaas_customer_id", payment.customer)
      .limit(1)
      .maybeSingle()
    clientId = data?.id ?? null
  }
  if (!clientId) {
    log.warn("payment sem cliente da org", { paymentId, customer: payment.customer })
    return null
  }

  const row: Record<string, unknown> = {
    asaas_id: payment.id,
    client_id: clientId,
    amount: payment.value,
    due_date: payment.dueDate,
    payment_date: payment.paymentDate || payment.clientPaymentDate || null,
    status: mapAsaasStatusToInternal(payment.status),
    description: payment.description || `Assinatura Asaas #${payment.id}`,
    ...(payment.subscription ? { asaas_subscription_id: payment.subscription, charge_type: "subscription" } : {}),
  }
  let ins = await admin.from("invoices").insert(row).select("id, client_id").single()
  if (ins.error && isMissingClassificationColumn(ins.error)) {
    ins = await admin.from("invoices").insert(stripClassification(row)).select("id, client_id").single()
  }
  if (ins.error) {
    // corrida com o sync: a linha acabou de nascer
    const { data: again } = await admin.from("invoices").select("id, client_id").eq("asaas_id", paymentId).maybeSingle()
    if (again) return { id: again.id, client_id: again.client_id, created: false }
    throw ins.error
  }
  log.info("espelho da fatura Asaas criado sob demanda", { paymentId, invoice_id: ins.data.id })
  return { id: ins.data.id, client_id: ins.data.client_id, created: true }
}
