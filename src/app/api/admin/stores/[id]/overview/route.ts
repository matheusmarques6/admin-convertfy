/**
 * GET /api/admin/stores/[id]/overview?period=30d
 *
 * Agrega em uma única resposta os dados que as abas do detalhe de loja
 * consomem: status de integrações, a loja completa (com cliente), health
 * history, briefing, atividade recente, próximos eventos e — quando há
 * plataforma de email conectada — report/campaigns/flows do período.
 *
 * Query params:
 *  ?period=7d|30d|90d|1A (default 30d) — repassado a report/campaigns/flows
 */

import { NextRequest } from "next/server"
import type { PostgrestError } from "@supabase/supabase-js"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { getStoreIntegrationStatus } from "@/lib/services/credentials.service"
import { withTiming } from "@/lib/api/with-timing"
import { GET as getEmailPlatformReport } from "@/app/api/integrations/email-platform/report/route"
import { GET as getEmailPlatformCampaigns } from "@/app/api/integrations/email-platform/campaigns/route"
import { GET as getEmailPlatformFlows } from "@/app/api/integrations/email-platform/flows/route"
import { GET as getStoreBriefing } from "@/app/api/onboarding/store-briefing/route"
import { logger } from "@/lib/logger"

const log = logger.child("StoreOverview")

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Tabela ausente: 42P01 vem do Postgres, PGRST205 do schema cache do
 * PostgREST — na prática a produção devolve o segundo, então reconhecer só
 * o primeiro deixaria o caso legado fora do silêncio pretendido.
 */
const TABELA_AUSENTE = new Set(["42P01", "PGRST205"])

/**
 * Lista vazia é a degradação certa para tabela ausente em ambiente legado —
 * e a errada para query inválida. Foi assim que o `created_at` inexistente
 * em crm_health_history escondeu 8.343 linhas de histórico de saúde: o erro
 * virava `[]` e a tela dizia "sem dados". Tabela ausente continua silenciosa;
 * todo o resto passa a aparecer no log.
 */
function rowsOrEmpty<T>(
  res: { data: T[] | null; error: PostgrestError | null },
  contexto: string,
): T[] {
  if (!res.error) return res.data ?? []
  if (!TABELA_AUSENTE.has(res.error.code)) {
    log.warn(`${contexto} falhou`, { code: res.error.code, message: res.error.message })
  }
  return []
}

async function invokeJson(
  handler: (request: NextRequest) => Promise<Response> | Response,
  url: URL,
): Promise<unknown> {
  try {
    const response = await handler(new NextRequest(url))
    return await response.json()
  } catch {
    return null
  }
}

export const GET = withTiming("admin/stores/overview", handleGet)

async function handleGet(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    const user = await requireAuth(sb)

    if (!storeId) throw new AppError("store_id é obrigatório", 400)
    await requireStoreAccess(storeId, user.id)

    const period = request.nextUrl.searchParams.get("period") || "30d"
    const origin = request.nextUrl.origin
    const admin = createAdminClient()

    const status = await getStoreIntegrationStatus(storeId)
    const emailPlatformConnected = !!status.klaviyo?.connected || !!status.omnisend?.connected
    const shopifyConnected = !!status.shopify?.connected

    const [storeRes, healthRes, activityRes, eventsRes, briefingRes, report, campaigns, flows] = await Promise.all([
      admin
        .from("client_stores")
        .select(
          `*,
           clients (id, name, email, phone, cpf_cnpj)`,
        )
        .eq("id", storeId)
        .single(),
      admin
        .from("crm_health_history")
        // A coluna é `computed_at`; o alias mantém `created_at` no contrato
        // que StoreOverviewHealthRow e a aba de Visão consomem.
        .select("health_score, components, created_at:computed_at")
        .eq("store_id", storeId)
        .order("computed_at", { ascending: false })
        .limit(2),
      admin
        .from("store_activity")
        .select(
          "id, kind, title, summary, tags, author_user_id, metadata, occurred_at, " +
            "author:profiles!store_activity_author_user_id_fkey(name, avatar_url)",
        )
        .eq("store_id", storeId)
        .order("occurred_at", { ascending: false })
        .limit(20),
      admin
        .from("cs_events")
        .select("id, kind, title, scheduled_at, attendees, notes, status")
        .eq("store_id", storeId)
        .gte("scheduled_at", new Date().toISOString())
        .eq("status", "scheduled")
        .order("scheduled_at", { ascending: true })
        .limit(20),
      invokeJson(
        getStoreBriefing,
        new URL(`/api/onboarding/store-briefing?store_id=${storeId}`, origin),
      ),
      emailPlatformConnected
        ? invokeJson(
            getEmailPlatformReport,
            new URL(`/api/integrations/email-platform/report?store_id=${storeId}&period=${period}`, origin),
          )
        : Promise.resolve(null),
      emailPlatformConnected
        ? invokeJson(
            getEmailPlatformCampaigns,
            new URL(`/api/integrations/email-platform/campaigns?store_id=${storeId}&period=${period}`, origin),
          )
        : Promise.resolve(null),
      emailPlatformConnected
        ? invokeJson(
            getEmailPlatformFlows,
            new URL(`/api/integrations/email-platform/flows?store_id=${storeId}&period=${period}`, origin),
          )
        : Promise.resolve(null),
    ])

    if (storeRes.error || !storeRes.data) throw new AppError("Loja não encontrada", 404)

    const briefing = (briefingRes as { briefing?: unknown } | null)?.briefing ?? null

    return successResponse(request, {
      period,
      status,
      connected: { emailPlatform: emailPlatformConnected, shopify: shopifyConnected },
      store: storeRes.data,
      healthHistory: rowsOrEmpty(healthRes, "crm_health_history"),
      activity: rowsOrEmpty(activityRes, "store_activity"),
      events: rowsOrEmpty(eventsRes, "cs_events"),
      briefing,
      report,
      campaigns,
      flows,
    })
  } catch (error) {
    return errorResponse(request, error, "admin/stores/overview")
  }
}
