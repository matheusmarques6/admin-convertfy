/**
 * Conversão automática lead → cliente no ganho.
 *
 * Venda ganha sem cliente vinculado deixava o pós-venda manco: sem
 * client_id não há cash collect automático, nem onboarding, nem loja.
 * Este service fecha o ciclo: cria (ou acha por email) o cliente a
 * partir do LEAD do negócio, vincula ao deal e marca o lead como
 * convertido.
 *
 * Chamado: (a) automaticamente quando o deal vira won (rota de move e
 * bulk), (b) pelo botão "Vincular cliente" do painel de vendas do
 * funil, para vendas antigas. Fail-open no caminho (a): vincular
 * cliente nunca pode impedir o ganho.
 */

import type { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("CrmClientLink")

type Admin = ReturnType<typeof createAdminClient>

export interface EnsureClientResult {
  client_id: string | null
  /** true quando um cliente NOVO foi criado (false = já existia/foi achado). */
  created: boolean
  /** true quando o deal foi atualizado nesta chamada. */
  linked: boolean
  reason?: "already_linked" | "no_lead" | "lead_not_found"
}

export async function ensureClientForDeal(
  admin: Admin,
  dealId: string,
): Promise<EnsureClientResult> {
  const { data: deal } = await admin
    .from("deals")
    .select("id, title, client_id, lead_id, owner_id")
    .eq("id", dealId)
    .maybeSingle()

  if (!deal) return { client_id: null, created: false, linked: false, reason: "lead_not_found" }
  if (deal.client_id) {
    return { client_id: deal.client_id, created: false, linked: false, reason: "already_linked" }
  }
  if (!deal.lead_id) {
    return { client_id: null, created: false, linked: false, reason: "no_lead" }
  }

  const { data: lead } = await admin
    .from("crm_leads")
    .select("id, name, email, phone, company, status, converted_to_deal_id")
    .eq("id", deal.lead_id)
    .maybeSingle()
  if (!lead) {
    return { client_id: null, created: false, linked: false, reason: "lead_not_found" }
  }

  // Reusa cliente existente com o mesmo email — venda nova de um
  // cliente conhecido não pode duplicar o cadastro.
  let clientId: string | null = null
  let created = false
  if (lead.email?.trim()) {
    const { data: existing } = await admin
      .from("clients")
      .select("id")
      .ilike("email", lead.email.trim())
      .limit(1)
      .maybeSingle()
    clientId = existing?.id ?? null
  }

  if (!clientId) {
    const { data: client, error } = await admin
      .from("clients")
      .insert({
        name: lead.name,
        email: lead.email?.trim() || null,
        phone: lead.phone || null,
        company: lead.company || null,
        // Venda ganha = cliente ativo (não prospect).
        status: "active",
        owner_id: deal.owner_id ?? null,
      })
      .select("id")
      .single()
    if (error || !client) {
      log.error("[ClientLink] falha ao criar cliente", { dealId, error: error?.message })
      return { client_id: null, created: false, linked: false }
    }
    clientId = client.id
    created = true
  }

  const { error: linkErr } = await admin
    .from("deals")
    .update({ client_id: clientId })
    .eq("id", dealId)
  if (linkErr) {
    log.error("[ClientLink] falha ao vincular deal", { dealId, error: linkErr.message })
    return { client_id: clientId, created, linked: false }
  }

  // Lead vira convertido; converted_to_deal_id só preenche se vazio
  // (merge/conversão anterior não é sobrescrita).
  await admin.from("crm_leads").update({ status: "converted" }).eq("id", lead.id)
  if (!lead.converted_to_deal_id) {
    await admin
      .from("crm_leads")
      .update({ converted_to_deal_id: dealId })
      .eq("id", lead.id)
      .is("converted_to_deal_id", null)
  }

  await admin.from("crm_deal_activities").insert({
    deal_id: dealId,
    type: "system",
    content: created
      ? `Cliente "${lead.name}" criado e vinculado automaticamente (lead convertido)`
      : `Cliente existente vinculado automaticamente pelo email do lead`,
    created_by: deal.owner_id ?? null,
    is_internal: true,
  })

  log.info("[ClientLink] vinculado", { dealId, clientId, created })
  return { client_id: clientId, created, linked: true }
}
