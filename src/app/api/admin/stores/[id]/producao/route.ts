/**
 * GET /api/admin/stores/[id]/producao
 * Retorna identidade visual + briefing (versão atual) + flows + emails.
 * Tudo necessário pra renderizar a tela de Produção de Emails.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import {
  OTHER_LANGUAGE_LABEL,
  languageCodeToLabel,
} from "@/lib/i18n/store-language"

const log = logger.child("StoreProducao")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    // Store basics
    const { data: store, error: storeErr } = await admin
      .from("client_stores")
      .select(`
        id, store_name, store_url, platform, email_platform, niche, country, language,
        is_active, created_at, client_id,
        slogan, diferencial, persona, posicionamento_preco, hashtags,
        brand_thesis, brand_about, brand_pillars,
        tone_use_words, tone_avoid_words, tone_do, tone_dont,
        devolucao_politica, frete_cobertura, frete_prazo,
        frete_gratis_acima_cents,
        ads_score, ads_summary, ads_sub_scores,
        ads_strengths, ads_opportunities, ads_risks, ads_reviewed_at,
        clients (id, name, owner_id,
          owner:profiles!clients_owner_id_fkey(id, name, avatar_url)
        )
      `)
      .eq("id", storeId)
      .single()

    if (storeErr || !store) {
      return errorResponse(
        request,
        new Error("Loja nao encontrada"),
        "store-producao-not-found",
      )
    }

    // Brand + Briefing + TopProducts + Flows + Onboarding em paralelo
    // (todos independentes do `store`).
    const [brandRes, briefingRes, topProductsRes, flowsRes, onbRes] = await Promise.all([
      admin
        .from("store_brand_identity")
        .select("*")
        .eq("store_id", storeId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("store_briefings")
        .select("*")
        .eq("store_id", storeId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("store_top_products")
        .select("rank, title, price, currency, handle, image_url, captured_at")
        .eq("store_id", storeId)
        .order("rank", { ascending: true })
        .limit(5),
      admin
        .from("email_flows")
        .select(`
          id, store_id, flow_type, name, description, status, position,
          assigned_to, progress_percent, created_at, updated_at,
          assignee:profiles!email_flows_assigned_to_fkey (id, name, avatar_url),
          emails:email_flow_emails (
            id, flow_id, number, name, from_name, from_email, subject, preheader,
            delay_hours, status, progress_percent, klaviyo_message_id, html,
            created_at, updated_at,
            blocks:email_blocks (id, email_id, block_type, position, label, content, applied, applied_at, applied_by, created_at)
          )
        `)
        .eq("store_id", storeId)
        .order("position", { ascending: true }),
      // Onboarding mais recente da loja — pra resolver o idioma escolhido no
      // formulário (cobre o caso "Outro", que não chega em client_stores.language).
      admin
        .from("onboardings")
        .select("form_responses")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const brand = brandRes.data
    const briefing = briefingRes.data
    const topProducts = topProductsRes.data
    const flows = flowsRes.data

    // Resolve o label do idioma selecionado pelo cliente. Prioridade:
    // form_responses (a escolha real, inclui "Outro") → client_stores.language.
    const formResponses = (onbRes.data?.form_responses ?? {}) as Record<
      string,
      unknown
    >
    const selectedLang =
      typeof formResponses.store_language === "string"
        ? formResponses.store_language.trim()
        : ""
    let language_label: string | null = null
    if (selectedLang === OTHER_LANGUAGE_LABEL) {
      const other = formResponses.store_language_other
      language_label = typeof other === "string" && other.trim() ? other.trim() : null
    } else if (selectedLang) {
      language_label = selectedLang // já é o label amigável do formulário
    } else if (store.language) {
      language_label = languageCodeToLabel(store.language) ?? store.language
    }

    const topProductsSync = (topProducts ?? []).length
      ? {
          captured_at: (topProducts ?? [])[0]?.captured_at ?? null,
          items: topProducts ?? [],
        }
      : null

    // Ordena emails internamente
    const flowsOrdered = (flows || []).map((f) => ({
      ...f,
      emails: (f.emails || []).sort(
        (a: { number: number }, b: { number: number }) => a.number - b.number,
      ),
    }))

    return successResponse(request, {
      store: { ...store, language_label },
      brand,
      briefing,
      flows: flowsOrdered,
      top_products_sync: topProductsSync,
    })
  } catch (error) {
    log.error("Producao GET error:", error)
    return errorResponse(request, error, "store-producao-get")
  }
}
