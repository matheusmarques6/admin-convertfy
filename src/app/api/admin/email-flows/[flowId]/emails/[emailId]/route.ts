/**
 * GET    /api/admin/email-flows/[flowId]/emails/[emailId]
 *   Retorna detalhe completo do email: blocos + HTML + QA checklist.
 *
 * PATCH  /api/admin/email-flows/[flowId]/emails/[emailId]
 *   Atualiza envelope (subject, preheader, from), status, html.
 *
 * DELETE /api/admin/email-flows/[flowId]/emails/[emailId]
 *   Remove o email (cascade em blocos + QA via FK).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import {
  approveTaskOnEmailApproved,
  finishTaskOnEmailReady,
} from "@/lib/services/email-task-sync.service"
import { isTextOnlyEmail } from "@/lib/agents/architect/blueprint-loader"

const log = logger.child("EmailDetail")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ flowId: string; emailId: string }> },
) {
  try {
    const { emailId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data: email, error } = await admin
      .from("email_flow_emails")
      .select("*")
      .eq("id", emailId)
      .single()

    if (error || !email) {
      return errorResponse(
        request,
        new Error("Email nao encontrado"),
        "email-detail-not-found",
      )
    }

    const [{ data: blocks }, { data: qa }, { data: flowRow }] = await Promise.all([
      admin
        .from("email_blocks")
        .select("*")
        .eq("email_id", emailId)
        .order("position", { ascending: true }),
      admin
        .from("email_qa_checklist")
        .select("*")
        .eq("email_id", emailId)
        .order("position", { ascending: true }),
      admin
        .from("email_flows")
        .select("flow_type")
        .eq("id", email.flow_id as string)
        .maybeSingle(),
    ])

    // Email "somente texto" (email_blueprints.text_only): a view do designer
    // abre direto no modo Copy (só o texto) e esconde render/HTML.
    const textOnly = flowRow?.flow_type
      ? await isTextOnlyEmail(
          admin,
          flowRow.flow_type as string,
          email.number as number,
        )
      : false

    return successResponse(request, {
      email: {
        ...email,
        blocks: blocks || [],
        qa_items: qa || [],
        text_only: textOnly,
      },
    })
  } catch (error) {
    log.error("Email detail GET error:", error)
    return errorResponse(request, error, "email-detail-get")
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  from_name: z.string().max(120).nullable().optional(),
  from_email: z.string().email().nullable().optional(),
  subject: z.string().max(240).nullable().optional(),
  preheader: z.string().max(240).nullable().optional(),
  html: z.string().nullable().optional(),
  delay_hours: z.number().int().min(0).nullable().optional(),
  status: z.enum(["draft", "in_progress", "ready", "approved", "live"]).optional(),
  klaviyo_message_id: z.string().nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ flowId: string; emailId: string }> },
) {
  try {
    const { flowId, emailId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    const { error } = await admin
      .from("email_flow_emails")
      .update(parsed)
      .eq("id", emailId)

    if (error) throw error

    // Auto-promote flow status quando status do email muda
    if (parsed.status) {
      await syncFlowStatusFromEmails(admin, flowId)

      // Best-effort: sync com a task de onboarding correspondente.
      // Falhas não derrubam o PATCH (decoupling).
      if (parsed.status === "ready") {
        await finishTaskOnEmailReady({ flowId, emailId }).catch((err) =>
          log.error("sync task→review failed", { emailId, err }),
        )
      } else if (parsed.status === "approved") {
        await approveTaskOnEmailApproved({ flowId, emailId }).catch((err) =>
          log.error("sync task→completed failed", { emailId, err }),
        )
      }
    }

    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Email PATCH error:", error)
    return errorResponse(request, error, "email-patch")
  }
}

/**
 * Recalcula flow.status com base nos status dos emails:
 *  - Se TODOS os emails sao "live" -> flow "live"
 *  - Se TODOS sao "approved" ou "live" -> flow "approved"
 *  - Se TODOS sao "ready+" -> flow "ready_for_review"
 *  - Se algum esta em progresso -> flow "in_progress"
 *  - Sem emails ou todos draft -> NAO altera (preserva blocked manual)
 *
 * NAO sobrescreve flow.status === "blocked" (decisao manual do user).
 */
async function syncFlowStatusFromEmails(
  admin: ReturnType<typeof createAdminClient>,
  flowId: string,
) {
  const { data: flow } = await admin
    .from("email_flows")
    .select("status")
    .eq("id", flowId)
    .single()
  if (!flow || flow.status === "blocked") return

  const { data: emails } = await admin
    .from("email_flow_emails")
    .select("status")
    .eq("flow_id", flowId)
  if (!emails || emails.length === 0) return

  const statuses = emails.map((e) => e.status as string)
  let nextStatus: string
  if (statuses.every((s) => s === "live")) {
    nextStatus = "live"
  } else if (statuses.every((s) => s === "approved" || s === "live")) {
    nextStatus = "approved"
  } else if (
    statuses.every(
      (s) => s === "ready" || s === "approved" || s === "live",
    )
  ) {
    nextStatus = "ready_for_review"
  } else if (statuses.some((s) => s !== "draft")) {
    nextStatus = "in_progress"
  } else {
    return // todos draft, preserva o atual
  }

  if (nextStatus !== flow.status) {
    await admin
      .from("email_flows")
      .update({ status: nextStatus })
      .eq("id", flowId)
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ flowId: string; emailId: string }> },
) {
  try {
    const { emailId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { error } = await admin
      .from("email_flow_emails")
      .delete()
      .eq("id", emailId)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Email DELETE error:", error)
    return errorResponse(request, error, "email-delete")
  }
}
