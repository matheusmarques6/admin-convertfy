/**
 * Migra client_onboardings (legado) -> onboardings (pipeline v2).
 *
 * Mapeamento:
 *   current_phase -> coluna por slug:
 *     configuracao | pending_approval -> entrada
 *     briefing | generating_copies -> cliente_preenchendo_formulario
 *     setup_klaviyo | design -> preview_producao
 *     primeira_campanha | implementation -> emails_finais_em_producao
 *     go_live | in_progress -> implementacao
 *     feedback_30d | completed -> cliente_ativo
 *   status -> in_progress | completed | cancelled (com mapping)
 *   store_analysis -> form_responses
 *   generated_copies -> briefing (best-effort, mantem como esta)
 *
 * Idempotente: pula se ja existe onboarding pra esse (org_id, client_id, store_id).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { ensureOnboardingBootstrap } from "@/lib/services/onboarding-bootstrap.service"
import { logger } from "@/lib/logger"
import crypto from "crypto"

const log = logger.child("LegacyOnboardingMigration")

const PHASE_TO_SLUG: Record<string, string> = {
  configuracao: "entrada",
  pending_approval: "entrada",
  briefing: "cliente_preenchendo_formulario",
  generating_copies: "cliente_preenchendo_formulario",
  form_partially_filled: "cliente_preenchendo_formulario",
  setup_klaviyo: "preview_producao",
  design: "preview_producao",
  primeira_campanha: "emails_finais_em_producao",
  implementation: "emails_finais_em_producao",
  go_live: "implementacao",
  in_progress: "implementacao",
  feedback_30d: "cliente_ativo",
  completed: "cliente_ativo",
}

function mapStatus(s: string | null): "in_progress" | "completed" | "cancelled" {
  if (!s) return "in_progress"
  if (s === "completed") return "completed"
  if (s === "cancelled") return "cancelled"
  return "in_progress"
}

function randomToken(n = 32): string {
  return crypto.randomBytes(n).toString("hex").slice(0, n)
}

export interface MigrationResult {
  total_legacy: number
  migrated: number
  skipped_existing: number
  errors: number
  details: Array<{ legacy_id: string; status: "migrated" | "skipped" | "error"; reason?: string }>
}

export async function migrateLegacyOnboardings(): Promise<MigrationResult> {
  const admin = createAdminClient()
  const result: MigrationResult = {
    total_legacy: 0,
    migrated: 0,
    skipped_existing: 0,
    errors: 0,
    details: [],
  }

  // 1) Lista todos client_onboardings junto com org_id (via clients)
  const { data: legacy } = await admin
    .from("client_onboardings")
    .select(
      `id, client_id, store_id, status, current_phase, progress_percent,
       started_at, completed_at, created_at, store_analysis, generated_copies,
       client:clients(org_id)`,
    )
    .order("created_at", { ascending: true })

  type LegacyRow = {
    id: string
    client_id: string | null
    store_id: string | null
    status: string | null
    current_phase: string | null
    started_at: string | null
    completed_at: string | null
    created_at: string
    store_analysis: Record<string, unknown> | null
    generated_copies: Record<string, unknown> | null
    client: { org_id: string } | { org_id: string }[] | null
  }
  const rows = (legacy ?? []) as unknown as LegacyRow[]
  result.total_legacy = rows.length

  // 2) Bootstrap pipeline por org (usa Set pra evitar duplicar)
  const orgIds = new Set<string>()
  for (const r of rows) {
    const c = Array.isArray(r.client) ? r.client[0] : r.client
    if (c?.org_id) orgIds.add(c.org_id)
  }
  for (const orgId of orgIds) {
    try {
      await ensureOnboardingBootstrap(orgId, "00000000-0000-0000-0000-000000000000")
    } catch (e) {
      log.error("bootstrap failed", { orgId, err: (e as Error).message })
    }
  }

  // 3) Cache columns por pipeline + pipelines por org
  const pipelineByOrg = new Map<string, string>()
  const colsByPipeline = new Map<string, Array<{ id: string; slug: string }>>()
  for (const orgId of orgIds) {
    const { data: pipe } = await admin
      .from("operational_pipelines")
      .select("id")
      .eq("org_id", orgId)
      .eq("type", "onboarding")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if (!pipe) continue
    pipelineByOrg.set(orgId, pipe.id)
    const { data: cols } = await admin
      .from("operational_pipeline_columns")
      .select("id, slug")
      .eq("pipeline_id", pipe.id)
      .order("position", { ascending: true })
    colsByPipeline.set(pipe.id, (cols ?? []) as Array<{ id: string; slug: string }>)
  }

  // 4) Para cada legacy row, insere em onboardings (se nao existir)
  for (const r of rows) {
    const c = Array.isArray(r.client) ? r.client[0] : r.client
    if (!c?.org_id || !r.client_id || !r.store_id) {
      result.errors += 1
      result.details.push({
        legacy_id: r.id,
        status: "error",
        reason: "missing org/client/store",
      })
      continue
    }
    const orgId = c.org_id
    const pipelineId = pipelineByOrg.get(orgId)
    if (!pipelineId) {
      result.errors += 1
      result.details.push({
        legacy_id: r.id,
        status: "error",
        reason: "no pipeline",
      })
      continue
    }

    // Dedup: ja existe onboarding pra esse cliente+loja?
    const { data: existing } = await admin
      .from("onboardings")
      .select("id")
      .eq("org_id", orgId)
      .eq("client_id", r.client_id)
      .eq("store_id", r.store_id)
      .limit(1)
      .maybeSingle()
    if (existing) {
      result.skipped_existing += 1
      result.details.push({ legacy_id: r.id, status: "skipped" })
      continue
    }

    const cols = colsByPipeline.get(pipelineId) ?? []
    const targetSlug =
      (r.current_phase && PHASE_TO_SLUG[r.current_phase.toLowerCase()]) ||
      (r.status && PHASE_TO_SLUG[r.status.toLowerCase()]) ||
      "entrada"
    const col =
      cols.find((c0) => c0.slug === targetSlug) ??
      cols.find((c0) => c0.slug === "entrada") ??
      cols[0]
    if (!col) {
      result.errors += 1
      result.details.push({
        legacy_id: r.id,
        status: "error",
        reason: "no column",
      })
      continue
    }

    const formResponses =
      r.store_analysis && typeof r.store_analysis === "object"
        ? (r.store_analysis as Record<string, unknown>)
        : null

    const mappedStatus = mapStatus(r.status)

    const { error: insertErr } = await admin.from("onboardings").insert({
      org_id: orgId,
      pipeline_id: pipelineId,
      current_column_id: col.id,
      client_id: r.client_id,
      store_id: r.store_id,
      status: mappedStatus,
      current_version: 1,
      payment_status: "pending",
      contract_status: "pending",
      form_token: randomToken(32),
      form_responses: formResponses,
      form_submitted_at: formResponses ? r.created_at : null,
      briefing_status: r.generated_copies ? "generated_pending_review" : "not_started",
      briefing: r.generated_copies ?? null,
      entered_at: r.started_at ?? r.created_at,
      last_column_change_at: r.created_at,
      completed_at: r.completed_at,
    })

    if (insertErr) {
      log.error("insert failed", { legacy: r.id, err: insertErr.message })
      result.errors += 1
      result.details.push({
        legacy_id: r.id,
        status: "error",
        reason: insertErr.message,
      })
      continue
    }
    result.migrated += 1
    result.details.push({ legacy_id: r.id, status: "migrated" })
  }

  log.info("migration done", {
    total: result.total_legacy,
    migrated: result.migrated,
    skipped: result.skipped_existing,
    errors: result.errors,
  })
  return result
}
