/**
 * Faturas do Asaas sem dono — a triagem do Financeiro.
 *
 * GET  → lista as cobranças que entraram no espelho sem cliente
 *        identificado, com o pagador do Asaas para o humano decidir.
 * PUT  → vincula uma delas a um cliente.
 *
 * Por que existem: `resolveClientForPayment` só acha quem já tem
 * `custom_fields.asaas_customer_id` gravado. Quem nunca foi vinculado
 * nunca é achado, e a cobrança dele não entrava em lugar nenhum —
 * `invoices.client_id` era NOT NULL e o INSERT morria (167 pagamentos
 * fora da carteira numa rodada, 10/09/2026). Agora a fatura ENTRA sem
 * dono e vem parar aqui, porque a carteira existe para mostrar esse
 * dinheiro.
 *
 * Vincular também ENSINA o sistema: o `asaas_customer_id` é gravado no
 * cliente escolhido, então as próximas cobranças do mesmo pagador são
 * resolvidas sozinhas e a fila só encolhe.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireOrgRoles, FINANCIAL_REPORT_ROLES } from "@/lib/api/require-org-admin"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("InvoiceClientTriage")

export const dynamic = "force-dynamic"

/** Migration 20261137 pendente — padrão local do repo, não há helper único. */
const SCHEMA_AUSENTE = new Set(["42P01", "42703", "PGRST204", "PGRST205"])

/** Teto da fila na tela: acima disso o problema é de cadastro, não de triagem. */
const LIMITE = 200

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    await requireOrgRoles(user.id, FINANCIAL_REPORT_ROLES)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("invoices")
      .select("id, asaas_id, asaas_customer_id, amount, due_date, payment_date, status, description")
      // `org_id IS NULL` entra de propósito: a fatura sem cliente também
      // pode ficar sem org (webhook com mais de uma integração ativa, ou
      // linha gravada por um build anterior a esta coluna). Filtrar só
      // pela org faria justamente a órfã sumir da fila que existe para
      // ela — o mesmo dinheiro invisível, uma camada acima. Com uma org,
      // que é o caso aqui, não há ambiguidade; com várias, a linha sem
      // org aparece para todas até alguém decidir de quem é.
      .or(`org_id.eq.${orgId},org_id.is.null`)
      .is("client_id", null)
      .order("due_date", { ascending: false })
      .limit(LIMITE)

    if (error) {
      // Migration 20261137 pendente: a triagem não existe ainda, e dizer
      // isso é melhor que 500 numa tela que abriria vazia de qualquer jeito.
      if (SCHEMA_AUSENTE.has(error.code)) {
        return successResponse(request, { faturas: [], schema_missing: true })
      }
      throw error
    }

    return successResponse(request, { faturas: data ?? [], schema_missing: false })
  } catch (error) {
    return errorResponse(request, error, "financial-invoice-client-list")
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    await requireOrgRoles(user.id, FINANCIAL_REPORT_ROLES)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const invoiceId = typeof body.invoice_id === "string" ? body.invoice_id : ""
    const clientId = typeof body.client_id === "string" ? body.client_id : ""
    if (!invoiceId || !clientId) {
      throw new AppError("invoice_id e client_id são obrigatórios", 400, "validation-error")
    }

    // A fatura tem de ser desta org e ainda estar sem dono: vincular a
    // que já tem cliente seria TROCAR o dono de uma cobrança, o que é
    // outra decisão e não passa por aqui.
    const { data: fatura } = await admin
      .from("invoices")
      .select("id, client_id, asaas_customer_id, org_id")
      .eq("id", invoiceId)
      // Mesmo motivo do GET: a órfã sem org tem de poder ser resolvida,
      // senão ela fica visível na fila e imune ao botão que a tiraria de lá.
      .or(`org_id.eq.${orgId},org_id.is.null`)
      .maybeSingle<{
        id: string
        client_id: string | null
        asaas_customer_id: string | null
        org_id: string | null
      }>()
    if (!fatura) throw new AppError("Fatura não encontrada nesta organização", 404, "not-found")
    if (fatura.client_id) {
      throw new AppError("Esta fatura já tem cliente", 422, "already-linked")
    }

    const { data: cliente } = await admin
      .from("clients")
      .select("id, custom_fields")
      .eq("id", clientId)
      .eq("org_id", orgId)
      .maybeSingle<{ id: string; custom_fields: Record<string, unknown> | null }>()
    if (!cliente) throw new AppError("Cliente não encontrado nesta organização", 404, "not-found")

    // O vínculo carimba a org junto: a linha deixa de depender de quem
    // a criou para ter escopo.
    const { error: upErr } = await admin
      .from("invoices")
      .update({ client_id: clientId, org_id: fatura.org_id ?? orgId })
      .eq("id", invoiceId)
    if (upErr) throw upErr

    // Ensinar o vínculo: as próximas cobranças deste pagador passam a ser
    // resolvidas sozinhas. Best-effort — a fatura já está vinculada, e
    // falhar aqui não pode desfazer o que o operador acabou de decidir.
    let ensinou = false
    if (fatura.asaas_customer_id) {
      const { error: cliErr } = await admin
        .from("clients")
        .update({
          custom_fields: {
            ...(cliente.custom_fields ?? {}),
            asaas_customer_id: fatura.asaas_customer_id,
          },
        })
        .eq("id", clientId)
      if (cliErr) log.warn("vínculo gravado na fatura, não no cliente", { erro: cliErr.message })
      else ensinou = true
    }

    // As outras cobranças do MESMO pagador seguem o destino desta: é o
    // ponto do "vincular uma ensina as próximas", aplicado ao que já está
    // na fila em vez de só ao futuro.
    let irmas = 0
    if (fatura.asaas_customer_id) {
      const { data: outras } = await admin
        .from("invoices")
        .update({ client_id: clientId, org_id: fatura.org_id ?? orgId })
        .or(`org_id.eq.${orgId},org_id.is.null`)
        .is("client_id", null)
        .eq("asaas_customer_id", fatura.asaas_customer_id)
        .select("id")
      irmas = outras?.length ?? 0
    }

    log.info("fatura vinculada", { invoice_id: invoiceId, client_id: clientId, irmas, ensinou })
    return successResponse(request, { ok: true, irmas, ensinou })
  } catch (error) {
    return errorResponse(request, error, "financial-invoice-client-link")
  }
}
