/**
 * POST /api/admin/tools/fix-dark-canvas
 *
 * Manutenção one-shot: corrige emails LEGADOS gerados com canvas escuro
 * (faixas pretas nas laterais) antes do guard de luminance em
 * `deriveColorRoles`. Aplica `fixDarkCanvas` no HTML persistido — troca
 * só a cor do canvas por branco, preservando copy, imagens e CTAs.
 *
 * Por que não re-render? `resetEmailsForRerender` + fase 2 REGERA as
 * imagens de todos os emails (custo LLM + muda visual já aprovado). Aqui
 * é um rewrite cirúrgico de string, sem nenhuma chamada de IA.
 *
 * Body:
 *   - dry_run: boolean (default TRUE — só relata, não grava)
 *   - store_id?: uuid (restringe a uma loja)
 *   - limit?: número máx de emails escaneados (default 500, max 2000)
 *
 * Response: { dry_run, scanned, changed, stores: [{store_id, store_name,
 * changed, email_ids}] }
 *
 * Auth: canManagePrompts (admin/owner OU tag 'dev').
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  ForbiddenError,
  parseAndValidate,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import { fixDarkCanvas } from "@/lib/agents/html/fix-dark-canvas"
import { logger } from "@/lib/logger"

const log = logger.child("FixDarkCanvasTool")

export const dynamic = "force-dynamic"
export const maxDuration = 300

const schema = z.object({
  dry_run: z.boolean().optional().default(true),
  store_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(2000).optional().default(500),
})

// Emails com HTML final persistido — os que aparecem pro time/cliente.
const TARGET_STATUSES = ["ready", "approved", "live"]

interface EmailRow {
  id: string
  status: string
  html: string | null
  flow: { store_id: string } | Array<{ store_id: string }>
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, tags")
      .eq("id", user.id)
      .maybeSingle()
    const actor = {
      id: user.id,
      role: (profile as { role?: string | null } | null)?.role ?? null,
      tags: ((profile as { tags?: string[] } | null)?.tags ?? []) as string[],
    }
    if (!canManagePrompts(actor)) throw new ForbiddenError()

    const body = await parseAndValidate(request, schema)

    // Paginação interna: html pode ter 50-100kb — páginas pequenas.
    const PAGE = 50
    let scanned = 0
    let changed = 0
    const byStore = new Map<string, { changed: number; email_ids: string[] }>()

    for (let offset = 0; offset < body.limit; offset += PAGE) {
      let query = admin
        .from("email_flow_emails")
        .select("id, status, html, flow:email_flows!inner(store_id)")
        .in("status", TARGET_STATUSES)
        .not("html", "is", null)
        .order("id", { ascending: true })
        .range(offset, Math.min(offset + PAGE, body.limit) - 1)
      if (body.store_id) query = query.eq("flow.store_id", body.store_id)

      const { data, error } = await query
      if (error) throw error
      const rows = (data ?? []) as unknown as EmailRow[]
      if (rows.length === 0) break

      for (const row of rows) {
        scanned += 1
        if (!row.html) continue
        const result = fixDarkCanvas(row.html)
        if (!result.changed) continue

        const storeId = Array.isArray(row.flow)
          ? row.flow[0]?.store_id
          : row.flow?.store_id
        if (!body.dry_run) {
          const { error: upErr } = await admin
            .from("email_flow_emails")
            .update({ html: result.html, updated_at: new Date().toISOString() })
            .eq("id", row.id)
          if (upErr) {
            log.error("update_failed", { emailId: row.id, error: upErr.message })
            continue
          }
        }

        changed += 1
        if (storeId) {
          const agg = byStore.get(storeId) ?? { changed: 0, email_ids: [] }
          agg.changed += 1
          agg.email_ids.push(row.id)
          byStore.set(storeId, agg)
        }
        log.info(body.dry_run ? "would_fix" : "fixed", {
          emailId: row.id,
          storeId,
          hexes: result.replaced_hexes,
        })
      }

      if (rows.length < PAGE) break
    }

    // Nomes das lojas afetadas.
    const storeIds = [...byStore.keys()]
    const namesRes = storeIds.length
      ? await admin.from("client_stores").select("id, store_name").in("id", storeIds)
      : { data: [] }
    const nameOf = new Map(
      ((namesRes.data ?? []) as Array<{ id: string; store_name: string | null }>).map(
        (s) => [s.id, s.store_name],
      ),
    )

    log.info("done", {
      dryRun: body.dry_run,
      scanned,
      changed,
      stores: storeIds.length,
      by: user.id,
    })

    return successResponse(request, {
      dry_run: body.dry_run,
      scanned,
      changed,
      stores: storeIds.map((id) => ({
        store_id: id,
        store_name: nameOf.get(id) ?? null,
        changed: byStore.get(id)!.changed,
        email_ids: byStore.get(id)!.email_ids,
      })),
    })
  } catch (error) {
    log.error("POST fix-dark-canvas error", error)
    return errorResponse(request, error, "fix-dark-canvas")
  }
}
