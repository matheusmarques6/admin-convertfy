/**
 * POST /api/forms/[token]/trigger-ads-analyzer
 *
 * Dispara o workflow n8n "Analisador de ADS" da loja do onboarding,
 * APENAS se faltarem dados de ads_review OU top_products. O workflow
 * popula os 7 callbacks em /api/webhooks/n8n/ads-analyzer/* (entre eles
 * ads-review e products). Cliente faz polling em
 * /api/forms/[token]/store-context pra renderizar quando chegar.
 *
 * Endpoint público (sem auth, validado por form_token igual aos outros
 * /api/forms/[token]/*). Idempotente: se já tem ambos, não dispara.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { n8nTriggerService } from "@/lib/services/n8n-trigger.service"

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const admin = createAdminClient()

    const { data: onb } = await admin
      .from("onboardings")
      .select("store_id")
      .eq("form_token", token)
      .maybeSingle()
    if (!onb || !onb.store_id) {
      return NextResponse.json({ error: "Token inválido" }, { status: 404 })
    }

    const storeId = onb.store_id as string

    const { data: store } = await admin
      .from("client_stores")
      .select(
        "id, client_id, store_name, store_url, platform, ads_score, ads_sub_scores",
      )
      .eq("id", storeId)
      .maybeSingle()
    if (!store) {
      return NextResponse.json(
        { error: "Loja não encontrada" },
        { status: 404 },
      )
    }

    const { count: topProductsCount } = await admin
      .from("store_top_products")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)

    const hasAdsReview =
      store.ads_score !== null || store.ads_sub_scores !== null
    const hasTopProducts = (topProductsCount ?? 0) > 0

    if (hasAdsReview && hasTopProducts) {
      return NextResponse.json({
        triggered: false,
        reason: "already_complete",
        has_ads_review: true,
        has_top_products: true,
      })
    }

    const result = await n8nTriggerService.triggerAdsAnalyzer({
      store_id: store.id,
      client_id: store.client_id,
      store_name: store.store_name,
      store_url: store.store_url,
      platform: store.platform,
    })

    return NextResponse.json({
      triggered: result.success,
      error: result.success ? undefined : result.error,
      missing: {
        ads_review: !hasAdsReview,
        top_products: !hasTopProducts,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}
