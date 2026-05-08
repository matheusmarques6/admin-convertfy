/**
 * POST /api/crm/leads/import
 *
 * Importa leads + deals em batch a partir de rows mapeadas. O parse
 * do CSV e o mapeamento de colunas acontecem no client; aqui recebemos
 * apenas linhas ja normalizadas no shape Convertfy.
 *
 * Por linha:
 *   1. Cria/encontra crm_leads (deduplica por email se vier)
 *   2. Cria deals no pipeline+stage indicados
 *   3. Linka deal.lead_id ao lead criado
 *
 * Para imports grandes (1000+) processa em chunks de 50 e retorna
 * relatorio { imported, errors, leadIds, dealIds }.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("CrmLeadsImport")

export const dynamic = "force-dynamic"

const rowSchema = z.object({
  // Lead
  name: z.string().min(1).max(240),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  // Deal (opcional)
  deal_title: z.string().nullable().optional(),
  deal_value: z.number().nullable().optional(),
  deal_stage_name: z.string().nullable().optional(),
  // Metadata
  external_id: z.string().nullable().optional(),
})

const importSchema = z.object({
  pipeline_id: uuid(),
  default_stage_id: uuid(),
  /** Quando true, cria deal pra cada lead. Caso contrario so cria lead. */
  create_deals: z.boolean().optional().default(true),
  rows: z.array(rowSchema).min(1).max(2000),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = importSchema.parse(body)

    // Carrega stages do pipeline pra fazer fuzzy match com deal_stage_name.
    const { data: stages } = await admin
      .from("pipeline_stages")
      .select("id, name")
      .eq("pipeline_id", parsed.pipeline_id)

    if (!stages) {
      throw new AppError("Pipeline nao encontrado", 404, "not-found")
    }

    const stageByNormalizedName = new Map<string, string>()
    for (const s of stages) {
      stageByNormalizedName.set(normalizeStageName(s.name), s.id)
    }

    // Posicao corrente por stage (pra preservar ordem dos cards inseridos).
    const positionByStage = new Map<string, number>()
    if (parsed.create_deals) {
      const { data: maxPositions } = await admin
        .from("deals")
        .select("stage_id, position")
        .in(
          "stage_id",
          stages.map((s) => s.id),
        )
        .order("position", { ascending: false })
      for (const row of maxPositions || []) {
        if (!positionByStage.has(row.stage_id)) {
          positionByStage.set(row.stage_id, (row.position || 0) + 10)
        }
      }
    }

    const result = {
      imported: 0,
      errors: [] as Array<{ row: number; error: string; name?: string }>,
      leadIds: [] as string[],
      dealIds: [] as string[],
    }

    // Process em chunks pra nao estourar timeout em CSVs grandes.
    const CHUNK_SIZE = 50
    for (let i = 0; i < parsed.rows.length; i += CHUNK_SIZE) {
      const chunk = parsed.rows.slice(i, i + CHUNK_SIZE)

      // Pre-busca leads existentes por email pra deduplicar.
      const emails = chunk
        .map((r) => r.email)
        .filter((e): e is string => Boolean(e))
      const existingByEmail = new Map<string, string>()
      if (emails.length > 0) {
        const { data: existing } = await admin
          .from("crm_leads")
          .select("id, email")
          .eq("org_id", orgId)
          .in("email", emails)
        for (const e of existing || []) {
          if (e.email) existingByEmail.set(e.email.toLowerCase(), e.id)
        }
      }

      // Insere leads novos em batch.
      const newLeads = chunk
        .filter((r) => !r.email || !existingByEmail.has(r.email.toLowerCase()))
        .map((r) => ({
          org_id: orgId,
          name: r.name.trim(),
          email: r.email || null,
          phone: r.phone || null,
          company: r.company || null,
          source: r.source || null,
          tags: r.tags ?? [],
          notes: r.notes || null,
          status: "new" as const,
          created_by: user.id,
        }))

      let insertedLeads: Array<{ id: string; email: string | null }> = []
      if (newLeads.length > 0) {
        const { data, error } = await admin
          .from("crm_leads")
          .insert(newLeads)
          .select("id, email")
        if (error) {
          log.error("[Import] insert leads failed", { error: error.message, chunkStart: i })
          result.errors.push({
            row: i,
            error: `Falha ao inserir lote de leads: ${error.message}`,
          })
          continue
        }
        insertedLeads = data || []
      }

      // Mapa email/index → leadId pra encontrar deal target.
      const leadIdForRow: (string | null)[] = chunk.map((r) => {
        if (r.email) {
          const fromExisting = existingByEmail.get(r.email.toLowerCase())
          if (fromExisting) return fromExisting
          const fromInserted = insertedLeads.find(
            (l) => l.email?.toLowerCase() === r.email!.toLowerCase(),
          )
          if (fromInserted) return fromInserted.id
        }
        // Sem email: pega primeiro lead inserido nesse chunk que ainda
        // nao foi linkado. Heuristica simples — assume mesmo nome ordem.
        return null
      })

      // Pra rows sem email, usa ordem dos inseridos sem email.
      const leadlessInserted = insertedLeads.filter((l) => !l.email)
      let leadlessIdx = 0
      for (let j = 0; j < chunk.length; j++) {
        if (leadIdForRow[j]) continue
        if (leadlessIdx < leadlessInserted.length) {
          leadIdForRow[j] = leadlessInserted[leadlessIdx].id
          leadlessIdx += 1
        }
      }

      result.leadIds.push(...(leadIdForRow.filter(Boolean) as string[]))

      // Cria deals em batch.
      if (parsed.create_deals) {
        const dealsPayload = chunk
          .map((r, j) => {
            const leadId = leadIdForRow[j]
            if (!leadId) return null
            const targetStageId =
              (r.deal_stage_name &&
                stageByNormalizedName.get(normalizeStageName(r.deal_stage_name))) ||
              parsed.default_stage_id
            const pos =
              (positionByStage.get(targetStageId) ?? 0) + 10
            positionByStage.set(targetStageId, pos)
            return {
              pipeline_id: parsed.pipeline_id,
              stage_id: targetStageId,
              lead_id: leadId,
              title: r.deal_title || r.name,
              value: r.deal_value ?? 0,
              currency: "BRL",
              probability: 50,
              status: "open" as const,
              source: r.source || null,
              tags: r.tags ?? [],
              owner_id: user.id,
              position: pos,
              utm: {},
            }
          })
          .filter((d): d is NonNullable<typeof d> => d !== null)

        if (dealsPayload.length > 0) {
          const { data: dealsInserted, error: dealsErr } = await admin
            .from("deals")
            .insert(dealsPayload)
            .select("id")
          if (dealsErr) {
            log.error("[Import] insert deals failed", { error: dealsErr.message, chunkStart: i })
            result.errors.push({
              row: i,
              error: `Falha ao inserir lote de deals: ${dealsErr.message}`,
            })
          } else {
            result.dealIds.push(...(dealsInserted || []).map((d) => d.id))
          }
        }
      }

      result.imported += chunk.length - 0 // rows processadas (mesmo deduplicadas contam)
    }

    log.info("[Import] complete", {
      imported: result.imported,
      leads: result.leadIds.length,
      deals: result.dealIds.length,
      errors: result.errors.length,
    })

    return successResponse(request, {
      imported: result.imported,
      leadsCreated: result.leadIds.length,
      dealsCreated: result.dealIds.length,
      errors: result.errors,
    })
  } catch (error) {
    log.error("Leads import error:", error)
    return errorResponse(request, error, "crm-leads-import")
  }
}

/**
 * Normaliza nome de stage pra fuzzy match: lowercase, remove acentos,
 * remove pontuacao, trim. Permite que "Lead frio/Nutrição" do CSV
 * Kommo case com "lead frio nutricao" do nosso pipeline.
 */
function normalizeStageName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacritics
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}
