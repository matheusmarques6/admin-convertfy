/**
 * GET/POST /api/admin/objection-catalogs/batch — backfill do Catalogador.
 *
 * As lojas que já tinham Pesquisa & Diagnóstico (40 em set/2026) não passam
 * de novo pelo `pesquisa-completa`; o catálogo delas nasce por aqui, UMA
 * loja por chamada (o Catalogador leva ~30–60 s; um loop inteiro estouraria
 * o maxDuration e, pior, uma loja que falha sempre travaria as demais —
 * daí o `exclude_ids` anti-poison, padrão do Taguedor).
 *
 *   GET  → { pending: [{id, store_name}], total }  (lojas com pesquisa e sem catálogo)
 *   POST { exclude_ids?: string[], force?: boolean, store_id?: string }
 *        → { done: {id, store_name, status, objections}|null, remaining }
 *
 * Gate: admin/owner ou tag `dev` (`assertCanManagePrompts`).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, parseAndValidate, requireAuth, successResponse } from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { runCatalogador } from "@/lib/agents/objecoes/catalogador.service"
import { logger } from "@/lib/logger"

const log = logger.child("ObjectionCatalogBatch")

export const dynamic = "force-dynamic"
export const maxDuration = 120

const bodySchema = z.object({
  exclude_ids: z.array(z.string().uuid()).max(500).optional().default([]),
  force: z.boolean().optional().default(false),
  store_id: z.string().uuid().optional(),
})

interface Candidata {
  id: string
  store_name: string | null
}

async function listarPendentes(
  admin: ReturnType<typeof createAdminClient>,
  force: boolean,
): Promise<Candidata[]> {
  // Loja ativa com pesquisa de marca (o Catalogador precisa de contexto).
  let q = admin
    .from("client_stores")
    .select("id, store_name, objection_catalog")
    .eq("is_active", true)
    .not("brand_thesis", "is", null)
    .order("created_at", { ascending: true })
    .limit(500)
  if (!force) q = q.is("objection_catalog", null)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as Array<{ id: string; store_name: string | null }>).map((s) => ({
    id: s.id,
    store_name: s.store_name,
  }))
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)
    const pending = await listarPendentes(admin, false)
    return successResponse(request, { pending, total: pending.length })
  } catch (error) {
    return errorResponse(request, error, "objection-catalogs-batch")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)
    const body = await parseAndValidate(request, bodySchema)

    const excluded = new Set(body.exclude_ids)
    let alvo: Candidata | null = null
    let remaining = 0
    if (body.store_id) {
      const { data } = await admin
        .from("client_stores")
        .select("id, store_name")
        .eq("id", body.store_id)
        .maybeSingle()
      alvo = (data as Candidata | null) ?? null
    } else {
      const pendentes = (await listarPendentes(admin, body.force)).filter((c) => !excluded.has(c.id))
      alvo = pendentes[0] ?? null
      remaining = Math.max(0, pendentes.length - 1)
    }
    if (!alvo) return successResponse(request, { done: null, remaining: 0 })

    const r = await runCatalogador({ storeId: alvo.id, triggeredBy: user.id })
    log.info("batch.store_done", { store_id: alvo.id, status: r.status, objections: r.objections.length })
    return successResponse(request, {
      done: {
        id: alvo.id,
        store_name: alvo.store_name,
        status: r.status,
        objections: r.objections.length,
        erros: r.erros ?? [],
      },
      remaining,
    })
  } catch (error) {
    return errorResponse(request, error, "objection-catalogs-batch")
  }
}
