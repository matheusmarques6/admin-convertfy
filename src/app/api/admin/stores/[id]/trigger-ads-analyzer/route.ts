/**
 * POST /api/admin/stores/[id]/trigger-ads-analyzer
 *
 * Dispara o workflow n8n "Analisador de ADS" para a loja.
 * Fire-and-forget: o n8n processa em 30-120s e chama os 7 callbacks em
 * /api/webhooks/n8n/ads-analyzer/* para popular Pesquisa, Briefing,
 * Top Produtos e Concorrência.
 *
 * Idempotente: pode ser chamado várias vezes (cada call sobrescreve os
 * dados anteriores).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { n8nTriggerService } from "@/lib/services/n8n-trigger.service"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data: store, error: storeErr } = await admin
      .from("client_stores")
      .select("id, client_id, store_name, store_url, platform")
      .eq("id", storeId)
      .single()
    if (storeErr || !store) throw new AppError("Loja não encontrada", 404)

    const s = store as {
      id: string
      client_id: string
      store_name: string
      store_url: string | null
      platform: string | null
    }

    const result = await n8nTriggerService.triggerAdsAnalyzer({
      store_id: s.id,
      client_id: s.client_id,
      store_name: s.store_name,
      store_url: s.store_url,
      platform: s.platform,
    })

    if (!result.success) {
      throw new AppError(result.error || "Erro ao disparar Analisador de ADS", 502)
    }

    return successResponse(request, {
      store_id: storeId,
      triggered: true,
      message: "Analisador de ADS disparado. Os dados serão preenchidos automaticamente em 1-2 minutos.",
    })
  } catch (error) {
    return errorResponse(request, error, "admin/stores/trigger-ads-analyzer")
  }
}
