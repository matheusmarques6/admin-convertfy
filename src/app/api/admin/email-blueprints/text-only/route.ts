/**
 * PATCH /api/admin/email-blueprints/text-only
 *
 * Liga/desliga a flag "somente texto" de um email por CHAVE
 * (flow_type + email_number) — caminho de escrita da aba "Estrutura geral",
 * que não conhece id/source do blueprint. Upsert-por-chave:
 *   - UPDATE por chave; se atingiu row, pronto.
 *   - 0 rows + text_only=true: INSERT a partir do DEFAULT_BLUEPRINTS
 *     (a flag só existe em rows do DB — materializa o default).
 *   - 0 rows + text_only=false: no-op (ausência de row já significa false).
 *
 * Evita a corrida POST-vs-PATCH no client e mantém a fonte única em
 * email_blueprints (ver migration 20260811_email_blueprints_text_only.sql).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  requireAuth,
  successResponse,
  AppError,
} from "@/lib/api/errors"
import { DEFAULT_BLUEPRINTS } from "@/lib/agents/email-blueprint"
import { logger } from "@/lib/logger"

const log = logger.child("EmailBlueprintTextOnly")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  flow_type: z.string().min(1),
  email_number: z.number().int().min(1),
  text_only: z.boolean(),
})

export async function PATCH(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const { flow_type, email_number, text_only } = patchSchema.parse(body)

    // 1) UPDATE por chave (caminho comum: row já existe no DB).
    const { data: updated, error: updErr } = await admin
      .from("email_blueprints")
      .update({
        text_only,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("flow_type", flow_type)
      .eq("email_number", email_number)
      .select("id")

    if (updErr) throw updErr
    if (updated && updated.length > 0) {
      return successResponse(request, { ok: true, created: false, text_only })
    }

    // 2) Sem row. Desligar é no-op (sem row = false).
    if (!text_only) {
      return successResponse(request, { ok: true, created: false, text_only })
    }

    // 3) Materializa o blueprint a partir do DEFAULT in-code com a flag.
    const def = DEFAULT_BLUEPRINTS[flow_type]?.[email_number]
    if (!def) {
      throw new AppError(
        `Sem blueprint default para ${flow_type} #${email_number} — salve a arquitetura deste e-mail (aba "Arquitetura dos Emails") antes de marcar como somente texto.`,
        422,
      )
    }

    const { error: insErr } = await admin.from("email_blueprints").insert({
      flow_type,
      email_number,
      objective: def.objective,
      messaging: def.messaging,
      subject_hint: def.subject_hint,
      blocks: def.blocks,
      text_only: true,
      updated_by: user.id,
    })
    // 23505: outra sessão materializou o row entre o UPDATE e o INSERT —
    // repete o UPDATE em vez de falhar.
    if (insErr) {
      if (insErr.code === "23505") {
        const { error: retryErr } = await admin
          .from("email_blueprints")
          .update({
            text_only,
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          })
          .eq("flow_type", flow_type)
          .eq("email_number", email_number)
        if (retryErr) throw retryErr
        return successResponse(request, { ok: true, created: false, text_only })
      }
      throw insErr
    }

    log.info("text_only.materialized_from_default", {
      flow_type,
      email_number,
      by: user.id,
    })
    return successResponse(request, { ok: true, created: true, text_only })
  } catch (error) {
    log.error("Blueprint text-only PATCH error:", error)
    return errorResponse(request, error, "blueprint-text-only-patch")
  }
}
