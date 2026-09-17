/**
 * GET /api/admin/agents/executions/[emailId]/filhos?agent=image&batch=<id>
 *
 * As N chamadas que um nó do canvas agrega — a lista que o leque do
 * Estúdio abre. Fica FORA da listagem de execuções de propósito: o SSE da
 * aba roda de 2 em 2 segundos e a arquitetura foi desenhada para que uma
 * conexão ociosa custe duas varreduras de índice e zero byte no cliente
 * (`agent-executions.service.ts`). Trazer 180 filhos em todo evento, para
 * um nó que talvez ninguém clique, é o padrão que custou 372 min de CPU no
 * incidente do inbox.
 *
 * Nenhuma rota de DETALHE nova: cada filho tem `run_id`, e o painel já
 * abre qualquer run por `/api/admin/email-generation-logs/[id]`.
 *
 * Auth: canManagePrompts, como as irmãs.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  ForbiddenError,
  requireAuth,
  successResponse,
  ValidationError,
} from "@/lib/api/errors"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import { logger } from "@/lib/logger"

const log = logger.child("AgentExecutionChildrenRoute")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ emailId: string }> },
) {
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

    const { emailId } = await ctx.params
    const agent = request.nextUrl.searchParams.get("agent")
    // O batch da tentativa, vindo do agregado da linha do nó. Sem ele a
    // RPC usa o da tentativa mais recente — nunca o histórico (um e-mail
    // regenerado tem centenas de runs do mesmo agente).
    const batch = request.nextUrl.searchParams.get("batch")

    if (!agent) throw new ValidationError("parâmetro `agent` é obrigatório")

    const { data, error } = await admin.rpc("agent_studio_run_children", {
      p_email_id: emailId,
      p_agent: agent,
      p_batch_id: batch || null,
    })
    if (error) throw error

    const filhos = (data ?? []).map(
      (r: {
        run_id: string
        agent: string
        status: string
        model: string | null
        created_at: string
        duration_ms: number | null
        cost_cents: number | string | null
        tokens_input: number | null
        tokens_output: number | null
        retry_count: number | null
        error_message: string | null
        rotulo: string | null
        sub_rotulo: string | null
        image_url: string | null
      }) => ({
        run_id: r.run_id,
        agent: r.agent,
        status: r.status,
        model: r.model,
        created_at: r.created_at,
        duration_ms: r.duration_ms,
        cost_cents: r.cost_cents != null ? Number(r.cost_cents) : null,
        tokens_input: r.tokens_input,
        tokens_output: r.tokens_output,
        retry_count: r.retry_count,
        error_message: r.error_message,
        rotulo: r.rotulo,
        sub_rotulo: r.sub_rotulo,
        image_url: r.image_url,
      }),
    )

    return successResponse(request, { filhos })
  } catch (err) {
    log.error("filhos.erro", { err })
    return errorResponse(request, err, "filhos")
  }
}
