/**
 * GET  /api/crm/deals/duplicates?pipeline_id= — grupos de negócios
 *      ABERTOS do mesmo contato (client_id ou lead_id) na pipeline
 * POST /api/crm/deals/duplicates — mescla: re-aponta vínculos
 *      (atividades, produtos, conversas, arquivos, histórico) para o
 *      sobrevivente ANTES de apagar os duplicados, e recalcula o valor
 *      quando itens de produto migram.
 *
 * Só negócios ABERTOS entram na detecção: dois fechados pro mesmo
 * cliente é histórico legítimo (renovação), não duplicidade.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { recalcDealValue } from "@/lib/services/crm-deal-products.service"

const log = logger.child("CrmDealDuplicates")

export const dynamic = "force-dynamic"

interface DupDeal {
  id: string
  title: string
  value: number | null
  stage_id: string
  client_id: string | null
  lead_id: string | null
  owner_id: string | null
  created_at: string
  owner?: { name: string } | null
  client?: { name: string } | null
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const pipelineId = request.nextUrl.searchParams.get("pipeline_id")
    if (!pipelineId) throw new AppError("pipeline_id obrigatório", 422, "validation-error")

    const { data: deals, error } = await admin
      .from("deals")
      .select(
        `id, title, value, stage_id, client_id, lead_id, owner_id, created_at,
         owner:profiles!deals_owner_id_fkey (name),
         client:clients (name)`,
      )
      .eq("pipeline_id", pipelineId)
      .eq("status", "open")
      .limit(2000)
    if (error) throw error

    // Agrupa por contato: client_id vence; sem client, lead_id.
    const buckets = new Map<string, DupDeal[]>()
    for (const raw of (deals ?? []) as unknown as DupDeal[]) {
      const key = raw.client_id
        ? `client:${raw.client_id}`
        : raw.lead_id
          ? `lead:${raw.lead_id}`
          : null
      if (!key) continue
      const list = buckets.get(key)
      if (list) list.push(raw)
      else buckets.set(key, [raw])
    }

    const groups = Array.from(buckets.entries())
      .filter(([, list]) => list.length >= 2)
      .map(([key, list]) => ({
        key,
        deals: list
          .slice()
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((d) => ({
            id: d.id,
            title: d.title,
            value: d.value == null ? null : Number(d.value),
            owner_name: (Array.isArray(d.owner) ? d.owner[0] : d.owner)?.name ?? null,
            contact_name:
              (Array.isArray(d.client) ? d.client[0] : d.client)?.name ?? null,
            created_at: d.created_at,
          })),
        // Sugestão: o mais antigo (first touch) — a UI deixa trocar.
        suggested_survivor_id: list
          .slice()
          .sort((a, b) => a.created_at.localeCompare(b.created_at))[0].id,
      }))
      .slice(0, 50)

    return successResponse(request, { groups })
  } catch (error) {
    log.error("DealDuplicates GET error:", error)
    return errorResponse(request, error, "crm-deal-duplicates-get")
  }
}

const mergeSchema = z.object({
  survivor_id: uuid(),
  duplicate_ids: z.array(uuid()).min(1).max(20),
})

/** Tabelas com FK deal_id que precisam migrar ANTES do delete. */
const DEAL_REFS = [
  "crm_deal_activities",
  "crm_deal_products",
  "crm_threads",
  "crm_deal_history",
  "crm_deal_files",
] as const

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const { survivor_id, duplicate_ids } = mergeSchema.parse(body)
    if (duplicate_ids.includes(survivor_id)) {
      throw new AppError("O sobrevivente não pode estar entre os duplicados", 422, "validation-error")
    }

    const { data: survivor } = await admin
      .from("deals")
      .select("id, title")
      .eq("id", survivor_id)
      .maybeSingle()
    if (!survivor) throw new AppError("Negócio sobrevivente não encontrado", 404, "not-found")

    // Re-aponta vínculos. Tabela ausente em algum ambiente é pulada —
    // melhor migrar o que existe do que abortar o merge inteiro.
    for (const table of DEAL_REFS) {
      const { error } = await admin
        .from(table)
        .update({ deal_id: survivor_id })
        .in("deal_id", duplicate_ids)
      if (error && !/does not exist|42P01/i.test(`${error.code} ${error.message}`)) {
        throw error
      }
    }

    const { error: delErr } = await admin.from("deals").delete().in("id", duplicate_ids)
    if (delErr) throw delErr

    // Itens de produto podem ter migrado — o valor do sobrevivente
    // passa a ser a soma consolidada.
    await recalcDealValue(admin, survivor_id)

    await admin.from("crm_deal_activities").insert({
      deal_id: survivor_id,
      type: "system",
      content: `${duplicate_ids.length} negócio(s) duplicado(s) mesclado(s) neste`,
      created_by: user.id,
      is_internal: true,
    })

    log.info("[DealDuplicates] merge", { survivor_id, merged: duplicate_ids.length })
    return successResponse(request, { merged: duplicate_ids.length })
  } catch (error) {
    log.error("DealDuplicates POST error:", error)
    return errorResponse(request, error, "crm-deal-duplicates-post")
  }
}
