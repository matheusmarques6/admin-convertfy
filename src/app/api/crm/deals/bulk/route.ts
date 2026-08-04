/**
 * POST /api/crm/deals/bulk — aplica uma ação a vários deals de uma vez
 *
 * Trocar o responsável de 30 negócios não pode custar 30 telas. Cada
 * ação registra atividade na timeline de cada deal (auditoria: quem fez
 * o quê em lote), e o resultado volta por deal — parcial é possível.
 *
 * Ações:
 *   assign_owner  { owner_id }              — troca responsável
 *   add_tags      { tags: [] }              — adiciona (união, sem duplicar)
 *   remove_tags   { tags: [] }              — remove
 *   move_stage    { stage_id, lost_reason? } — move e deriva status
 *   archive                                  — soft delete (status=archived)
 *
 * Deliberadamente FORA daqui: exclusão definitiva. Em lote, um clique
 * errado apaga o histórico comercial inteiro; arquivar é reversível.
 *
 * Automações de deal_stage_change NÃO disparam em lote — mover 50 deals
 * de uma vez dispararia 50 mensagens ao cliente. Movimento em massa é
 * arrumação interna; avanço comercial se faz no card.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { ensureClientForDeal } from "@/lib/services/crm-client-link.service"

const log = logger.child("CrmDealsBulk")

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Teto por chamada: acima disso a UI deve paginar a seleção. */
const MAX_IDS = 200

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign_owner"),
    ids: z.array(uuid()).min(1).max(MAX_IDS),
    owner_id: uuid(),
  }),
  z.object({
    action: z.literal("add_tags"),
    ids: z.array(uuid()).min(1).max(MAX_IDS),
    tags: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  }),
  z.object({
    action: z.literal("remove_tags"),
    ids: z.array(uuid()).min(1).max(MAX_IDS),
    tags: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  }),
  z.object({
    action: z.literal("move_stage"),
    ids: z.array(uuid()).min(1).max(MAX_IDS),
    stage_id: uuid(),
    lost_reason: z.string().max(240).nullable().optional(),
    won_reason: z.string().max(240).nullable().optional(),
  }),
  z.object({
    action: z.literal("archive"),
    ids: z.array(uuid()).min(1).max(MAX_IDS),
  }),
])

interface DealRow {
  id: string
  title: string
  tags: string[] | null
  stage_id: string
  pipeline_id: string
  status: string
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = bodySchema.parse(body)
    const ids = Array.from(new Set(parsed.ids))

    const { data: dealsData, error: dealsErr } = await admin
      .from("deals")
      .select("id, title, tags, stage_id, pipeline_id, status")
      .in("id", ids)
    if (dealsErr) throw dealsErr

    const deals = (dealsData as DealRow[] | null) ?? []
    if (deals.length === 0) {
      throw new AppError("Nenhum negócio encontrado", 404, "not-found")
    }

    let updated = 0
    let activityText = ""

    switch (parsed.action) {
      case "assign_owner": {
        const { data: owner } = await admin
          .from("profiles")
          .select("id, name")
          .eq("id", parsed.owner_id)
          .maybeSingle()
        if (!owner) {
          throw new AppError("Responsável não encontrado", 422, "validation-error")
        }

        const { error } = await admin
          .from("deals")
          .update({ owner_id: parsed.owner_id })
          .in("id", ids)
        if (error) throw error

        updated = deals.length
        activityText = `Responsável alterado para ${owner.name} (ação em massa)`
        break
      }

      case "add_tags":
      case "remove_tags": {
        // tags é TEXT[] por linha: cada deal precisa do próprio merge.
        const wanted = parsed.tags.map((t) => t.trim()).filter(Boolean)
        for (const d of deals) {
          const current = d.tags ?? []
          const next =
            parsed.action === "add_tags"
              ? Array.from(new Set([...current, ...wanted]))
              : current.filter((t) => !wanted.includes(t))
          // Sem mudança real: não gasta escrita nem polui a timeline
          if (
            next.length === current.length &&
            next.every((t, i) => t === current[i])
          ) {
            continue
          }
          const { error } = await admin
            .from("deals")
            .update({ tags: next })
            .eq("id", d.id)
          if (error) throw error
          updated++
        }
        activityText =
          parsed.action === "add_tags"
            ? `Tags adicionadas: ${wanted.join(", ")} (ação em massa)`
            : `Tags removidas: ${wanted.join(", ")} (ação em massa)`
        break
      }

      case "move_stage": {
        const { data: stage } = await admin
          .from("pipeline_stages")
          .select("id, name, stage_type, pipeline_id")
          .eq("id", parsed.stage_id)
          .maybeSingle()
        if (!stage) {
          throw new AppError("Etapa não encontrada", 422, "validation-error")
        }

        // Mesma regra do move individual: o pipeline vem da etapa, senão
        // o deal fica órfão entre dois boards.
        const status =
          stage.stage_type === "won"
            ? "won"
            : stage.stage_type === "lost"
              ? "lost"
              : "open"

        const update: Record<string, unknown> = {
          stage_id: stage.id,
          pipeline_id: stage.pipeline_id,
          status,
        }
        if (status === "lost" && parsed.lost_reason !== undefined) {
          update.lost_reason = parsed.lost_reason
        }
        if (status === "won" && parsed.won_reason !== undefined) {
          update.won_reason = parsed.won_reason
        }

        // Um a um: o trigger de mudança de etapa é BEFORE UPDATE FOR EACH
        // ROW e escreve o histórico por deal — update em lote também
        // dispararia, mas assim o erro de um não derruba os outros.
        for (const d of deals) {
          const { error } = await admin.from("deals").update(update).eq("id", d.id)
          if (error) throw error
          updated++
        }

        // Ganho em massa também fecha o ciclo: lead → cliente vinculado
        // por deal (fail-open — falha em um não afeta os outros).
        if (status === "won") {
          const { data: opMember } = await admin
            .from("org_members")
            .select("org_id")
            .eq("profile_id", user.id)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle()
          const fallbackOrgId = opMember?.org_id ?? null
          await Promise.allSettled(
            deals.map((d) => ensureClientForDeal(admin, d.id, { fallbackOrgId })),
          )
        }

        activityText = `Movido para "${stage.name}" (ação em massa)`
        break
      }

      case "archive": {
        const { error } = await admin
          .from("deals")
          .update({ status: "archived" })
          .in("id", ids)
        if (error) throw error
        updated = deals.length
        activityText = "Negócio arquivado (ação em massa)"
        break
      }
    }

    // Timeline: quem fez a ação em lote e o quê. Falha aqui não desfaz
    // a operação — o dado principal já foi gravado.
    if (updated > 0 && activityText) {
      const { error: actErr } = await admin.from("crm_deal_activities").insert(
        deals.map((d) => ({
          deal_id: d.id,
          type: "system",
          content: activityText,
          created_by: user.id,
          is_internal: true,
        })),
      )
      if (actErr) {
        log.warn("[Bulk] atividades não registradas", { error: actErr.message })
      }
    }

    log.info("[Bulk] aplicado", {
      action: parsed.action,
      requested: ids.length,
      updated,
      by: user.id,
    })

    return successResponse(request, {
      action: parsed.action,
      requested: ids.length,
      updated,
      not_found: ids.length - deals.length,
    })
  } catch (error) {
    log.error("Deals bulk error:", error)
    return errorResponse(request, error, "crm-deals-bulk")
  }
}
