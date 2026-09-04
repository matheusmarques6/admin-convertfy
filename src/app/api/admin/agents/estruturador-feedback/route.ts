/**
 * Feedback do COO sobre a decisão de UMA run (fase 4 do ADR
 * adr-estruturador-adaptativo).
 *
 * Nasceu para o Estruturador e desde 04/09 serve também o Curador
 * (migration 20261111): o agente sai da run, não do caller — pedir o nome
 * no corpo abriria a porta para gravar feedback de Curador numa run de
 * Estruturador.
 *
 * GET  ?run_id=<uuid>  — feedbacks da run (com nome do autor), p/ o painel
 *                        de embasamento do Estúdio.
 * POST { run_id, rating: 'up'|'down', comentario? } — upsert por
 *      (run_id, autor): reclicar atualiza, não duplica. Contexto
 *      (store/flow/email) denormalizado da própria run, best-effort.
 *
 * Auth: canManagePrompts (admin/owner OU tag 'dev') — mesmo gate do Estúdio.
 * Tabela: estruturador_feedback (migration 20261084; RLS sem policies =
 * service-role only — este endpoint É o caminho).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  ForbiddenError,
  requireAuth,
  successResponse,
  ValidationError,
} from "@/lib/api/errors"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import { agenteDaRun, ROTULO_AGENTE } from "@/lib/agents/shared/agente-calibravel"
import { logger } from "@/lib/logger"

const log = logger.child("EstruturadorFeedbackRoute")

export const dynamic = "force-dynamic"

async function requireManager(userId: string) {
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, tags")
    .eq("id", userId)
    .maybeSingle()
  const actor = {
    id: userId,
    role: (profile as { role?: string | null } | null)?.role ?? null,
    tags: ((profile as { tags?: string[] } | null)?.tags ?? []) as string[],
  }
  if (!canManagePrompts(actor)) throw new ForbiddenError()
  return admin
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = await requireManager(user.id)

    const runId = request.nextUrl.searchParams.get("run_id")
    if (!runId) throw new ValidationError("run_id é obrigatório")

    const { data, error } = await admin
      .from("estruturador_feedback")
      .select("id, run_id, rating, comentario, created_by, created_at, updated_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: true })
    if (error) throw error

    // Nome dos autores num lookup só (profiles não tem FK expandível aqui).
    const authorIds = Array.from(
      new Set((data ?? []).map((f) => f.created_by).filter(Boolean)),
    ) as string[]
    const names = new Map<string, string>()
    if (authorIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, name, email")
        .in("id", authorIds)
      for (const p of profiles ?? []) {
        names.set(
          p.id as string,
          ((p.name as string | null) || (p.email as string | null) || "—"),
        )
      }
    }

    return successResponse(request, {
      feedbacks: (data ?? []).map((f) => ({
        ...f,
        autor: f.created_by ? (names.get(f.created_by as string) ?? null) : null,
        mine: f.created_by === user.id,
      })),
    })
  } catch (error) {
    log.error("GET estruturador feedback error", error)
    return errorResponse(request, error, "estruturador-feedback-get")
  }
}

const postSchema = z.object({
  run_id: z.string().uuid(),
  rating: z.enum(["up", "down"]),
  comentario: z.string().trim().max(4000).optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = await requireManager(user.id)

    const body = postSchema.parse(await request.json())

    // Contexto denormalizado da run (best-effort — a run é a fonte).
    const { data: run } = await admin
      .from("email_generation_runs")
      .select("id, agent, store_id, email_id")
      .eq("id", body.run_id)
      .maybeSingle()
    if (!run) throw new ValidationError("run não encontrada")
    // O agente vem da RUN. A tela manda 👍/👎 e comentário — nunca de quem
    // é a decisão julgada.
    const agente = agenteDaRun(run.agent as string)
    if (!agente)
      throw new ValidationError(
        `feedback é só para runs de ${Object.values(ROTULO_AGENTE).join(" ou ")}`,
      )

    let flowType: string | null = null
    let emailNumber: number | null = null
    if (run.email_id) {
      const { data: email } = await admin
        .from("email_flow_emails")
        .select("number, flow:email_flows(flow_type)")
        .eq("id", run.email_id)
        .maybeSingle()
      emailNumber = (email?.number as number | undefined) ?? null
      flowType =
        ((email?.flow as { flow_type?: string } | null)?.flow_type as
          | string
          | undefined) ?? null
    }

    const { data, error } = await admin
      .from("estruturador_feedback")
      .upsert(
        {
          run_id: body.run_id,
          agente,
          store_id: run.store_id ?? null,
          flow_type: flowType,
          email_number: emailNumber,
          rating: body.rating,
          comentario: body.comentario?.trim() || null,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "run_id,created_by" },
      )
      .select("id, rating, comentario, created_at, updated_at")
      .maybeSingle()
    if (error) throw error

    return successResponse(request, { feedback: data })
  } catch (error) {
    log.error("POST estruturador feedback error", error)
    return errorResponse(request, error, "estruturador-feedback-post")
  }
}
