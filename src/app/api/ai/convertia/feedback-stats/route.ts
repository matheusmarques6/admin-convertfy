/**
 * GET /api/ai/convertia/feedback-stats?days=30 — agregado do feedback
 * 👍 das respostas da ConvertIA, POR MODELO e POR SKILL, pro card
 * "ConvertIA · Feedback" do dashboard de Custo de IA.
 *
 * Fonte: ai_chat_messages (role assistant) das conversas da org com
 * context.source='convertia'. "Respostas" = mensagens do assistente;
 * "úteis" = meta.feedback.rating === 'up'. Skills vêm de meta.skills
 * (nomes, gravados pela rota de chat a partir desta feature).
 *
 * Auth: mesmo gate do dashboard (admin/owner OU tag 'dev').
 */

import { NextRequest } from "next/server"
import { withTiming } from "@/lib/api/with-timing"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { logger } from "@/lib/logger"

const log = logger.child("ConvertiaFeedbackStats")

export const dynamic = "force-dynamic"

interface Bucket {
  responses: number
  useful: number
}

/** Projeção do meta (campos JSONB extraídos direto no PostgREST). */
interface MetaProjection {
  model?: string | null
  skills?: string[] | null
  feedback?: { rating?: string } | null
}

const MAX_ROWS = 5000

async function handleGet(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const days = Math.min(
      Math.max(parseInt(request.nextUrl.searchParams.get("days") ?? "30", 10) || 30, 1),
      365,
    )
    const since = new Date(Date.now() - days * 86_400_000).toISOString()

    // Só os três campos do JSONB que o painel usa. Trazer `meta`
    // inteiro puxava junto o array `sources` de cada resposta —
    // dezenas de KB por linha, megabytes na janela de 90 dias.
    const baseQuery = (select: string) =>
      admin
        .from("ai_chat_messages")
        .select(select)
        .eq("role", "assistant")
        .eq("ai_chat_conversations.org_id", orgId)
        .contains("ai_chat_conversations.context", { source: "convertia" })
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS)

    let rows: unknown[] | null = null
    const projected = await baseQuery(
      "model:meta->model, skills:meta->skills, feedback:meta->feedback, ai_chat_conversations!inner(org_id, context)",
    )
    if (projected.error) {
      // Projeção de JSONB não aceita → cai no meta inteiro (payload
      // maior, mesmo resultado). Nunca deixa o painel sumir.
      log.warn("projeção JSONB recusada — fallback para meta completo", {
        error: projected.error.message,
      })
      const full = await baseQuery("meta, ai_chat_conversations!inner(org_id, context)")
      if (full.error) throw full.error
      rows = (full.data ?? []).map((r) => {
        const meta = ((r as { meta?: MetaProjection }).meta ?? {}) as MetaProjection
        return { model: meta.model, skills: meta.skills, feedback: meta.feedback }
      })
    } else {
      rows = projected.data ?? []
    }

    const byModel = new Map<string, Bucket>()
    const bySkill = new Map<string, Bucket>()
    let responses = 0
    let useful = 0

    for (const row of rows ?? []) {
      // A projeção do PostgREST devolve os campos do JSONB no topo
      const meta = row as unknown as MetaProjection
      const isUseful = meta.feedback?.rating === "up"
      responses += 1
      if (isUseful) useful += 1

      const model = typeof meta.model === "string" && meta.model ? meta.model : "desconhecido"
      const mb = byModel.get(model) ?? { responses: 0, useful: 0 }
      mb.responses += 1
      if (isUseful) mb.useful += 1
      byModel.set(model, mb)

      for (const skill of Array.isArray(meta.skills) ? meta.skills : []) {
        if (typeof skill !== "string" || !skill) continue
        const sb2 = bySkill.get(skill) ?? { responses: 0, useful: 0 }
        sb2.responses += 1
        if (isUseful) sb2.useful += 1
        bySkill.set(skill, sb2)
      }
    }

    const toSorted = (map: Map<string, Bucket>) =>
      [...map.entries()]
        .map(([key, b]) => ({ key, ...b }))
        .sort((a, b) => b.responses - a.responses)

    return successResponse(request, {
      window_days: days,
      totals: { responses, useful },
      by_model: toSorted(byModel),
      by_skill: toSorted(bySkill),
      truncated: (rows?.length ?? 0) >= MAX_ROWS,
    })
  } catch (error) {
    return errorResponse(request, error, "convertia-feedback-stats")
  }
}

export const GET = withTiming("ai/convertia/feedback-stats", handleGet)
