/**
 * GET /api/forms/{token}/store-context
 *
 * Endpoint público (sem auth, validado por form_token igual aos outros
 * /api/forms/[token]/*). Retorna dados pra alimentar BLOCO 02 (Top produtos)
 * e BLOCO 03 (Análise de ads) na página de revisão do briefing.
 *
 * Dados NÃO entram no prompt da IA — vão direto pra UI como blocos
 * visuais informativos. Cliente não edita.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

interface TopProduct {
  rank: number
  title: string
  price: number | null
  currency: string | null
  handle: string | null
  image_url: string | null
  external_id: string | null
}

interface AdsReview {
  score: number
  summary: string | null
  sub_scores: Record<string, number> | null
  strengths: Array<{ what: string; body: string }> | null
  opportunities: Array<{ what: string; body: string }> | null
  risks: Array<{ what: string; body: string }> | null
  reviewed_at: string | null
}

export async function GET(
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
    if (!onb)
      return NextResponse.json({ error: "Token inválido" }, { status: 404 })

    const storeId = onb.store_id

    const [topProductsRes, storeRes] = await Promise.all([
      admin
        .from("store_top_products")
        .select(
          "rank, title, price, currency, handle, image_url, external_id",
        )
        .eq("store_id", storeId)
        .order("rank", { ascending: true })
        .limit(5),
      admin
        .from("client_stores")
        .select(
          "ads_score, ads_summary, ads_sub_scores, ads_strengths, ads_opportunities, ads_risks, ads_reviewed_at",
        )
        .eq("id", storeId)
        .maybeSingle(),
    ])

    const topProducts = (topProductsRes.data ?? []) as TopProduct[]
    const hasTopProducts = topProducts.length > 0

    const store = storeRes.data
    const hasAdsReview =
      store !== null && store !== undefined && store.ads_score !== null
    const adsReview: AdsReview | null = hasAdsReview
      ? {
          score: Number(store!.ads_score),
          summary: store!.ads_summary,
          sub_scores: store!.ads_sub_scores,
          strengths: store!.ads_strengths,
          opportunities: store!.ads_opportunities,
          risks: store!.ads_risks,
          reviewed_at: store!.ads_reviewed_at,
        }
      : null

    return NextResponse.json({
      has_top_products: hasTopProducts,
      top_products: hasTopProducts ? topProducts : null,
      has_ads_review: hasAdsReview,
      ads_review: adsReview,
    })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}
