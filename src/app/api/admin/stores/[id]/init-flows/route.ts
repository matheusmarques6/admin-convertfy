/**
 * POST /api/admin/stores/[id]/init-flows
 *   Cria os 7 flows padrão (welcome, site_abandoned, browse_abandonment,
 *   abandoned_cart, upsell, win_back, shipping_stages) + emails default
 *   por flow_type. Idempotente.
 *
 *   AE-17: a lógica de seed foi extraída para `flow-seed.service.ts`
 *   e o trigger SQL `tr_seed_default_flows_on_store_insert` (migration
 *   20260626_auto_seed_flows.sql) garante que toda loja nova já nasce
 *   com os 7 flows + 38 emails. Este endpoint continua existindo para
 *   reparar lojas legadas (criadas antes do trigger) e para uso em
 *   scripts ops / CSV import.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { seedDefaultFlows } from "@/lib/services/flow-seed.service"

const log = logger.child("InitFlows")

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const result = await seedDefaultFlows(storeId, admin)

    return successResponse(request, {
      created: result.flows_created,
      skipped: result.skipped,
      emails_created: result.emails_created,
    })
  } catch (error) {
    log.error("Init flows error:", error)
    return errorResponse(request, error, "init-flows")
  }
}
