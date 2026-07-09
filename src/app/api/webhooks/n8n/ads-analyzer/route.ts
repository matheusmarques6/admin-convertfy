/**
 * POST /api/webhooks/n8n/ads-analyzer
 *
 * Callback do n8n que popula a área "05 Review dos Anúncios" da Pesquisa.
 * Persiste em `client_stores`:
 *   - score          → ads_score (numeric, 0-100)
 *   - summary        → ads_summary (text — abaixo do gauge)
 *   - sub_scores     → ads_sub_scores (jsonb — 5 barras: strategy,
 *                      creatives, targeting, diversification, tracking)
 *   - strengths      → ads_strengths (jsonb — Array<{what, body}>)
 *   - opportunities  → ads_opportunities (jsonb — Array<{what, body}>)
 *   - risks          → ads_risks (jsonb — Array<{what, body}>)
 *   - (backend seta ads_reviewed_at = now())
 *
 * Schema alinhado com PesquisaData (pesquisa-section.tsx:86-99).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { assertStoreUrlMatches } from "@/lib/api/n8n-store-guard"
import {
  errorResponse,
  successResponse,
  parseAndValidate,
  NotFoundError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

const subScoresSchema = z.object({
  strategy: z.number().min(0).max(100),
  creatives: z.number().min(0).max(100),
  targeting: z.number().min(0).max(100),
  diversification: z.number().min(0).max(100),
  tracking: z.number().min(0).max(100),
})

const reviewItemSchema = z.object({
  what: z.string().min(2).max(160),
  body: z.string().min(10).max(800),
})

const schema = z.object({
  store_id: z.string().uuid(),
  // Echo opcional do n8n — liga o guard anti-contaminação de loja.
  store_url: z.string().optional().nullable(),
  score: z.number().min(0).max(100),
  summary: z.string().min(40).max(2000),
  sub_scores: subScoresSchema,
  strengths: z.array(reviewItemSchema).min(1).max(8),
  opportunities: z.array(reviewItemSchema).min(1).max(8),
  risks: z.array(reviewItemSchema).min(0).max(8),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const body = await parseAndValidate(request, schema)
    await assertStoreUrlMatches(body.store_id, body.store_url, "n8n:ads-analyzer")

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("client_stores")
      .update({
        ads_score: body.score,
        ads_summary: body.summary,
        ads_sub_scores: body.sub_scores,
        ads_strengths: body.strengths,
        ads_opportunities: body.opportunities,
        ads_risks: body.risks,
        ads_reviewed_at: new Date().toISOString(),
      })
      .eq("id", body.store_id)
      .select("id")
      .single()

    if (error) throw error
    if (!data) throw new NotFoundError("Loja")

    logger.info("[n8n:ads-analyzer] persisted", {
      store_id: body.store_id,
      score: body.score,
    })
    return successResponse(request, { data: { store_id: body.store_id } })
  } catch (e) {
    return errorResponse(request, e, "n8n:ads-analyzer")
  }
}
