/**
 * POST /api/admin/stores/[id]/rerender
 * GET  /api/admin/stores/[id]/rerender/preview
 *
 * Story AE-20 — botao "Re-renderizar tudo" no workspace de producao.
 *
 * Thin endpoint: apenas insere um sinal `rerender` em
 * `email_generation_queue_signals`. O cron watchdog ja consome o sinal,
 * chama `resetEmailsForRerender(storeId, flowId?)` + dispara fase 2
 * (image + html + QA) via `dispatchRenderForCopyReady`.
 *
 * Por que nao chamar reset/dispatch direto?
 *   - Mantem pipeline consistente (1 caminho unico).
 *   - Idempotente: se o cron falhar, watchdog retenta o sinal.
 *
 * Body:
 *   { scope: 'store' | 'flow', flow_id?: string (uuid) }
 *
 * Status:
 *   200 — sinal enfileirado (inclui count de emails alvo)
 *   401 — sem auth
 *   404 — store nao encontrada ou flow nao pertence a store
 *   422 — scope='flow' sem flow_id, ou body invalido
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
  ValidationError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("StoreRerender")

export const dynamic = "force-dynamic"

const bodySchema = z
  .object({
    scope: z.enum(["store", "flow"]).default("store"),
    flow_id: z.string().uuid().optional(),
  })
  .refine((d) => d.scope !== "flow" || !!d.flow_id, {
    message: "flow_id obrigatorio quando scope='flow'",
    path: ["flow_id"],
  })

// Statuses elegiveis para reset (espelha resetEmailsForRerender em
// email-generation-trigger.service.ts:624). Drafts e copy_* nao sao
// resetados — preservamos emails que ainda nao geraram copy.
const RESETABLE_STATUSES = ["rendering", "qa_running", "ready", "failed"]

interface FlowRow {
  id: string
  store_id: string
}

async function countTargetEmails(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  flowId?: string,
): Promise<number> {
  let flowIds: string[]
  if (flowId) {
    flowIds = [flowId]
  } else {
    const { data: flows, error } = await admin
      .from("email_flows")
      .select("id")
      .eq("store_id", storeId)
    if (error) throw error
    flowIds = ((flows ?? []) as Array<{ id: string }>).map((f) => f.id)
  }
  if (flowIds.length === 0) return 0

  const { count, error } = await admin
    .from("email_flow_emails")
    .select("id", { count: "exact", head: true })
    .in("flow_id", flowIds)
    .in("status", RESETABLE_STATUSES)
  if (error) throw error
  return count ?? 0
}

async function assertFlowBelongsToStore(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  flowId: string,
): Promise<void> {
  const { data: flow, error } = await admin
    .from("email_flows")
    .select("id, store_id")
    .eq("id", flowId)
    .eq("store_id", storeId)
    .maybeSingle<FlowRow>()
  if (error) throw error
  if (!flow) {
    throw new AppError(
      "Flow nao encontrado ou nao pertence a esta loja.",
      404,
      "flow_not_in_store",
    )
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const raw = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message || "Body invalido")
    }
    const { scope, flow_id: flowId } = parsed.data

    // Confirmar que a store existe (auth ja garantiu user, mas store
    // pode nao existir / nao ser visivel).
    const { data: storeRow, error: storeErr } = await admin
      .from("client_stores")
      .select("id")
      .eq("id", storeId)
      .maybeSingle()
    if (storeErr) throw storeErr
    if (!storeRow) {
      throw new AppError("Loja nao encontrada.", 404, "store_not_found")
    }

    if (scope === "flow" && flowId) {
      await assertFlowBelongsToStore(admin, storeId, flowId)
    }

    // Contar emails que serao resetados pelo cron. Usado pelo frontend
    // pra mostrar mensagem do toast pos-confirmacao.
    const emailsToRerender = await countTargetEmails(
      admin,
      storeId,
      scope === "flow" ? flowId : undefined,
    )

    // Inserir sinal. `triggered_by='manual'` (CHECK aceita: briefing_confirmed,
    // manual, watchdog_retry). `signal_type='rerender'` foi adicionado em AE-19.
    // payload.flow_id e lido por `consumeQueueSignal` em
    // email-generation-trigger.service.ts pra restringir o reset/dispatch.
    const payload: Record<string, unknown> = {
      scope,
      requested_by: user.id,
    }
    if (scope === "flow" && flowId) payload.flow_id = flowId

    const { data: signal, error: sigErr } = await admin
      .from("email_generation_queue_signals")
      .insert({
        store_id: storeId,
        triggered_by: "manual",
        signal_type: "rerender",
        status: "pending",
        payload,
      })
      .select("id")
      .single<{ id: string }>()

    if (sigErr) throw sigErr

    log.info("signal_enqueued", {
      storeId,
      scope,
      flowId: flowId ?? null,
      signalId: signal.id,
      emailsToRerender,
      userId: user.id,
    })

    return successResponse(request, {
      signal_id: signal.id,
      scope,
      flow_id: flowId ?? null,
      emails_to_rerender: emailsToRerender,
      message:
        "Re-renderizacao enfileirada. Cron vai processar em ate 1 min.",
    })
  } catch (error) {
    log.error("error", error)
    return errorResponse(request, error, "store-rerender")
  }
}

/**
 * GET /api/admin/stores/[id]/rerender?scope=store|flow&flow_id=?
 *
 * Preview: retorna o count de emails que SERIAM resetados pelo POST.
 * Usado pelo modal de confirmacao antes do POST.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const url = new URL(request.url)
    const scope = (url.searchParams.get("scope") ?? "store") as
      | "store"
      | "flow"
    const flowId = url.searchParams.get("flow_id") ?? undefined

    if (scope !== "store" && scope !== "flow") {
      throw new ValidationError("scope deve ser 'store' ou 'flow'")
    }
    if (scope === "flow" && !flowId) {
      throw new ValidationError("flow_id obrigatorio quando scope='flow'")
    }

    if (scope === "flow" && flowId) {
      await assertFlowBelongsToStore(admin, storeId, flowId)
    }

    const count = await countTargetEmails(
      admin,
      storeId,
      scope === "flow" ? flowId : undefined,
    )

    return successResponse(request, {
      scope,
      flow_id: flowId ?? null,
      emails_to_rerender: count,
    })
  } catch (error) {
    log.error("preview_error", error)
    return errorResponse(request, error, "store-rerender-preview")
  }
}
