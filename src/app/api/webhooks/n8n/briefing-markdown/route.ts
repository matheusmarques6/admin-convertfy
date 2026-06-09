/**
 * POST /api/webhooks/n8n/briefing-markdown
 *
 * Callback do n8n que persiste o briefing completo em markdown
 * (saída final do AI Agent) em `store_briefings`.
 *
 * Versionamento: arquiva o status='current' anterior e insere o novo
 * como 'current'. Metadados (mode, model, tokens) ficam no jsonb
 * briefing_data porque o schema da tabela não tem colunas dedicadas.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { resolveMarkdownWrite, type BriefingMarkdownRow } from "./dedup"
import {
  errorResponse,
  successResponse,
  parseAndValidate,
  NotFoundError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

const schema = z.object({
  store_id: z.string().uuid(),
  markdown: z.string().min(200),
  mode: z.enum(["full", "reduced", "reduced-enriched"]),
  generated_at: z.string().datetime().optional(),
  model_used: z.string().max(100).optional(),
  tokens_used: z.number().int().nonnegative().optional(),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const body = await parseAndValidate(request, schema)
    const admin = createAdminClient()

    const { data: store, error: storeErr } = await admin
      .from("client_stores")
      .select("id")
      .eq("id", body.store_id)
      .single()
    if (storeErr || !store) throw new NotFoundError("Loja")

    const generatedAt = body.generated_at ?? new Date().toISOString()

    // Lê versões existentes p/ dedup + version=max+1 (defensivo).
    const { data: existing } = await admin
      .from("store_briefings")
      .select("version, briefing_data, generated_by, status")
      .eq("store_id", body.store_id)
      .order("version", { ascending: false })

    const rows = (existing ?? []) as BriefingMarkdownRow[]
    const { deduped, nextVersion } = resolveMarkdownWrite(rows, body.markdown)

    // Idempotência: markdown idêntico ao current → no-op (não arquiva, não
    // insere, não dispara a geração).
    if (deduped) {
      logger.info("[n8n:briefing-markdown] dedup_noop", {
        store_id: body.store_id,
      })
      return successResponse(request, {
        data: { store_id: body.store_id, deduped: true },
      })
    }

    // Arquiva versão atual
    const { error: archErr } = await admin
      .from("store_briefings")
      .update({ status: "archived" })
      .eq("store_id", body.store_id)
      .eq("status", "current")
    if (archErr) throw archErr

    // Insere nova como current (version = max+1)
    const briefingData = {
      markdown: body.markdown,
      mode: body.mode,
      model_used: body.model_used ?? null,
      tokens_used: body.tokens_used ?? null,
    }

    const { data: inserted, error: insErr } = await admin
      .from("store_briefings")
      .insert({
        store_id: body.store_id,
        briefing_data: briefingData,
        version: nextVersion,
        generated_at: generatedAt,
        generated_by: "n8n:briefing-markdown",
        status: "current",
      })
      .select("id")
      .single()
    if (insErr) throw insErr

    logger.info("[n8n:briefing-markdown] persisted", {
      store_id: body.store_id,
      briefing_id: inserted?.id,
      mode: body.mode,
    })

    // NB: o disparo da geração de email NÃO acontece aqui. O n8n sinaliza a
    // conclusão da Pesquisa & Diagnóstico via webhook dedicado
    // (/api/webhooks/n8n/pesquisa-completa), que é o gatilho do Architect+copy.
    return successResponse(request, {
      data: { store_id: body.store_id, briefing_id: inserted?.id },
    })
  } catch (e) {
    return errorResponse(request, e, "n8n:briefing-markdown")
  }
}
