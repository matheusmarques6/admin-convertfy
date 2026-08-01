/**
 * GET  /api/crm/leads/duplicates — grupos de leads duplicados
 * POST /api/crm/leads/duplicates — mescla um grupo (survivor + dupes)
 *
 * Duplicado = mesmo email ou mesmo telefone (com tolerância ao nono
 * dígito BR). Regras de agrupamento e do plano de merge em
 * crm-lead-merge.ts (18 testes) — a rota só aplica.
 *
 * Ordem do merge importa: re-apontar os vínculos ANTES de apagar.
 * As FKs de deals/threads/submissions são ON DELETE SET NULL — apagar
 * primeiro desligaria o histórico em vez de transferi-lo.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import {
  findDuplicateGroups,
  planLeadMerge,
  type DupLead,
} from "@/lib/services/crm-lead-merge"

const log = logger.child("CrmLeadDuplicates")

export const dynamic = "force-dynamic"

const LEAD_FIELDS =
  "id, name, email, phone, company, role, source, status, utm, tags, notes, custom_fields, converted_to_deal_id, created_at"

async function fetchScopedLeads(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string | null,
): Promise<DupLead[]> {
  let q = admin
    .from("crm_leads")
    .select(LEAD_FIELDS)
    .eq("scope", "sales")
    .order("created_at", { ascending: true })
    .limit(5000)
  // Mesma regra do funil: lead antigo de formulário público não tem
  // org_id — excluí-lo esconderia justamente os duplicados de inbound.
  if (orgId) q = q.or(`org_id.eq.${orgId},org_id.is.null`)
  const { data, error } = await q
  if (error) throw error
  return (data as DupLead[] | null) ?? []
}

async function resolveOrg(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
  return data?.org_id ?? null
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrg(admin, user.id)

    const leads = await fetchScopedLeads(admin, orgId)
    const groups = findDuplicateGroups(leads).slice(0, 50)

    return successResponse(request, {
      groups,
      total_duplicates: groups.reduce((s, g) => s + g.leads.length, 0),
    })
  } catch (error) {
    log.error("Duplicates GET error:", error)
    return errorResponse(request, error, "crm-lead-duplicates-get")
  }
}

const mergeSchema = z.object({
  survivor_id: uuid(),
  duplicate_ids: z.array(uuid()).min(1).max(10),
})

/** Tabelas que apontam pra crm_leads e precisam migrar pro sobrevivente. */
const LEAD_REFS: Array<{ table: string; column: string }> = [
  { table: "deals", column: "lead_id" },
  { table: "crm_threads", column: "lead_id" },
  { table: "crm_deal_activities", column: "lead_id" },
  { table: "crm_form_submissions", column: "lead_id" },
  { table: "crm_automation_runs", column: "lead_id" },
  { table: "crm_conversion_events", column: "lead_id" },
]

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrg(admin, user.id)
    if (!orgId) throw new AppError("Sem org membership", 403)

    const body = await request.json()
    const parsed = mergeSchema.parse(body)

    if (parsed.duplicate_ids.includes(parsed.survivor_id)) {
      throw new AppError(
        "O sobrevivente não pode estar na lista de duplicados.",
        422,
        "validation-error",
      )
    }

    const ids = [parsed.survivor_id, ...parsed.duplicate_ids]
    const { data: rows, error: fetchErr } = await admin
      .from("crm_leads")
      .select(LEAD_FIELDS)
      .in("id", ids)
    if (fetchErr) throw fetchErr

    const found = (rows as DupLead[] | null) ?? []
    const survivor = found.find((l) => l.id === parsed.survivor_id)
    const dupes = found.filter((l) => parsed.duplicate_ids.includes(l.id))

    if (!survivor) throw new AppError("Lead sobrevivente não encontrado", 404, "not-found")
    if (dupes.length !== parsed.duplicate_ids.length) {
      throw new AppError(
        "Um dos leads duplicados não existe mais — recarregue a lista.",
        409,
        "conflict",
      )
    }

    const plan = planLeadMerge(survivor, dupes)

    // 1. Re-aponta vínculos. Tabela ausente (migration pendente) não
    //    pode abortar o merge das demais.
    const moved: Record<string, number> = {}
    for (const ref of LEAD_REFS) {
      const { data: updated, error } = await admin
        .from(ref.table)
        .update({ [ref.column]: survivor.id })
        .in(ref.column, parsed.duplicate_ids)
        .select("id")
      if (error) {
        const msg = (error.message || "").toLowerCase()
        if (msg.includes("does not exist") || error.code === "42P01") continue
        throw error
      }
      moved[ref.table] = updated?.length ?? 0
    }

    // 2. Atualiza o sobrevivente com o plano (se há o que mudar)
    if (Object.keys(plan.updates).length > 0) {
      const { error } = await admin
        .from("crm_leads")
        .update(plan.updates)
        .eq("id", survivor.id)
      if (error) throw error
    }

    // 3. Apaga os duplicados — só depois de tudo re-apontado
    const { error: delErr } = await admin
      .from("crm_leads")
      .delete()
      .in("id", parsed.duplicate_ids)
    if (delErr) throw delErr

    // 4. Auditoria na timeline do sobrevivente
    await admin.from("crm_deal_activities").insert({
      lead_id: survivor.id,
      type: "system",
      content: `Mesclado com ${dupes.length} lead${dupes.length > 1 ? "s" : ""} duplicado${dupes.length > 1 ? "s" : ""}: ${dupes.map((d) => d.name).join(", ")}`,
      created_by: user.id,
      is_internal: true,
    })

    log.info("[LeadMerge] concluído", {
      survivor: survivor.id,
      merged: dupes.length,
      moved,
      by: user.id,
    })

    return successResponse(request, {
      survivor_id: survivor.id,
      merged: dupes.length,
      moved,
      updated_fields: Object.keys(plan.updates),
    })
  } catch (error) {
    log.error("Merge POST error:", error)
    return errorResponse(request, error, "crm-lead-merge-post")
  }
}
