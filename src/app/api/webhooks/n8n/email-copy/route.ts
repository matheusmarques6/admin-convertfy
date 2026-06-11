/**
 * POST /api/webhooks/n8n/email-copy
 *
 * Callback streaming do n8n: cada email completo dispara um POST aqui.
 * Persiste subject/preheader em email_flow_emails e content em email_blocks,
 * marca status = 'copy_ready'.
 *
 * Story AE-3:
 *  - Idempotencia: callbacks duplicados (status >= copy_ready) viram no-op
 *  - copy_ready_at = now() na transicao
 *
 * Story AE-19 (split callback):
 *  - O callback NAO dispara mais fase 2 diretamente. O email fica em
 *    copy_ready aguardando o GATE 2 (designer confirmar a identidade
 *    visual). Quando store_brand_identity.confirmed_at vira NULL -> NOT NULL,
 *    o trigger fn_on_brand_identity_confirmed enfileira um sinal
 *    signal_type='render' em email_generation_queue_signals e o watchdog
 *    (front 1) chama runPhase2InBackground pra cada email em copy_ready.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import {
  errorResponse,
  successResponse,
  AppError,
  NotFoundError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { resolveBrandTokens } from "@/lib/agents/html/brand-guards"

const log = logger.child("N8nEmailCopy")

export const dynamic = "force-dynamic"

// Status que indicam que a fase 2 ja foi disparada (ou ja terminou).
// Callbacks duplicados nesses estados sao no-op idempotente.
const IDEMPOTENT_STATUSES = new Set([
  "copy_ready",
  "rendering",
  "qa_running",
  "ready",
  "failed",
])

const schema = z.object({
  store_id: z.string().uuid(),
  email_id: z.string().uuid(),
  subject: z.string().min(1),
  preheader: z.string().optional().nullable(),
  blocks: z.array(
    z.object({
      block_id: z.string().uuid(),
      content: z.record(z.string(), z.unknown()),
    }),
  ),
  meta: z
    .object({
      model: z.string().optional(),
      tokens_input: z.number().int().nonnegative().optional(),
      tokens_output: z.number().int().nonnegative().optional(),
      duration_ms: z.number().int().nonnegative().optional(),
    })
    .optional(),
})

export async function POST(request: NextRequest) {
  // Lê o corpo BRUTO antes de validar — assim QUALQUER rejeição (secret /
  // schema / email não encontrado) deixa rastro nos logs do que o n8n mandou.
  // Sem isso a falha era invisível e a copy "sumia" sem explicação.
  const rawText = await request.text().catch(() => "")
  let rawJson: Record<string, unknown> = {}
  try {
    rawJson = JSON.parse(rawText) as Record<string, unknown>
  } catch {
    /* corpo não-JSON */
  }
  log.info("email_copy.received", {
    has_secret_header: !!request.headers.get("x-webhook-secret"),
    body_keys: Object.keys(rawJson),
    store_id: rawJson.store_id ?? null,
    email_id: rawJson.email_id ?? null,
    blocks_count: Array.isArray(rawJson.blocks) ? rawJson.blocks.length : null,
    raw_len: rawText.length,
  })

  try {
    requireWebhookSecret(request)

    const validated = schema.safeParse(rawJson)
    if (!validated.success) {
      log.warn("email_copy.validation_failed", {
        store_id: rawJson.store_id ?? null,
        email_id: rawJson.email_id ?? null,
        body_keys: Object.keys(rawJson),
        issues: validated.error.issues.slice(0, 8),
      })
      throw new AppError("Payload do n8n inválido (schema email-copy)", 400)
    }
    const body = validated.data
    const admin = createAdminClient()

    // 1) Verifica email + flow pertencem à store (defesa contra spoofing)
    const { data: email, error: emailErr } = await admin
      .from("email_flow_emails")
      .select("id, flow_id, status, flow:email_flows(store_id)")
      .eq("id", body.email_id)
      .maybeSingle()

    if (emailErr || !email) {
      log.warn("email_copy.email_not_found", {
        email_id: body.email_id,
        store_id: body.store_id,
        db_error: emailErr?.message ?? null,
      })
      throw new NotFoundError("Email")
    }

    const flow = Array.isArray(email.flow) ? email.flow[0] : email.flow
    const flowStoreId = (flow as { store_id?: string } | null)?.store_id
    if (flowStoreId !== body.store_id) {
      log.warn("email_copy.store_mismatch", {
        email_id: body.email_id,
        body_store_id: body.store_id,
        actual_store_id: flowStoreId ?? null,
      })
      throw new NotFoundError("Email não pertence a esta loja")
    }

    // Busca store_name pra sanitizar tokens de brand que o n8n entrega
    // nao-resolvidos (ex: headline: "Bem-vindo {{BRAND_NAME}}!"). A
    // sanitizacao acontece ANTES do UPDATE em email_blocks.content, pra
    // que o HTML Agent receba o nome real no payload.
    const { data: store } = await admin
      .from("client_stores")
      .select("store_name")
      .eq("id", body.store_id)
      .maybeSingle()
    const brandName = (store?.store_name as string | undefined) || "Loja"

    // 1.5) AC AE-3.2 — idempotencia: callback duplicado para email ja
    // em status >= copy_ready vira no-op (200) sem disparar fase 2.
    const currentStatus = email.status as string | null
    if (currentStatus && IDEMPOTENT_STATUSES.has(currentStatus)) {
      log.info("webhook.duplicate_callback", {
        email_id: body.email_id,
        current_status: currentStatus,
      })
      return successResponse(request, {
        idempotent: true,
        current_status: currentStatus,
        email_id: body.email_id,
      })
    }

    // 2) PATCH email_flow_emails: subject, preheader, status, copy_ready_at
    const nowIso = new Date().toISOString()
    const { error: updEmailErr } = await admin
      .from("email_flow_emails")
      .update({
        subject: body.subject,
        preheader: body.preheader ?? null,
        status: "copy_ready",
        copy_ready_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", body.email_id)
    if (updEmailErr) throw updEmailErr

    // 3) PATCH email_blocks.content por block_id (com sanitizacao de tokens).
    // `.select("id")` faz o update RETORNAR as linhas afetadas — assim
    // blocksWritten reflete escritas REAIS (antes contava mesmo quando o
    // block_id nao casava nenhuma linha, mascarando ids velhos pos-reseed).
    let blocksWritten = 0
    let blocksUnmatched = 0
    let blocksSanitized = 0
    for (const b of body.blocks) {
      const cleaned = resolveBrandTokens(b.content, brandName) as Record<string, unknown>
      if (JSON.stringify(cleaned) !== JSON.stringify(b.content)) blocksSanitized++
      const { data: updated, error: blkErr } = await admin
        .from("email_blocks")
        .update({ content: cleaned })
        .eq("id", b.block_id)
        .eq("email_id", body.email_id)
        .select("id")
      if (blkErr) {
        log.warn("email_copy.block.update_failed", {
          email_id: body.email_id,
          block_id: b.block_id,
          error: blkErr.message,
        })
        continue
      }
      if (!updated || updated.length === 0) {
        blocksUnmatched++
        continue
      }
      blocksWritten++
    }
    if (blocksUnmatched > 0) {
      log.warn("email_copy.blocks_unmatched", {
        email_id: body.email_id,
        unmatched: blocksUnmatched,
        total: body.blocks.length,
        // block_id do n8n nao existe mais nesse email (estrutura re-semeada
        // depois do dispatch). Candidato a fallback por posicao.
      })
    }

    // 4) Telemetria
    await admin.from("email_generation_runs").insert({
      store_id: body.store_id,
      flow_id: email.flow_id,
      email_id: body.email_id,
      agent: "copy",
      status: "success",
      model: body.meta?.model ?? "n8n",
      tokens_input: body.meta?.tokens_input ?? null,
      tokens_output: body.meta?.tokens_output ?? null,
      duration_ms: body.meta?.duration_ms ?? null,
      parsed_output: {
        subject: body.subject,
        preheader: body.preheader ?? null,
        blocks_written: blocksWritten,
        blocks_total: body.blocks.length,
      },
    })

    log.info("email_copy.persisted", {
      email_id: body.email_id,
      blocks_written: blocksWritten,
      blocks_total: body.blocks.length,
      blocks_sanitized: blocksSanitized,
    })
    if (blocksSanitized > 0) {
      log.warn("email_copy.brand_tokens_resolved", {
        email_id: body.email_id,
        blocks_sanitized: blocksSanitized,
        // Indica que o n8n entregou copy com `{{BRAND_NAME}}` nao-resolvido.
        // Quando blocksSanitized for consistentemente > 0 em prod, abrir
        // ticket no workflow n8n pra resolver na origem.
      })
    }

    // 5) AE-19: fase 2 (render) agora aguarda confirmacao da identidade
    // visual. O dispatcher (cron watchdog, front 1) vai chamar
    // runPhase2InBackground quando store_brand_identity.confirmed_at virar
    // NOT NULL e este email estiver em status='copy_ready'. Ver
    // supabase/migrations/20260626c_email_render_signal_type.sql.
    log.info("email_copy.phase2_deferred", {
      email_id: body.email_id,
      store_id: body.store_id,
    })

    return successResponse(request, {
      ok: true,
      email_id: body.email_id,
      blocks_written: blocksWritten,
    })
  } catch (e) {
    return errorResponse(request, e, "n8n:email-copy")
  }
}
