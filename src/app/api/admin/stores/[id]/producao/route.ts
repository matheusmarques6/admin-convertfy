/**
 * GET /api/admin/stores/[id]/producao
 * Retorna identidade visual + briefing (versão atual) + flows + emails.
 * Tudo necessário pra renderizar a tela de Produção de Emails.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

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
        id, store_name, store_url, platform, niche, country, language,
        is_active, created_at, client_id,
        slogan, diferencial, persona, posicionamento_preco, hashtags,
        brand_thesis, tone_use_words,
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

    // Brand identity (latest version)
    const { data: brand } = await admin
      .from("store_brand_identity")
      .select("*")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

    // Briefing (latest version)
    const { data: briefing } = await admin
      .from("store_briefings")
      .select("*")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

    // Top products sincronizados (webhook N8N). Substitui o snapshot estatico
    // em store_brand_identity.top_products na nova UI de Identidade Visual.
    const { data: topProducts } = await admin
      .from("store_top_products")
      .select("rank, title, price, currency, handle, image_url, captured_at")
      .eq("store_id", storeId)
      .order("rank", { ascending: true })
      .limit(5)

    const topProductsSync = (topProducts ?? []).length
      ? {
          captured_at: (topProducts ?? [])[0]?.captured_at ?? null,
          items: topProducts ?? [],
        }
      : null

    // Flows + emails (em uma query so via subquery)
    const { data: flows } = await admin
      .from("email_flows")
      .select(`
        id, store_id, flow_type, name, description, status, position,
        assigned_to, progress_percent, created_at, updated_at,
        assignee:profiles!email_flows_assigned_to_fkey (id, name, avatar_url),
        emails:email_flow_emails (
          id, flow_id, number, name, from_name, from_email, subject, preheader,
          delay_hours, status, progress_percent, klaviyo_message_id,
          created_at, updated_at
        )
      `)
      .eq("store_id", storeId)
      .order("position", { ascending: true })

    // Ordena emails internamente
    const flowsOrdered = (flows || []).map((f) => ({
      ...f,
      emails: (f.emails || []).sort(
        (a: { number: number }, b: { number: number }) => a.number - b.number,
      ),
    }))

    return successResponse(request, {
      store,
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
