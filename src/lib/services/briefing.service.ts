import { createAdminClient } from "@/lib/supabase/server"
import type { BriefingData } from "@/types/onboarding"

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

  // 3. Build briefing data
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
    resumo_performance: {},
    perfil_marca: deriveBrandProfile(onboardingData?.price_sensitivity || null, store.niche || null),
    analise_anuncios: {},
  }

  // 4. Archive previous briefing
  await adminClient
    .from("store_briefings")
    .update({ status: "archived" })
    .eq("store_id", storeId)
    .eq("status", "current")

  // 5. Get next version number
  const { data: lastBriefing } = await adminClient
    .from("store_briefings")
    .select("version")
    .eq("store_id", storeId)
    .order("version", { ascending: false })
    .limit(1)
    .single()

  const nextVersion = (lastBriefing?.version || 0) + 1

  // 6. Insert new briefing
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
