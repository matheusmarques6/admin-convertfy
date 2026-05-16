/**
 * POST /api/webhooks/n8n/ads-analyzer/ads-review
 *
 * Callback do n8n com avaliação dos ADS (Meta/Google) feita pelo AI Agent
 * a partir de advertiserTopAds. Persiste em client_stores.ads_*.
 *
 * Schema canônico igual ao endpoint /admin/stores/[id]/ads-review/regenerate.
 *
 * Auth: header x-secret == N8N_WEBHOOK_SECRET.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { errorResponse, successResponse, parseAndValidate } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

const score = z.number().min(0).max(10)
const item = z.object({
  what: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(2_000),
})

const schema = z.object({
  store_id: z.string().uuid(),
  score,
  summary: z.string().trim().min(1).max(200),
  sub_scores: z.object({
    strategy: score,
    creatives: score,
    targeting: score,
    diversification: score,
    tracking: score,
  }),
  strengths: z.array(item).min(1).max(5),
  opportunities: z.array(item).min(1).max(5),
  risks: z.array(item).min(1).max(5),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request, "N8N_WEBHOOK_SECRET", "x-secret")
    const body = await parseAndValidate(request, schema)

    const admin = createAdminClient()
    const { error } = await admin
      .from("client_stores")
      .update({
        ads_score: body.score,
        ads_summary: body.summary,
        ads_sub_scores: body.sub_scores,
        ads_strengths: body.strengths,
        ads_opportunities: body.opportunities,
        ads_risks: body.risks,
        ads_reviewed_at: new Date().toISOString(),
        ads_reviewed_by: null,
      })
      .eq("id", body.store_id)

    if (error) throw error

    return successResponse(request, { store_id: body.store_id, ads_score: body.score })
  } catch (error) {
    return errorResponse(request, error, "ads-analyzer/ads-review")
  }
}
