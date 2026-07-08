/**
 * GET /api/admin/agents/runs — execuções de agentes AO VIVO (Story AE-9).
 *
 * Snapshot consolidado da live view: runs recentes (incluindo os que estão
 * em `status='running'` NESTE momento, graças à instrumentação
 * start/finish), agregados da janela e a visão do pipeline por loja
 * (fila, dispatch job, emails por status, agentes rodando agora).
 *
 * Usado como carga inicial da página `/admin/agents/runs` e como fallback
 * SWR quando o SSE cai. Detalhe de um run reusa o endpoint existente
 * `/api/admin/email-generation-logs/[id]`.
 *
 * Query params:
 *   - window_min: janela em minutos (default 60, max 10080)
 *   - agent: filtra por agente (valor cru de email_generation_runs.agent)
 *   - status: running|success|error|skipped
 *   - store_id: UUID
 *   - limit: default 100, max 200
 *
 * Auth: canManagePrompts (admin/owner OU tag 'dev') — mesma cautela da
 * página de logs (prompts podem conter dados de briefing).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  ForbiddenError,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import {
  buildPipelineOverview,
  computeAggregate,
  fetchLiveRuns,
} from "@/lib/services/agent-runs-live.service"
import { logger } from "@/lib/logger"

const log = logger.child("AgentRunsRoute")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, tags")
      .eq("id", user.id)
      .maybeSingle()
    const actor = {
      id: user.id,
      role: (profile as { role?: string | null } | null)?.role ?? null,
      tags: ((profile as { tags?: string[] } | null)?.tags ?? []) as string[],
    }
    if (!canManagePrompts(actor)) throw new ForbiddenError()

    const sp = request.nextUrl.searchParams
    const windowMin = Math.min(
      Math.max(parseInt(sp.get("window_min") ?? "60", 10) || 60, 5),
      10080,
    )
    const limit = Math.min(
      Math.max(parseInt(sp.get("limit") ?? "100", 10) || 100, 1),
      200,
    )
    const storeId = sp.get("store_id")
    const agent = sp.get("agent")
    const status = sp.get("status")

    const sinceIso = new Date(Date.now() - windowMin * 60 * 1000).toISOString()

    const [runs, pipeline] = await Promise.all([
      fetchLiveRuns({ sinceIso, storeId, agent, status, limit }),
      buildPipelineOverview(storeId),
    ])

    return successResponse(request, {
      window_min: windowMin,
      generated_at: new Date().toISOString(),
      runs,
      aggregate: computeAggregate(runs),
      pipeline,
    })
  } catch (error) {
    log.error("GET agents/runs error", error)
    return errorResponse(request, error, "agents-runs-get")
  }
}
