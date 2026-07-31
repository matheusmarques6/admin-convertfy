/**
 * GET  /api/crm/channels/[id]/import-history — job atual + progresso.
 * POST /api/crm/channels/[id]/import-history — enfileira um job.
 *        body: { mode: 'dry_run'|'import', since_days?, include_media? }
 * PATCH /api/crm/channels/[id]/import-history — { action: 'pause'|'resume'|'cancel' }
 *
 * O POST só CRIA o job — quem processa é o cron
 * (/api/cron/crm-history-import), em páginas com cursor. Importar no
 * request morreria no teto de 60 s da função.
 *
 * `dry_run` percorre o histórico contando, sem gravar nada: é como se
 * mede o volume real antes de escrever a primeira linha.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("CrmImportHistoryRoute")

export const dynamic = "force-dynamic"

const JOB_COLUMNS =
  "id, mode, status, since_days, include_media, chats_total, cursor_chat_index, messages_seen, messages_imported, messages_skipped, error, started_at, finished_at, last_progress_at, created_at"

async function loadOwnEvolutionChannel(channelId: string) {
  const sb = await createClient()
  const user = await requireAuth(sb)
  const admin = createAdminClient()
  const orgId = await resolveOrgId(user.id)

  const { data } = await admin
    .from("crm_channels")
    .select("id, org_id, provider, display_name, is_active")
    .eq("id", channelId)
    .maybeSingle<{
      id: string
      org_id: string
      provider: string
      display_name: string
      is_active: boolean
    }>()

  if (!data || data.org_id !== orgId) throw new AppError("Canal não encontrado", 404, "not-found")
  if (data.provider !== "evolution") {
    throw new AppError(
      "Importação de histórico só existe para WhatsApp via QR (a Cloud API não entrega histórico anterior)",
      422,
      "unsupported-provider",
    )
  }
  return { admin, orgId, userId: user.id, channel: data }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await context.params
    const { admin } = await loadOwnEvolutionChannel(channelId)

    const { data: jobs } = await admin
      .from("crm_history_import_jobs")
      .select(JOB_COLUMNS)
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(5)

    const list = jobs ?? []
    const active = list.find((j) => j.status === "pending" || j.status === "running") ?? null

    return successResponse(request, { active, recent: list })
  } catch (error) {
    log.error("import-history GET error:", error)
    return errorResponse(request, error, "crm-import-history-get")
  }
}

const createSchema = z.object({
  mode: z.enum(["dry_run", "import"]).default("dry_run"),
  /** Janela de histórico. Omitido = tudo que a Evolution tiver. */
  since_days: z.number().int().min(1).max(3650).nullable().optional(),
  /** Mídia fica de fora por padrão: é o que pesa em tempo e storage. */
  include_media: z.boolean().default(false),
})

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await context.params
    const { admin, orgId, userId, channel } = await loadOwnEvolutionChannel(channelId)

    const raw = await request.json().catch(() => ({}))
    const body = createSchema.parse(raw)

    const { data: job, error } = await admin
      .from("crm_history_import_jobs")
      .insert({
        org_id: orgId,
        channel_id: channelId,
        mode: body.mode,
        since_days: body.since_days ?? null,
        include_media: body.include_media,
        created_by: userId,
      })
      .select(JOB_COLUMNS)
      .single()

    if (error) {
      // Índice parcial único: já existe job ativo para este canal.
      if (error.code === "23505") {
        throw new AppError(
          "Já existe uma importação em andamento para este canal",
          409,
          "job-already-running",
        )
      }
      throw error
    }

    log.info("job de importação criado", { channelId, channel: channel.display_name, mode: body.mode })
    return successResponse(request, { job })
  } catch (error) {
    log.error("import-history POST error:", error)
    return errorResponse(request, error, "crm-import-history-post")
  }
}

const patchSchema = z.object({ action: z.enum(["pause", "resume", "cancel"]) })

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await context.params
    const { admin } = await loadOwnEvolutionChannel(channelId)

    const raw = await request.json().catch(() => ({}))
    const { action } = patchSchema.parse(raw)

    const statusFilter =
      action === "resume" ? ["paused"] : ["pending", "running", "paused"]

    const update =
      action === "pause"
        ? { status: "paused" }
        : action === "resume"
          ? { status: "pending" }
          : { status: "failed", error: "Cancelado pelo operador", finished_at: new Date().toISOString() }

    const { data, error } = await admin
      .from("crm_history_import_jobs")
      .update(update)
      .eq("channel_id", channelId)
      .in("status", statusFilter)
      .select("id")

    if (error) throw error
    return successResponse(request, { updated: data?.length ?? 0, action })
  } catch (error) {
    log.error("import-history PATCH error:", error)
    return errorResponse(request, error, "crm-import-history-patch")
  }
}
