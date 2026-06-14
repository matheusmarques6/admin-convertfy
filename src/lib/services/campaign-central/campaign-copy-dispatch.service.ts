/**
 * Dispatch da geração de copy de campanha via n8n.
 *
 * - Marca cada loja-alvo como `status='pending'` em copy_results[mode].
 * - Cria row em campaign_copy_jobs (rastreio + idempotência via stores_count).
 * - Dispara webhook fire-and-forget pro n8n com a master + lista de lojas.
 * - Em modo 'production', anexa pilot_references (lojas com quality='good'
 *   no piloto) — n8n usa como few-shot pra manter consistência de tom.
 *
 * O n8n consome /api/admin/campaign-central/stores/[id]/context por loja
 * e responde streaming via /api/webhooks/n8n/campaign-copy (uma vez por
 * loja). O cron campaign-copy-watchdog (F3) detecta jobs travados e
 * dispara generateCampaignCopy() inline como fallback.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type {
  CampaignSuggestion,
  CopyResultEntry,
} from "@/types/campaign-central"

const log = logger.child("CampaignCopyDispatch")

const DISPATCH_TIMEOUT_MS = 15_000

export interface DispatchCampaignCopyParams {
  suggestionId: string
  orgId: string
  mode: "test" | "production"
  storeIds: string[]
  triggeredBy?: string | null
}

export interface DispatchCampaignCopyResult {
  ok: boolean
  job_id: string | null
  stores_count: number
  reason?: string
}

interface StoreContextRow {
  id: string
  store_name: string | null
  language: string | null
  country: string | null
}

interface PilotReferenceOut {
  store_id: string
  store_name: string
  language: string
  copy: CopyResultEntry
}

function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "")
}

/**
 * Carrega lojas piloto com copy aprovada (quality='good') pra anexar como
 * few-shot no payload do n8n. Espelha collectPilotReferences do service
 * inline, mas devolve formato pronto pro webhook.
 */
function collectPilotReferencesForDispatch(
  suggestion: CampaignSuggestion,
  storeMap: Map<string, StoreContextRow>,
  maxRefs = 2,
): PilotReferenceOut[] {
  const pilotResults = suggestion.copy_results?.test ?? {}
  const refs: PilotReferenceOut[] = []
  for (const [storeId, entry] of Object.entries(pilotResults)) {
    if (entry.quality !== "good") continue
    if (!entry.blocks || entry.blocks.length === 0) continue
    const ctx = storeMap.get(storeId)
    refs.push({
      store_id: storeId,
      store_name: ctx?.store_name ?? "loja piloto",
      language: ctx?.language ?? "pt-BR",
      copy: entry,
    })
    if (refs.length >= maxRefs) break
  }
  return refs
}

export async function dispatchCampaignCopyToN8n(
  params: DispatchCampaignCopyParams,
): Promise<DispatchCampaignCopyResult> {
  const { suggestionId, orgId, mode, storeIds, triggeredBy } = params
  const url = process.env.N8N_CAMPAIGN_COPY_WEBHOOK_URL

  const admin = createAdminClient()

  // 1) Carrega sugestão + master + contexto das lojas (alvo + piloto pra ref)
  const { data: suggestionRaw, error: sugErr } = await admin
    .from("campaign_suggestions")
    .select("*")
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (sugErr) {
    log.error("dispatch.sug.error", { suggestionId, error: sugErr.message })
    return { ok: false, job_id: null, stores_count: 0, reason: "suggestion_query_failed" }
  }
  if (!suggestionRaw) {
    return { ok: false, job_id: null, stores_count: 0, reason: "suggestion_not_found" }
  }

  const suggestion = suggestionRaw as CampaignSuggestion

  if (!suggestion.email_draft || !suggestion.email_draft.blocks?.length) {
    return {
      ok: false,
      job_id: null,
      stores_count: 0,
      reason: "missing_master_copy",
    }
  }

  const pilotIds = Object.keys(suggestion.copy_results?.test ?? {})
  const allStoreIds = Array.from(new Set([...storeIds, ...pilotIds]))

  const { data: storesRaw, error: storesErr } = await admin
    .from("client_stores")
    .select("id, store_name, language, country")
    .eq("org_id", orgId)
    .in("id", allStoreIds)

  if (storesErr) {
    log.error("dispatch.stores.error", { suggestionId, error: storesErr.message })
    return { ok: false, job_id: null, stores_count: 0, reason: "stores_query_failed" }
  }

  const storeMap = new Map<string, StoreContextRow>()
  for (const s of (storesRaw ?? []) as StoreContextRow[]) {
    storeMap.set(s.id, s)
  }

  // Filtra lojas-alvo que existem na org (defesa contra IDs inválidos)
  const validTargetStoreIds = storeIds.filter((id) => storeMap.has(id))
  if (validTargetStoreIds.length === 0) {
    return { ok: false, job_id: null, stores_count: 0, reason: "no_valid_stores" }
  }

  // 2) Marca lojas-alvo como pending em copy_results[mode]
  //    Preserva quality já existente. Se já tinha success/error, sobrescreve
  //    pra pending (UI mostra spinner durante re-dispatch).
  const nowIso = new Date().toISOString()
  const { data: fresh } = await admin
    .from("campaign_suggestions")
    .select("copy_results")
    .eq("id", suggestionId)
    .maybeSingle()

  const copyResults = (fresh?.copy_results ?? {}) as CampaignSuggestion["copy_results"]
  const modeResults = copyResults[mode] ?? {}

  const updatedModeResults: Record<string, CopyResultEntry> = { ...modeResults }
  for (const storeId of validTargetStoreIds) {
    const prev = modeResults[storeId]
    updatedModeResults[storeId] = {
      // mantém campos prévios pra UI não "perder" copy anterior durante refresh
      ...prev,
      subject: prev?.subject ?? "",
      preview: prev?.preview ?? "",
      preheader: prev?.preheader,
      strategy: prev?.strategy,
      blocks: prev?.blocks,
      quality: prev?.quality ?? null,
      generated_at: prev?.generated_at ?? nowIso,
      generated_via: prev?.generated_via ?? "n8n",
      status: "pending",
      dispatched_at: nowIso,
      error_message: undefined,
    }
  }

  const mergedResults: CampaignSuggestion["copy_results"] = {
    ...copyResults,
    [mode]: updatedModeResults,
  }

  const { error: updSugErr } = await admin
    .from("campaign_suggestions")
    .update({ copy_results: mergedResults })
    .eq("id", suggestionId)
  if (updSugErr) {
    log.error("dispatch.sug_update.error", { suggestionId, error: updSugErr.message })
    return { ok: false, job_id: null, stores_count: 0, reason: "suggestion_update_failed" }
  }

  // 3) Cria job de rastreio
  const { data: jobRow, error: jobErr } = await admin
    .from("campaign_copy_jobs")
    .insert({
      suggestion_id: suggestionId,
      org_id: orgId,
      mode,
      store_ids: validTargetStoreIds,
      stores_count: validTargetStoreIds.length,
      status: "dispatched",
      triggered_by: triggeredBy ?? null,
    })
    .select("id")
    .single()

  if (jobErr || !jobRow) {
    log.error("dispatch.job_insert.error", { suggestionId, error: jobErr?.message })
    return { ok: false, job_id: null, stores_count: 0, reason: "job_insert_failed" }
  }

  const jobId = jobRow.id as string

  // 4) Sem URL configurada: não dispara, mas cria job (watchdog vai promover
  //    pra fallback inline depois). Mensagem clara pra ops.
  if (!url) {
    log.warn("dispatch.skip", { suggestionId, jobId, reason: "no_url_configured" })
    return {
      ok: false,
      job_id: jobId,
      stores_count: validTargetStoreIds.length,
      reason: "no_url_configured",
    }
  }

  // 5) Monta payload e dispara webhook
  const pilotReferences =
    mode === "production"
      ? collectPilotReferencesForDispatch(suggestion, storeMap)
      : []

  const draft = suggestion.email_draft
  const targetStores = validTargetStoreIds.map((id) => {
    const s = storeMap.get(id)!
    return {
      store_id: id,
      store_name: s.store_name ?? "",
      language: s.language ?? "pt-BR",
      country: s.country ?? null,
    }
  })

  const appUrl = getAppUrl()
  const payload = {
    event: "campaign_copy.requested" as const,
    timestamp: nowIso,
    job_id: jobId,
    suggestion_id: suggestionId,
    org_id: orgId,
    mode,
    callback: {
      url: `${appUrl}/api/webhooks/n8n/campaign-copy`,
      secret: process.env.N8N_WEBHOOK_SECRET ?? "",
    },
    context_url_template: `${appUrl}/api/admin/campaign-central/stores/{store_id}/context`,
    master: {
      subject: draft.subject,
      preheader: draft.preheader,
      strategy: draft.strategy,
      blocks: draft.blocks,
    },
    campaign: {
      title: suggestion.title,
      type: suggestion.type,
      angle: suggestion.angle,
      trigger: suggestion.trigger,
      send_date: suggestion.send_date,
    },
    stores: targetStores,
    pilot_references: pilotReferences,
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), DISPATCH_TIMEOUT_MS)
  let dispatchStatus: number | null = null
  let dispatchError: string | null = null

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (process.env.N8N_WEBHOOK_SECRET) {
      headers["x-webhook-secret"] = process.env.N8N_WEBHOOK_SECRET
    }

    log.info("dispatch.start", {
      suggestionId,
      jobId,
      mode,
      stores_count: targetStores.length,
      pilot_refs: pilotReferences.length,
    })

    const resp = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers,
      body: JSON.stringify(payload),
    })
    dispatchStatus = resp.status

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "")
      dispatchError = `HTTP ${resp.status}: ${errBody.slice(0, 200)}`
      log.warn("dispatch.error", {
        suggestionId,
        jobId,
        http_status: resp.status,
        body: errBody.slice(0, 200),
      })
    } else {
      log.info("dispatch.ok", { suggestionId, jobId, http_status: resp.status })
    }
  } catch (err) {
    dispatchError =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Timeout do webhook"
          : err.message
        : String(err)
    log.warn("dispatch.exception", { suggestionId, jobId, error: dispatchError })
  } finally {
    clearTimeout(timer)
  }

  // 6) Atualiza job: success -> running (n8n vai processar); falha -> failed
  //    (watchdog cuida do fallback inline)
  const jobPatch: Record<string, unknown> = {
    dispatch_response_status: dispatchStatus,
    dispatch_error: dispatchError,
    updated_at: new Date().toISOString(),
  }
  if (dispatchError) {
    jobPatch.status = "failed"
  } else {
    jobPatch.status = "running"
  }

  const { error: jobUpdErr } = await admin
    .from("campaign_copy_jobs")
    .update(jobPatch)
    .eq("id", jobId)
  if (jobUpdErr) {
    log.warn("dispatch.job_update_failed", { jobId, error: jobUpdErr.message })
  }

  return {
    ok: dispatchError === null,
    job_id: jobId,
    stores_count: targetStores.length,
    reason: dispatchError ?? undefined,
  }
}
