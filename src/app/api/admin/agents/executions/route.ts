/**
 * GET /api/admin/agents/executions — execuções do pipeline AE agrupadas
 * por EMAIL, para a aba Execuções do Estúdio de Agentes.
 *
 * Uma "execução" = o estado atual da última geração de um email que passou
 * pelo pipeline: status agregado + a run MAIS RECENTE de cada agente. O
 * drill-down por nó usa `/api/admin/email-generation-logs/[id]` com o
 * run_id devolvido aqui.
 *
 * Esta rota é o PRIMEIRO CARREGAMENTO e o fallback; o tempo real vem do
 * SSE em `/api/sse/admin/agents/executions`. As duas montam o payload pelo
 * mesmo `fetchAgentExecutions` — se cada uma montasse por conta, a tela
 * mostraria uma coisa no carregamento e outra no primeiro evento.
 *
 * Query params:
 *   - limit: máx. de execuções (default 25, max 100)
 *   - status: 'success' | 'error' | 'running' (bucket do email)
 *   - store_id: UUID
 *
 * Auth: canManagePrompts (admin/owner OU tag 'dev') — mesmo gate dos logs.
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
import { fetchAgentExecutions } from "@/lib/services/agent-executions.service"
import type { ExecutionBucket } from "@/types/agent-executions"
import { logger } from "@/lib/logger"

const log = logger.child("AgentExecutionsRoute")

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
    const executions = await fetchAgentExecutions({
      limit: parseInt(sp.get("limit") ?? "25", 10) || 25,
      status: (sp.get("status") as ExecutionBucket | null) ?? null,
      storeId: sp.get("store_id"),
    })

    return successResponse(request, { executions })
  } catch (error) {
    log.error("GET agent executions error", error)
    return errorResponse(request, error, "agent-executions-get")
  }
}
