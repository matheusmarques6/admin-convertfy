/**
 * Conversão automática lead → cliente no ganho.
 *
 * Venda ganha sem cliente vinculado deixava o pós-venda manco: sem
 * client_id não há cash collect automático, nem onboarding, nem loja.
 * Este service fecha o ciclo: cria (ou acha por email NA MESMA org) o
 * cliente a partir do LEAD do negócio, vincula ao deal e marca o lead
 * como convertido.
 *
 * Org do cliente (clients.org_id é NOT NULL): cascata owner do deal →
 * assigned_to/created_by do lead → org do operador (fallbackOrgId, vem
 * da rota autenticada). Sem org resolvida NÃO insere — devolve
 * reason 'no_org' pra rota explicar em vez de estourar 23502.
 *
 * Chamado: (a) automaticamente quando o deal vira won (rota de move e
 * bulk), (b) pelo botão "Vincular cliente" do painel de vendas do
 * funil, (c) pelo fechamento (billing). Fail-open no caminho (a):
 * vincular cliente nunca pode impedir o ganho.
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
  reason?: "already_linked" | "no_lead" | "lead_not_found" | "no_org"
}

async function orgOfProfile(admin: Admin, profileId: string | null | undefined): Promise<string | null> {
  if (!profileId) return null
  const { data } = await admin
    .from("org_members")
    .select("org_id")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
  return data?.org_id ?? null
}

export async function ensureClientForDeal(
  admin: Admin,
  dealId: string,
  opts: { fallbackOrgId?: string | null } = {},
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
    .select("id, name, email, phone, company, status, converted_to_deal_id, assigned_to, created_by")
    .eq("id", deal.lead_id)
    .maybeSingle()
  if (!lead) {
    return { client_id: null, created: false, linked: false, reason: "lead_not_found" }
  }

  // Org do cliente — SEM ela o cliente não aparece nas telas do
  // operacional (que filtram por org) e o insert quebra (NOT NULL).
  const orgId =
    (await orgOfProfile(admin, deal.owner_id)) ??
    (await orgOfProfile(admin, lead.assigned_to)) ??
    (await orgOfProfile(admin, lead.created_by)) ??
    opts.fallbackOrgId ??
    null
  if (!orgId) {
    log.error("[ClientLink] org não resolvida — vínculo abortado", { dealId })
    return { client_id: null, created: false, linked: false, reason: "no_org" }
  }

  // Reusa cliente existente com o mesmo email NA MESMA org — venda nova
  // de um cliente conhecido não duplica o cadastro, e cliente de OUTRA
  // org nunca é sequestrado (loja/onboarding nasceriam cruzados).
  let clientId: string | null = null
  let created = false
  const email = lead.email?.trim() || null
  if (email) {
    const { data: match } = await admin
      .from("clients")
      .select("id")
      .eq("org_id", orgId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle()
    clientId = match?.id ?? null
  }

  if (!clientId) {
    const insertPayload = {
      org_id: orgId,
      name: lead.name,
      email,
      phone: lead.phone || null,
      company: lead.company || null,
      // Venda ganha = cliente ativo (não prospect).
      status: "active",
      owner_id: deal.owner_id ?? null,
    }

    let { data: client, error } = await admin
      .from("clients")
      .insert(insertPayload)
      .select("id")
      .single()

    // UNIQUE (org_id, lower(email)): outra chamada criou no meio do
    // caminho (move + billing correm juntos) — acha e reusa.
    if (error?.code === "23505" && email) {
      const { data: existing } = await admin
        .from("clients")
        .select("id")
        .eq("org_id", orgId)
        .ilike("email", email)
        .limit(1)
        .maybeSingle()
      if (existing) {
        client = existing
        error = null
      }
    }
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
