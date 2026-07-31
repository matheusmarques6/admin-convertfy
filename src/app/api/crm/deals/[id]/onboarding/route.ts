/**
 * GET  /api/crm/deals/[id]/onboarding — onboarding gerado por esta venda
 * POST /api/crm/deals/[id]/onboarding — leva a venda para o onboarding
 *
 * A ponte entre venda fechada e entrega. No fluxo normal o onboarding
 * nasce sozinho (trigger `deal.won` → cron `process-deal-won`), mas isso
 * depende de o deal ter cliente e loja no momento do ganho. Quando o
 * vínculo veio depois — ou o evento se perdeu — esta rota faz o mesmo
 * caminho sob demanda, sem duplicar: `createFromDeal` é idempotente e
 * devolve o onboarding existente se já houver um em andamento.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { createFromDeal } from "@/lib/services/onboarding-pipeline.service"
import { logger } from "@/lib/logger"

const log = logger.child("CrmDealOnboarding")

export const dynamic = "force-dynamic"

const ONBOARDING_FIELDS =
  "id, client_id, store_id, source_deal_id, status, payment_status, contract_status, current_column_id, entered_at"

async function resolveOrg(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
  return data?.org_id ?? null
}

/** Onboarding da venda: pelo vínculo direto ou pelo cliente+loja. */
async function findOnboarding(
  admin: ReturnType<typeof createAdminClient>,
  deal: { id: string; client_id: string | null; store_id: string | null },
) {
  const byDeal = await admin
    .from("onboardings")
    .select(ONBOARDING_FIELDS)
    .eq("source_deal_id", deal.id)
    .maybeSingle()
  if (byDeal.data) return byDeal.data

  if (!deal.client_id) return null
  let q = admin
    .from("onboardings")
    .select(ONBOARDING_FIELDS)
    .eq("client_id", deal.client_id)
    .eq("status", "in_progress")
  if (deal.store_id) q = q.eq("store_id", deal.store_id)

  const { data } = await q.limit(1).maybeSingle()
  return data ?? null
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data: deal } = await admin
      .from("deals")
      .select("id, client_id, store_id")
      .eq("id", id)
      .single()
    if (!deal) throw new AppError("Deal nao encontrado", 404, "not-found")

    const onboarding = await findOnboarding(admin, deal)
    return successResponse(request, { onboarding })
  } catch (error) {
    log.error("Deal onboarding GET error:", error)
    return errorResponse(request, error, "crm-deal-onboarding-get")
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrg(admin, user.id)
    if (!orgId) throw new AppError("Sem org membership", 403)

    const { data: deal } = await admin
      .from("deals")
      .select("id, title, value, client_id, store_id, owner_id, status")
      .eq("id", id)
      .single()
    if (!deal) throw new AppError("Deal nao encontrado", 404, "not-found")

    // Sem cliente não há onboarding possível: o onboarding é do cliente,
    // não do deal. A UI usa esta mensagem pra mandar vincular primeiro.
    if (!deal.client_id) {
      throw new AppError(
        "Vincule um cliente a esta venda antes de criar o onboarding.",
        422,
        "validation-error",
      )
    }

    const existing = await findOnboarding(admin, deal)
    if (existing) {
      return successResponse(request, { onboarding: existing, created: false })
    }

    const result = await createFromDeal({
      id: deal.id,
      org_id: orgId,
      client_id: deal.client_id,
      store_id: deal.store_id ?? null,
      title: deal.title,
      value: deal.value,
      owner_id: deal.owner_id,
      created_by: user.id,
    })

    if (!result.onboarding) {
      throw new AppError(
        "Nao foi possivel criar o onboarding: o cliente precisa ter ao menos uma loja cadastrada.",
        422,
        "validation-error",
      )
    }

    log.info("[DealOnboarding] criado a partir da venda", {
      deal: deal.id,
      onboarding: result.onboarding.id,
      created: result.created,
    })

    return successResponse(
      request,
      { onboarding: result.onboarding, created: result.created },
      { status: result.created ? 201 : 200 },
    )
  } catch (error) {
    log.error("Deal onboarding POST error:", error)
    return errorResponse(request, error, "crm-deal-onboarding-post")
  }
}
