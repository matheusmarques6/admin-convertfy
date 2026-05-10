/**
 * POST /api/campaign-pipeline/[id]/deploy
 *
 * Cria draft campaigns no Omnisend pra cada loja selecionada.
 * Body: { store_ids: string[] }
 *
 * Para cada loja:
 *  - Busca omnisend_api_key da loja
 *  - POST /v5/campaigns com subject + content + segment
 *  - Atualiza target_stores[].status e omnisend_campaign_ids
 *  - Se todas com sucesso, move stage pra "deployed"
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import type { CampaignTargetStore } from "@/types/campaign-pipeline"

const log = logger.child("CampaignDeploy")
const OMNISEND_BASE = "https://api.omnisend.com/v5"

export const dynamic = "force-dynamic"
export const maxDuration = 120

interface OmnisendDraftPayload {
  name: string
  type: "regular"
  subject: string
  preheader?: string
  fromName?: string
  fromEmail?: string
  body?: { html?: string; text?: string }
}

async function createOmnisendDraft(
  apiKey: string,
  payload: OmnisendDraftPayload,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${OMNISEND_BASE}/campaigns`, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        error: json.error || json.message || `HTTP ${res.status}`,
      }
    }
    const id = (json.id as string) || (json.campaignID as string) || ""
    if (!id) return { ok: false, error: "Sem id retornado" }
    return { ok: true, id }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const body = await request.json()
    const storeIds: string[] = body.store_ids ?? []
    if (!Array.isArray(storeIds) || storeIds.length === 0) {
      throw new AppError("store_ids obrigatorio (array)", 400)
    }

    const { data: item } = await admin
      .from("campaign_pipeline_items")
      .select("*")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle()
    if (!item) throw new AppError("Item nao encontrado", 404)

    const { data: stores } = await admin
      .from("client_stores")
      .select("id, store_name, omnisend_api_key")
      .in("id", storeIds)
      .eq("org_id", orgId)

    // Move pra "deploying"
    await admin
      .from("campaign_pipeline_items")
      .update({ stage: "deploying" })
      .eq("id", id)

    const subject = item.subject_line ?? item.title
    const preview = item.preview_text ?? null
    const copyData = (item.copy_data ?? {}) as {
      body_html?: string | null
      body_text?: string | null
    }

    const results: Array<{
      store_id: string
      store_name: string
      status: "deployed" | "failed"
      error?: string
      omnisend_campaign_id?: string
    }> = []

    const omnisendIds: Record<string, string> = {
      ...(item.omnisend_campaign_ids ?? {}),
    }

    for (const s of stores ?? []) {
      if (!s.omnisend_api_key) {
        results.push({
          store_id: s.id,
          store_name: s.store_name,
          status: "failed",
          error: "Loja sem API key Omnisend",
        })
        continue
      }
      const r = await createOmnisendDraft(s.omnisend_api_key, {
        name: item.title,
        type: "regular",
        subject,
        preheader: preview ?? undefined,
        body: {
          html: copyData.body_html ?? undefined,
          text: copyData.body_text ?? undefined,
        },
      })
      if (r.ok) {
        omnisendIds[s.id] = r.id
        results.push({
          store_id: s.id,
          store_name: s.store_name,
          status: "deployed",
          omnisend_campaign_id: r.id,
        })
      } else {
        results.push({
          store_id: s.id,
          store_name: s.store_name,
          status: "failed",
          error: r.error,
        })
      }
    }

    // Atualiza target_stores com novos status
    const previousTargets = (item.target_stores ?? []) as CampaignTargetStore[]
    const updatedTargets: CampaignTargetStore[] = storeIds.map((sid) => {
      const r = results.find((x) => x.store_id === sid)
      const existing = previousTargets.find((p) => p.store_id === sid)
      return {
        store_id: sid,
        store_name: r?.store_name ?? existing?.store_name ?? "",
        status: (r?.status ?? "pending") as CampaignTargetStore["status"],
        error: r?.error ?? null,
      }
    })

    const allOk = results.every((r) => r.status === "deployed")

    await admin
      .from("campaign_pipeline_items")
      .update({
        target_stores: updatedTargets,
        omnisend_campaign_ids: omnisendIds,
        stage: allOk ? "deployed" : "ready_to_deploy",
      })
      .eq("id", id)

    return successResponse(request, { results, all_ok: allOk })
  } catch (error) {
    log.error("Deploy error", error)
    return errorResponse(request, error, "campaign-pipeline-deploy")
  }
}
