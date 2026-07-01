/**
 * GET /api/admin/campaign-central/stores/[id]/context
 *
 * Endpoint M2M consumido pelo n8n durante a geração de copy de campanha.
 * Devolve TODO o contexto que o agente externo precisa pra adaptar a
 * master pra essa loja: idioma, briefing.marca, pesquisa & diagnóstico
 * serializada, brand identity e top products.
 *
 * Auth: x-webhook-secret (mesmo padrão dos callbacks n8n).
 * Não usa sessão admin — é chamado pelo n8n, não pelo browser.
 *
 * Reusa o pattern de payload de email-copy-webhook.service.ts:540-654 —
 * mesmo formato de campos pra que o time de automação tenha familiaridade
 * entre os dois pipelines (email vs campaign).
 */

import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { errorResponse, AppError, NotFoundError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { pesquisaToFullText, type PesquisaFields } from "@/lib/briefing/briefing-text"
import { pickBrandLogo } from "@/lib/brand/pick-logo"

const log = logger.child("CampaignStoreContext")

export const dynamic = "force-dynamic"

interface StoreBrandIdentity {
  logo_main_png?: string | null
  logo_main_svg?: string | null
  logo_alt_svg?: string | null
  logo_alt_png?: string | null
  logo_monogram_svg?: string | null
  logo_monogram_png?: string | null
  logo_reverse_svg?: string | null
  logo_reverse_png?: string | null
  colors_primary?: string[] | null
  colors_secondary?: string[] | null
  font_heading?: string | null
  font_body?: string | null
  voice?: string[] | null
}

interface StoreBriefing {
  marca?: Record<string, unknown> | null
  briefing?: Record<string, unknown> | null
}

interface TopProductRow {
  rank: number
  title: string
  price: string | null
  currency: string | null
  handle: string | null
  external_id: string | null
  image_url: string | null
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireWebhookSecret(request)
    const { id: storeId } = await context.params

    if (!storeId || !/^[0-9a-f-]{36}$/i.test(storeId)) {
      throw new AppError("store_id inválido", 400)
    }

    const admin = createAdminClient()

    // Busca tudo em paralelo — mesmas tabelas usadas pelo dispatch de email.
    const [storeRes, brandRes, briefingRes, topProductsRes] = await Promise.all([
      admin
        .from("client_stores")
        .select(
          `
            id, store_name, store_url, platform, language, niche, country, currency,
            brand_thesis, brand_about, brand_pillars, brand_presence,
            store_story, store_milestones,
            icp_persona, icp_demographics, icp_day_in_life,
            icp_motivations, icp_frictions,
            tone_description, tone_do, tone_dont,
            tone_use_words, tone_avoid_words,
            ads_score, ads_summary, ads_sub_scores, ads_strengths,
            ads_opportunities, ads_risks, ads_reviewed_at,
            slogan, diferencial, persona, tom_de_voz, posicionamento_preco, hashtags
          `,
        )
        .eq("id", storeId)
        .maybeSingle(),
      admin
        .from("store_brand_identity")
        .select(
          "logo_main_png, logo_main_svg, logo_alt_svg, logo_alt_png, logo_monogram_svg, logo_monogram_png, logo_reverse_svg, logo_reverse_png, colors_primary, colors_secondary, font_heading, font_body, voice",
        )
        .eq("store_id", storeId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("store_briefings")
        .select("marca, briefing")
        .eq("store_id", storeId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("store_top_products")
        .select("rank, title, price, currency, handle, external_id, image_url")
        .eq("store_id", storeId)
        .order("rank", { ascending: true })
        .limit(6),
    ])

    if (storeRes.error) {
      log.error("context.store.error", { storeId, error: storeRes.error.message })
      throw new AppError("Erro ao carregar loja", 500)
    }
    if (!storeRes.data) {
      throw new NotFoundError("Loja")
    }

    const store = storeRes.data as Record<string, unknown>
    const brand = (brandRes.data as StoreBrandIdentity | null) ?? null
    const briefing = (briefingRes.data as StoreBriefing | null) ?? null
    const topProducts = (topProductsRes.data as TopProductRow[] | null) ?? []
    const storeUrl = typeof store.store_url === "string" ? store.store_url : ""

    const payload = {
      store_id: storeId,
      store_name: (store.store_name as string | null) ?? "",
      store_url: storeUrl || null,
      platform: (store.platform as string | null) ?? null,
      language: (store.language as string | null) ?? "pt-BR",
      niche: (store.niche as string | null) ?? null,
      country: (store.country as string | null) ?? null,
      currency: (store.currency as string | null) ?? null,
      briefing: briefing
        ? {
            marca: briefing.marca ?? {},
            briefing: briefing.briefing ?? {},
          }
        : null,
      pesquisa_diagnostico: pesquisaToFullText(store as PesquisaFields),
      pesquisa_estruturada: {
        brand: {
          thesis: store.brand_thesis ?? null,
          about: store.brand_about ?? null,
          pillars: store.brand_pillars ?? [],
          presence: store.brand_presence ?? null,
        },
        story: {
          story: store.store_story ?? null,
          milestones: store.store_milestones ?? [],
        },
        icp: {
          persona: store.icp_persona ?? null,
          demographics: store.icp_demographics ?? null,
          day_in_life: store.icp_day_in_life ?? null,
          motivations: store.icp_motivations ?? [],
          frictions: store.icp_frictions ?? [],
        },
        tone: {
          description: store.tone_description ?? null,
          do: store.tone_do ?? [],
          dont: store.tone_dont ?? [],
          use_words: store.tone_use_words ?? [],
          avoid_words: store.tone_avoid_words ?? [],
        },
        ads: {
          score: store.ads_score ?? null,
          summary: store.ads_summary ?? null,
          sub_scores: store.ads_sub_scores ?? null,
          strengths: store.ads_strengths ?? [],
          opportunities: store.ads_opportunities ?? [],
          risks: store.ads_risks ?? [],
          reviewed_at: store.ads_reviewed_at ?? null,
        },
      },
      positioning: {
        slogan: store.slogan ?? null,
        diferencial: store.diferencial ?? null,
        persona: store.persona ?? null,
        tom_de_voz: store.tom_de_voz ?? null,
        posicionamento_preco: store.posicionamento_preco ?? null,
        hashtags: store.hashtags ?? [],
      },
      brand_identity: brand
        ? {
            logo_url: pickBrandLogo(brand, "png")?.url ?? null,
            primary_colors: brand.colors_primary ?? [],
            secondary_colors: brand.colors_secondary ?? [],
            font_heading: brand.font_heading ?? null,
            font_body: brand.font_body ?? null,
            voice: brand.voice ?? [],
          }
        : null,
      top_products: topProducts.map((p) => ({
        rank: p.rank,
        name: p.title,
        price: p.price,
        currency: p.currency,
        image_url: p.image_url,
        url: p.handle && storeUrl ? `${storeUrl}/products/${p.handle}` : null,
        external_id: p.external_id,
      })),
    }

    log.info("context.served", {
      storeId,
      has_briefing: !!briefing,
      has_brand_identity: !!brand,
      top_products_count: topProducts.length,
    })

    return Response.json(payload)
  } catch (error) {
    return errorResponse(request, error, "campaign-central:store-context")
  }
}
