/**
 * POST /api/admin/email-flows/[flowId]/emails/[emailId]/duplicate
 *   Duplica um email existente: copia envelope, blocos e itens de QA.
 *   Cria novo email com number = max+1 e nome "<original> (copia)".
 *   Novos blocos vem com applied=false; QA com done=false.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailDuplicate")

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ flowId: string; emailId: string }> },
) {
  try {
    const { flowId, emailId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data: source, error: srcErr } = await admin
      .from("email_flow_emails")
      .select("*")
      .eq("id", emailId)
      .single()
    if (srcErr || !source) {
      return errorResponse(
        request,
        new Error("Email origem nao encontrado"),
        "email-duplicate-not-found",
      )
    }

    const [{ data: srcBlocks }, { data: srcQA }, { data: maxRow }] =
      await Promise.all([
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
          .from("email_flow_emails")
          .select("number")
          .eq("flow_id", flowId)
          .order("number", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

    const nextNumber = ((maxRow?.number as number | undefined) ?? 0) + 1

    const { data: created, error: insErr } = await admin
      .from("email_flow_emails")
      .insert({
        flow_id: flowId,
        number: nextNumber,
        name: `${source.name} (cópia)`,
        from_name: source.from_name,
        from_email: source.from_email,
        subject: source.subject,
        preheader: source.preheader,
        delay_hours: source.delay_hours,
        status: "draft",
      })
      .select("*")
      .single()

    if (insErr || !created) throw insErr ?? new Error("Falha ao criar email duplicado")

    if (srcBlocks && srcBlocks.length > 0) {
      const blocksToInsert = srcBlocks.map((b) => ({
        email_id: created.id,
        block_type: b.block_type,
        position: b.position,
        label: b.label,
        content: b.content,
        applied: false,
      }))
      const { error: blkErr } = await admin
        .from("email_blocks")
        .insert(blocksToInsert)
      if (blkErr) log.error("Block copy error:", blkErr)
    }

    if (srcQA && srcQA.length > 0) {
      const qaToInsert = srcQA.map((q) => ({
        email_id: created.id,
        position: q.position,
        label: q.label,
        category: q.category,
        done: false,
      }))
      const { error: qaErr } = await admin
        .from("email_qa_checklist")
        .insert(qaToInsert)
      if (qaErr) log.error("QA copy error:", qaErr)
    }

    return successResponse(request, { email: created })
  } catch (error) {
    log.error("Email duplicate error:", error)
    return errorResponse(request, error, "email-duplicate")
  }
}
