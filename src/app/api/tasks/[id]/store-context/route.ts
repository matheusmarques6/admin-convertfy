import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * GET /api/tasks/[id]/store-context
 *
 * Retorna contexto completo da loja/onboarding da task pra renderizar
 * blocos no drawer:
 *  - Identidade da loja (nome, vertical, plano, MRR, plataforma, idioma)
 *  - Brand Brain (briefing JSON)
 *  - Visual Assets (paleta, logos, fonte, top produtos)
 *
 * Resolve via task.onboarding_id → onboardings → clients/client_stores/deals.
 * Para tasks sem onboarding, retorna o que conseguir via metadata.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const admin = createAdminClient()
    const { data: task, error: taskErr } = await admin
      .from("tasks")
      .select("id, title, onboarding_id, source_type, metadata")
      .eq("id", id)
      .maybeSingle()

    if (taskErr || !task) throw new AppError("Task não encontrada", 404)

    if (!task.onboarding_id) {
      // Task sem onboarding — retorna o que tem via metadata
      const meta = (task.metadata as Record<string, unknown>) ?? {}
      return successResponse(request, {
        identity: {
          store_name: meta.store_name ?? null,
          client_name: meta.client_name ?? null,
          platform: meta.platform ?? null,
          niche: meta.niche ?? null,
          country: meta.country ?? null,
          language: meta.language ?? null,
          mrr: meta.mrr ?? null,
          plan: meta.plan ?? null,
        },
        briefing: null,
        visual_assets: null,
        onboarding_id: null,
        store_id: null,
      })
    }

    const { data: onbRaw, error: onbErr } = await admin
      .from("onboardings")
      .select(
        "id, briefing, briefing_status, visual_assets, language, " +
          "client:clients!onboardings_client_id_fkey(id, name, owner:profiles!clients_owner_id_fkey(id, name, avatar_url)), " +
          "store:client_stores(id, store_name, store_url, platform, niche, country, language, plan, mrr_value), " +
          "deal:deals!onboardings_source_deal_id_fkey(id, value, plan_name)",
      )
      .eq("id", task.onboarding_id)
      .maybeSingle()

    if (onbErr || !onbRaw) {
      return successResponse(request, {
        identity: null,
        briefing: null,
        visual_assets: null,
        onboarding_id: task.onboarding_id,
        store_id: null,
      })
    }

    const onb = onbRaw as unknown as {
      id: string
      briefing: unknown
      briefing_status: string
      visual_assets: unknown
      language: string | null
      client: { id: string; name: string; owner: { id: string; name: string; avatar_url: string | null } | null } | null
      store: { id: string; store_name: string; store_url: string; platform: string; niche: string | null; country: string | null; language: string | null; plan: string | null; mrr_value: number | null } | null
      deal: { id: string; value: number | null; plan_name: string | null } | null
    }

    const client = Array.isArray(onb.client) ? onb.client[0] : onb.client
    const store = Array.isArray(onb.store) ? onb.store[0] : onb.store
    const deal = Array.isArray(onb.deal) ? onb.deal[0] : onb.deal

    return successResponse(request, {
      identity: {
        store_id: store?.id,
        store_name: store?.store_name ?? null,
        store_url: store?.store_url ?? null,
        client_id: client?.id,
        client_name: client?.name ?? null,
        client_owner: client?.owner ?? null,
        platform: store?.platform ?? null,
        niche: store?.niche ?? null,
        country: store?.country ?? null,
        language: onb.language ?? store?.language ?? "pt-BR",
        mrr: deal?.value ?? store?.mrr_value ?? null,
        plan: deal?.plan_name ?? store?.plan ?? null,
      },
      briefing: onb.briefing,
      briefing_status: onb.briefing_status,
      visual_assets: onb.visual_assets,
      onboarding_id: onb.id,
      store_id: store?.id ?? null,
    })
  } catch (error) {
    return errorResponse(request, error, "TasksStoreContext")
  }
}
