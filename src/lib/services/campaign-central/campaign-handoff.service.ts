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
  design_pipeline_id: string | null
  design_version: number | null
}

/** Estado da copy de produção da loja (sincroniza com copyStatusMeta da UI). */
function deriveStatus(entry: CopyResultEntry | null): CampaignHandoffStatus {
  if (!entry) return "missing"
  if (entry.status === "pending") return "pending"
  if (entry.status === "error") return "error"
  return "ready"
}

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Resolve a task ÂNCORA da etapa estrutura (versão atual) onde vive o
 * deliverable `figma_structure_link`. Compartilhado entre a leitura do
 * handoff e a escrita do link colado na Tela 2. Retorna null quando a
 * campanha ainda não tem pipeline/versão de design.
 */
async function resolveFigmaAnchorTaskId(
  admin: AdminClient,
  suggestionId: string,
  designPipelineId: string | null,
  designVersion: number | null,
): Promise<string | null> {
  if (!designPipelineId || designVersion == null) return null

  const { data: estruturaCol } = await admin
    .from("operational_pipeline_columns")
    .select("id")
    .eq("pipeline_id", designPipelineId)
    .eq("slug", "estrutura")
    .maybeSingle()
  if (!estruturaCol?.id) return null

  const { data: anchorTask } = await admin
    .from("tasks")
    .select("id")
    .eq("source_id", suggestionId)
    .eq("operational_column_id", estruturaCol.id as string)
    .eq("version", designVersion)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return (anchorTask?.id as string | null) ?? null
}

export async function getCampaignHandoff(
  suggestionId: string,
  orgId: string,
): Promise<CampaignHandoffPayload> {
  const admin = createAdminClient()

  const { data: sug } = await admin
    .from("campaign_suggestions")
    .select(
      "id, title, channel, send_date, subject, targets, copy_results, design_pilot_store_id, design_pipeline_id, design_version",
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

  // Link do Figma entregue na etapa estrutura (versão atual) — pro COO avaliar
  // na aprovação. Fica no deliverable figma_structure_link da task âncora.
  let figmaLink: string | null = null
  let figmaFilledAt: string | null = null
  const anchorTaskId = await resolveFigmaAnchorTaskId(
    admin,
    suggestionId,
    sug.design_pipeline_id,
    sug.design_version,
  )
  if (anchorTaskId) {
    const { data: figma } = await admin
      .from("task_deliverables")
      .select("value, filled_at")
      .eq("task_id", anchorTaskId)
      .eq("field_slug", "figma_structure_link")
      .maybeSingle()
    figmaLink = (figma?.value as string | null) ?? null
    figmaFilledAt = (figma?.filled_at as string | null) ?? null
  }

  return {
    suggestion_id: sug.id,
    title: sug.title ?? "",
    channel: sug.channel ?? "Email",
    send_date: sug.send_date ?? null,
    subject: sug.subject ?? null,
    pilot_store_id: sug.design_pilot_store_id ?? null,
    figma_link: figmaLink,
    figma_filled_at: figmaFilledAt,
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

/**
 * Persiste o link do Figma colado na Tela 2 no deliverable
 * `figma_structure_link` da task âncora — assim o link informado manualmente
 * pelo operador sobrevive ao reload e aparece pra todo o fluxo (incl. COO).
 *
 * Best-effort: se a campanha ainda não tem task âncora (sem pipeline de
 * design), retorna `persisted: false` sem erro — o import ainda roda com o
 * link em memória. Faz upsert manual (a linha pode já existir vazia).
 */
export async function setHandoffFigmaLink(
  suggestionId: string,
  orgId: string,
  link: string,
  userId: string,
): Promise<{ persisted: boolean }> {
  const admin = createAdminClient()

  const { data: sug } = await admin
    .from("campaign_suggestions")
    .select("id, design_pipeline_id, design_version")
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle<{
      id: string
      design_pipeline_id: string | null
      design_version: number | null
    }>()
  if (!sug) throw new NotFoundError("Campanha")

  const anchorTaskId = await resolveFigmaAnchorTaskId(
    admin,
    suggestionId,
    sug.design_pipeline_id,
    sug.design_version,
  )
  if (!anchorTaskId) return { persisted: false }

  const nowIso = new Date().toISOString()
  const { data: existing } = await admin
    .from("task_deliverables")
    .select("id")
    .eq("task_id", anchorTaskId)
    .eq("field_slug", "figma_structure_link")
    .maybeSingle()

  if (existing?.id) {
    const { error } = await admin
      .from("task_deliverables")
      .update({ value: link, filled_at: nowIso, filled_by: userId })
      .eq("id", existing.id as string)
    if (error) throw error
  } else {
    const { error } = await admin.from("task_deliverables").insert({
      task_id: anchorTaskId,
      field_slug: "figma_structure_link",
      field_label: "Link do Figma com a estrutura",
      field_type: "url",
      required: false,
      value: link,
      filled_at: nowIso,
      filled_by: userId,
    })
    if (error) throw error
  }

  log.info("handoff.figma_link_set", { suggestionId, anchorTaskId })
  return { persisted: true }
}
