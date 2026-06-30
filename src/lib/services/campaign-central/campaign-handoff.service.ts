/**
 * Painel "Copy da Campanha (Handoff)" — dados pro designer na etapa de design.
 *
 * Monta, a partir de uma `campaign_suggestion`, a lista de lojas com a copy de
 * PRODUÇÃO de cada uma (read-only) + status de geração ao vivo, e permite o
 * designer registrar qual loja usou como base (`design_pilot_store_id`).
 *
 * Só LEITURA da copy — a única escrita é a escolha da loja base.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { NotFoundError, ValidationError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import type {
  CampaignHandoffPayload,
  CampaignHandoffStatus,
  CampaignHandoffStore,
  CopyResultEntry,
  SuggestionTarget,
} from "@/types/campaign-central"

const log = logger.child("CampaignHandoff")

interface SugRow {
  id: string
  title: string | null
  channel: string | null
  send_date: string | null
  subject: string | null
  targets: SuggestionTarget[] | null
  copy_results: { production?: Record<string, CopyResultEntry> } | null
  design_pilot_store_id: string | null
}

/** Estado da copy de produção da loja (sincroniza com copyStatusMeta da UI). */
function deriveStatus(entry: CopyResultEntry | null): CampaignHandoffStatus {
  if (!entry) return "missing"
  if (entry.status === "pending") return "pending"
  if (entry.status === "error") return "error"
  return "ready"
}

export async function getCampaignHandoff(
  suggestionId: string,
  orgId: string,
): Promise<CampaignHandoffPayload> {
  const admin = createAdminClient()

  const { data: sug } = await admin
    .from("campaign_suggestions")
    .select(
      "id, title, channel, send_date, subject, targets, copy_results, design_pilot_store_id",
    )
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle<SugRow>()

  if (!sug) throw new NotFoundError("Campanha")

  const targets = sug.targets ?? []
  const production = sug.copy_results?.production ?? {}

  // Idioma/país atualizados das lojas (agrupamento por idioma na sidebar).
  const storeIds = targets.map((t) => t.store_id)
  const langByStore = new Map<string, string | null>()
  const countryByStore = new Map<string, string | null>()
  if (storeIds.length > 0) {
    const { data: stores } = await admin
      .from("client_stores")
      .select("id, language, country")
      .in("id", storeIds)
    for (const s of stores ?? []) {
      langByStore.set(s.id as string, (s.language as string | null) ?? null)
      countryByStore.set(s.id as string, (s.country as string | null) ?? null)
    }
  }

  const stores: CampaignHandoffStore[] = targets.map((t) => {
    const copy = production[t.store_id] ?? null
    return {
      store_id: t.store_id,
      store_name: t.store_name || "Loja",
      country: countryByStore.get(t.store_id) || t.country || "",
      language: langByStore.get(t.store_id) ?? null,
      status: deriveStatus(copy),
      copy,
    }
  })

  return {
    suggestion_id: sug.id,
    title: sug.title ?? "",
    channel: sug.channel ?? "Email",
    send_date: sug.send_date ?? null,
    subject: sug.subject ?? null,
    pilot_store_id: sug.design_pilot_store_id ?? null,
    stores,
  }
}

/** Designer registra a loja base da estrutura. Valida que a loja é da campanha. */
export async function setHandoffPilot(
  suggestionId: string,
  orgId: string,
  storeId: string,
): Promise<{ pilot_store_id: string }> {
  const admin = createAdminClient()

  const { data: sug } = await admin
    .from("campaign_suggestions")
    .select("id, targets")
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; targets: SuggestionTarget[] | null }>()

  if (!sug) throw new NotFoundError("Campanha")

  const targets = sug.targets ?? []
  if (!targets.some((t) => t.store_id === storeId)) {
    throw new ValidationError("Loja não pertence à campanha")
  }

  const { error } = await admin
    .from("campaign_suggestions")
    .update({ design_pilot_store_id: storeId })
    .eq("id", suggestionId)
    .eq("org_id", orgId)

  if (error) throw error
  log.info("handoff.pilot_set", { suggestionId, storeId })
  return { pilot_store_id: storeId }
}
