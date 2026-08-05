/**
 * POST /api/crm/channels/[id]/instagram/setup-automation — cria a
 * automação "interação no Instagram → negócio na pipeline" pré-montada
 * (estilo Datacrazy), sem passar pelo builder.
 *
 * O corpo escolhe gatilho (DM, comentário ou ambos), pipeline/etapa de
 * destino e se ativa já. A montagem do trigger flat + DAG é do módulo
 * puro `instagram-automation.ts` — coluna `trigger` (que o dispatcher
 * usa) e config do nó (que o builder mostra) nascem espelhados.
 *
 * Idempotente por conteúdo: automação idêntica já existente (mesmo
 * gatilho + mesmo destino) é devolvida com `already_exists` em vez de
 * duplicar — double-click no dialog não cria duas.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import {
  buildInstagramAutomation,
  isSameInstagramAutomation,
} from "@/lib/services/instagram-automation"

const log = logger.child("IgSetupAutomation")

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  pipeline_id: uuid,
  stage_id: uuid,
  event_kind: z.enum(["message", "comment", "any"]).default("any"),
  first_message_only: z.boolean().default(true),
  only_this_channel: z.boolean().default(true),
  activate: z.boolean().default(true),
})

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const raw = await request.json().catch(() => ({}))
    const body = bodySchema.parse(raw)

    const { data: channel } = await admin
      .from("crm_channels")
      .select("id, org_id, type, display_name, is_active")
      .eq("id", channelId)
      .maybeSingle<{ id: string; org_id: string; type: string; display_name: string; is_active: boolean }>()

    if (!channel || channel.org_id !== orgId) {
      throw new AppError("Canal não encontrado", 404, "not-found")
    }
    if (channel.type !== "instagram") {
      throw new AppError("Esta automação só existe para canais Instagram", 422, "unsupported-channel")
    }

    // Pipeline e etapa têm de existir, ser da org e combinar entre si —
    // automação apontando para etapa de outra pipeline criaria negócio
    // órfão no board.
    const { data: pipeline } = await admin
      .from("pipelines")
      .select("id, org_id, name, scope")
      .eq("id", body.pipeline_id)
      .maybeSingle<{ id: string; org_id: string | null; name: string; scope: string | null }>()
    if (!pipeline || (pipeline.org_id && pipeline.org_id !== orgId)) {
      throw new AppError("Pipeline não encontrada", 404, "not-found")
    }
    const { data: stage } = await admin
      .from("pipeline_stages")
      .select("id, pipeline_id, name")
      .eq("id", body.stage_id)
      .maybeSingle<{ id: string; pipeline_id: string; name: string }>()
    if (!stage || stage.pipeline_id !== pipeline.id) {
      throw new AppError("A etapa escolhida não pertence à pipeline", 422, "validation-error")
    }

    const built = buildInstagramAutomation({
      channelId: channel.id,
      channelName: channel.display_name,
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      stageId: stage.id,
      stageName: stage.name,
      eventKind: body.event_kind,
      firstMessageOnly: body.first_message_only,
      onlyThisChannel: body.only_this_channel,
    })

    // Já existe uma idêntica? Devolve ela (e ativa se pedido) em vez de
    // criar duplicata.
    const { data: existing } = await admin
      .from("automations")
      .select("id, name, is_active, trigger, dag")
      .eq("org_id", orgId)
      .filter("trigger->>type", "eq", "thread_message_received")
      .returns<
        Array<{
          id: string
          name: string
          is_active: boolean
          trigger: Record<string, unknown> | null
          dag: { nodes?: Array<{ type?: string; config?: Record<string, unknown> }> } | null
        }>
      >()

    const duplicate = (existing ?? []).find((a) => isSameInstagramAutomation(a, built))
    if (duplicate) {
      if (body.activate && !duplicate.is_active) {
        await admin.from("automations").update({ is_active: true }).eq("id", duplicate.id)
      }
      log.info("automação já existia — reusando", { channelId, automationId: duplicate.id })
      return successResponse(request, {
        id: duplicate.id,
        name: duplicate.name,
        is_active: body.activate ? true : duplicate.is_active,
        already_exists: true,
      })
    }

    const { data: createdRow, error } = await admin
      .from("automations")
      .insert({
        name: built.name,
        description: built.description,
        scope: pipeline.scope === "cs" ? "cs" : "sales",
        org_id: orgId,
        is_active: body.activate,
        version: 1,
        trigger: built.trigger,
        actions: [], // legado
        dag: built.dag,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (error) throw error

    log.info("automação criada pelo painel Instagram", {
      channelId,
      automationId: createdRow.id,
      event_kind: body.event_kind,
      pipeline: pipeline.name,
      active: body.activate,
    })

    return successResponse(request, {
      id: createdRow.id,
      name: built.name,
      is_active: body.activate,
      already_exists: false,
    })
  } catch (error) {
    log.error("instagram setup-automation error:", error)
    return errorResponse(request, error, "crm-instagram-setup-automation")
  }
}
