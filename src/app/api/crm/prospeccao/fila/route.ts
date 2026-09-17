/**
 * GET /api/crm/prospeccao/fila?pipeline_id=…&teto=40
 *
 * A fila de hoje: quem abordar, na ordem, com teto por dia.
 *
 * Pendente (follow-up vencido ou tarefa aberta) vem antes de conversa
 * nova, e o teto vale só sobre as novas — cortar follow-up pelo teto
 * mataria a cadência na metade todo dia.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import {
  TETO_DIARIO_PADRAO,
  montarFilaDoDia,
  type NegocioDaFila,
} from "@/lib/crm/fila-do-dia"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  pipeline_id: uuid(),
  teto: z.coerce.number().int().min(0).max(500).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const parsed = querySchema.safeParse({
      pipeline_id: request.nextUrl.searchParams.get("pipeline_id"),
      teto: request.nextUrl.searchParams.get("teto") ?? undefined,
    })
    if (!parsed.success) {
      throw new AppError("Informe a pipeline da fila.", 400, "bad-request")
    }
    const { pipeline_id, teto } = parsed.data

    const { data: etapas, error: eErr } = await admin
      .from("pipeline_stages")
      .select("id, name")
      .eq("pipeline_id", pipeline_id)
    if (eErr) throw eErr
    const nomePorEtapa = new Map((etapas ?? []).map((s) => [s.id, s.name]))

    const { data: deals, error: dErr } = await admin
      .from("deals")
      .select(
        `id, title, stage_id, position, tags, custom_fields,
         client:clients (phone),
         lead:crm_leads!deals_lead_id_fkey (phone)`,
      )
      .eq("pipeline_id", pipeline_id)
      .eq("status", "open")
      .order("position", { ascending: true })
    if (dErr) throw dErr

    // Tarefa aberta por negócio: é ela que promove o card a pendente.
    const ids = (deals ?? []).map((d) => d.id)
    const tarefaPorDeal = new Map<
      string,
      { id: string; content: string; due_at: string | null }
    >()
    if (ids.length > 0) {
      const { data: tarefas } = await admin
        .from("crm_deal_activities")
        .select("id, deal_id, content, due_at")
        .in("deal_id", ids)
        .eq("type", "task")
        .is("completed_at", null)
        .order("due_at", { ascending: true })
      for (const t of tarefas ?? []) {
        // A MAIS antiga vence: ela é a que define a urgência do card.
        if (t.deal_id && !tarefaPorDeal.has(t.deal_id)) {
          tarefaPorDeal.set(t.deal_id, {
            id: t.id,
            content: t.content,
            due_at: t.due_at,
          })
        }
      }
    }

    const negocios: NegocioDaFila[] = (deals ?? []).map((d) => {
      const client = Array.isArray(d.client) ? d.client[0] : d.client
      const lead = Array.isArray(d.lead) ? d.lead[0] : d.lead
      return {
        id: d.id,
        title: d.title,
        stage_name: nomePorEtapa.get(d.stage_id) ?? "",
        position: d.position ?? 0,
        tags: d.tags,
        custom_fields: d.custom_fields as Record<string, unknown> | null,
        contact_phone: client?.phone ?? lead?.phone ?? null,
        tarefa: tarefaPorDeal.get(d.id) ?? null,
      }
    })

    const fila = montarFilaDoDia(negocios, { teto: teto ?? TETO_DIARIO_PADRAO })

    return successResponse(request, {
      ...fila,
      teto: teto ?? TETO_DIARIO_PADRAO,
      total_aberto: negocios.length,
    })
  } catch (error) {
    return errorResponse(request, error, "crm-prospeccao-fila")
  }
}
