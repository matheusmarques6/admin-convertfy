import { createAdminClient } from "@/lib/supabase/server"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { getKlaviyoRevenueForStore } from "@/lib/integrations/klaviyo/report-summary"
import { createMetaAdsService } from "@/lib/integrations/meta-ads"
import { createGoogleAdsService } from "@/lib/integrations/google-ads"
import { logger } from "@/lib/logger"
import type { BriefingData } from "@/types/onboarding"

const log = logger.child("BriefingService")

function deriveCampaignFocus(sensitivity: string | null, niche: string | null, audience: string | null) {
  const nicheText = niche ? ` no nicho de ${niche}` : ""

  if (sensitivity === "price") {
    return {
      abordagem: "Foco em Preço e Promoções",
      descricao: `Estratégia orientada a conversão por preço${nicheText}. Campanhas devem enfatizar promoções, descontos exclusivos, urgência (contagem regressiva), frete grátis e ofertas por tempo limitado. ${audience ? `Público-alvo: ${audience}.` : ""}`,
    }
  }

  if (sensitivity === "quality") {
    return {
      abordagem: "Foco em Qualidade e Marca",
      descricao: `Estratégia orientada a valor percebido e branding${nicheText}. Campanhas devem enfatizar a história da marca, qualidade dos materiais, exclusividade, depoimentos e experiência premium. ${audience ? `Público-alvo: ${audience}.` : ""}`,
    }
  }

  return {
    abordagem: "Abordagem Equilibrada",
    descricao: `Estratégia mista combinando valor e marca${nicheText}. Campanhas devem alternar entre promoções estratégicas e conteúdo de valor, storytelling e ofertas personalizadas. ${audience ? `Público-alvo: ${audience}.` : ""}`,
  }
}

function deriveBrandProfile(sensitivity: string | null, niche: string | null) {
  if (sensitivity === "price") {
    return {
      tipo: "Orientada a Preço",
      descricao: `Marca${niche ? ` de ${niche}` : ""} com posicionamento competitivo em preço. Comunicação direta, foco em benefícios tangíveis e economia.`,
    }
  }

  if (sensitivity === "quality") {
    return {
      tipo: "Premium / Aspiracional",
      descricao: `Marca${niche ? ` de ${niche}` : ""} com posicionamento premium. Comunicação sofisticada, foco em exclusividade e experiência.`,
    }
  }

  return {
    tipo: "Versátil",
    descricao: `Marca${niche ? ` de ${niche}` : ""} com posicionamento versátil. Comunicação adaptável entre valor e qualidade conforme a campanha.`,
  }
}

async function fetchPerformanceSummary(storeId: string): Promise<Record<string, unknown>> {
  try {
    // Check if Klaviyo is connected before calling the API
    const credentials = await getStoreCredentials(storeId)
    const hasKlaviyoKey = !!(credentials.klaviyo_private_key || credentials.klaviyo_api_key)

    if (!hasKlaviyoKey) {
      return { status: "sem_dados", mensagem: "Nenhuma integração de performance conectada." }
    }

    const klaviyo = await getKlaviyoRevenueForStore(storeId, "30d")

    return {
      periodo: "30d",
      gerado_em: new Date().toISOString(),
      klaviyo: {
        receita_total: klaviyo.totalRevenue,
        receita_campanhas: klaviyo.campaignRevenue,
        receita_flows: klaviyo.flowRevenue,
      },
    }
  } catch (err) {
    log.error("Error fetching performance summary for briefing", err)
    return { status: "erro", mensagem: "Erro ao buscar dados de performance." }
  }
}

async function fetchAdAnalysis(storeId: string): Promise<Record<string, unknown>> {
  try {
    const credentials = await getStoreCredentials(storeId)
    const result: Record<string, unknown> = {
      periodo: "30d",
      gerado_em: new Date().toISOString(),
    }

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, "0")
    const startDate = `${thirtyDaysAgo.getFullYear()}-${pad(thirtyDaysAgo.getMonth() + 1)}-${pad(thirtyDaysAgo.getDate())}`
    const endDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

    // Meta Ads
    if (credentials.meta_access_token && credentials.meta_ad_account_id) {
      try {
        const meta = createMetaAdsService({
          access_token: credentials.meta_access_token,
          ad_account_id: credentials.meta_ad_account_id,
        })
        const metrics = await meta.getDashboardMetrics({ since: startDate, until: endDate })
        result.meta_ads = {
          status: "conectado",
          gasto_total: metrics.totalSpend,
          receita_total: metrics.totalRevenue,
          roas: metrics.roas,
          impressoes: metrics.impressions,
          cliques: metrics.clicks,
          conversoes: metrics.conversions,
          ctr: metrics.ctr,
          cpc: metrics.cpc,
        }
      } catch (err) {
        log.error("Error fetching Meta Ads for briefing", err)
        result.meta_ads = { status: "erro", mensagem: "Erro ao buscar dados do Meta Ads." }
      }
    } else {
      result.meta_ads = { status: "nao_conectado" }
    }

    // Google Ads
    if (credentials.google_ads_credentials?.access_token && credentials.google_ads_credentials?.customer_id) {
      try {
        const gads = createGoogleAdsService(credentials.google_ads_credentials)
        const metrics = await gads.getDashboardMetrics({ startDate, endDate })
        result.google_ads = {
          status: "conectado",
          gasto_total: metrics.totalSpend,
          receita_total: metrics.totalConversionsValue,
          roas: metrics.roas,
          impressoes: metrics.impressions,
          cliques: metrics.clicks,
          conversoes: metrics.totalConversions,
          ctr: metrics.ctr,
          cpc: metrics.cpc,
        }
      } catch (err) {
        log.error("Error fetching Google Ads for briefing", err)
        result.google_ads = { status: "erro", mensagem: "Erro ao buscar dados do Google Ads." }
      }
    } else {
      result.google_ads = { status: "nao_conectado" }
    }

    // If nothing is connected
    const metaStatus = (result.meta_ads as Record<string, unknown>)?.status
    const gadsStatus = (result.google_ads as Record<string, unknown>)?.status
    if (metaStatus === "nao_conectado" && gadsStatus === "nao_conectado") {
      return { status: "sem_dados", mensagem: "Nenhuma plataforma de anúncios conectada." }
    }

    return result
  } catch (err) {
    log.error("Error fetching ad analysis for briefing", err)
    return { status: "erro", mensagem: "Erro ao buscar dados de anúncios." }
  }
}

function deriveAudienceProfile(audience: string | null, sensitivity: string | null) {
  const sensitivityLabel = sensitivity === "price" ? "sensível a preço" : sensitivity === "quality" ? "orientado a qualidade" : "equilibrado"

  return audience
    ? `${audience} — perfil ${sensitivityLabel}.`
    : `Perfil de consumidor ${sensitivityLabel}. Público-alvo não especificado.`
}

export async function generateBriefing(storeId: string): Promise<{ briefingId: string; version: number }> {
  const adminClient = createAdminClient()

  // 1. Fetch store data
  const { data: store, error: storeError } = await adminClient
    .from("client_stores")
    .select("*")
    .eq("id", storeId)
    .single()

  if (storeError || !store) {
    throw new Error("Loja não encontrada")
  }

  // 2. Fetch onboarding data
  const { data: onboardingData } = await adminClient
    .from("store_onboarding_data")
    .select("*")
    .eq("store_id", storeId)
    .single()

  // 3. Fetch performance data in parallel (non-blocking — errors return fallback objects)
  const [performanceData, adAnalysisData] = await Promise.all([
    fetchPerformanceSummary(storeId),
    fetchAdAnalysis(storeId),
  ])

  // 4. Build briefing data
  const briefingData: BriefingData = {
    dados_loja: {
      nome: store.store_name,
      url: store.store_url,
      plataforma: store.platform,
      nicho: store.niche || null,
      pais: store.country || null,
      idioma: store.language || null,
      frete_gratis: store.free_shipping_type || null,
    },
    codigo_colaborador: {
      shopify_code: store.shopify_collaborator_code || null,
    },
    materiais_identidade: {
      logo_url: onboardingData?.logo_url || null,
      design_direction: onboardingData?.design_direction_text || null,
      design_file_url: onboardingData?.design_direction_file_url || null,
      brand_manual_url: onboardingData?.brand_manual_url || null,
    },
    foco_campanhas: deriveCampaignFocus(
      onboardingData?.price_sensitivity || null,
      store.niche || null,
      store.target_audience || null,
    ),
    publico: {
      target_audience: store.target_audience || null,
      price_sensitivity: onboardingData?.price_sensitivity || null,
      perfil: deriveAudienceProfile(store.target_audience || null, onboardingData?.price_sensitivity || null),
    },
    detalhes_adicionais: {
      notas: onboardingData?.additional_notes || null,
      conceito_frete: store.free_shipping_type || null,
    },
    resumo_performance: performanceData,
    perfil_marca: deriveBrandProfile(onboardingData?.price_sensitivity || null, store.niche || null),
    analise_anuncios: adAnalysisData,
  }

  // 5. Archive previous briefing
  await adminClient
    .from("store_briefings")
    .update({ status: "archived" })
    .eq("store_id", storeId)
    .eq("status", "current")

  // 6. Get next version number
  const { data: lastBriefing } = await adminClient
    .from("store_briefings")
    .select("version")
    .eq("store_id", storeId)
    .order("version", { ascending: false })
    .limit(1)
    .single()

  const nextVersion = (lastBriefing?.version || 0) + 1

  // 7. Insert new briefing
  const { data: newBriefing, error: insertError } = await adminClient
    .from("store_briefings")
    .insert({
      store_id: storeId,
      onboarding_data_id: onboardingData?.id || null,
      briefing_data: briefingData,
      version: nextVersion,
      generated_at: new Date().toISOString(),
      generated_by: "auto",
      status: "current",
    })
    .select("id, version")
    .single()

  if (insertError || !newBriefing) {
    throw new Error("Erro ao gerar briefing")
  }

  return { briefingId: newBriefing.id, version: newBriefing.version }
}
