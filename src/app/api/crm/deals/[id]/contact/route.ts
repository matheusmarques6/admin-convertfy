/**
 * PATCH /api/crm/deals/[id]/contact
 *
 * Ponto unico de escrita dos dados de contato da ficha do deal (nome,
 * email, telefone, empresa, endereco). Nenhum desses campos e coluna de
 * `deals`: eles moram em `clients` (deal com cliente) ou `crm_leads`
 * (deal vindo de formulario).
 *
 * Deal criado a mao pelo "Novo deal" nao tem nem um nem outro — o
 * dialog so preenche client_id/store_id quando o usuario escolhe, e joga
 * o telefone em custom_fields.contact_phone, que nunca era exibido. Pra
 * esses, a rota CRIA o `crm_leads` na primeira edicao e linka em
 * deals.lead_id, semeando nome (do titulo) e telefone (do custom_field).
 *
 * A resolucao mora aqui, e nao no cliente, porque a criacao precisa ser
 * atomica com o link: dois campos editados em sequencia rapida no front
 * criariam dois leads.
 *
 * Body: { name?, email?, phone?, company?, address? }
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmDealContact")

export const dynamic = "force-dynamic"

const addressSchema = z.object({
  street: z.string().nullable().optional(),
  number: z.string().nullable().optional(),
  complement: z.string().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
})

const patchSchema = z.object({
  name: z.string().min(1).max(240).optional(),
  email: z
    .union([z.string().email(), z.literal("")])
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
  phone: z.string().max(40).nullable().optional(),
  company: z.string().max(240).nullable().optional(),
  address: addressSchema.optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    const { data: deal } = await admin
      .from("deals")
      .select("id, title, client_id, lead_id, owner_id, custom_fields")
      .eq("id", id)
      .maybeSingle()

    if (!deal) throw new AppError("Deal nao encontrado", 404, "not-found")

    // Precedencia identica a da LEITURA na ficha (client ganha do lead).
    // Divergir faria o usuario editar um registro e continuar vendo o outro.
    const table = deal.client_id ? "clients" : "crm_leads"
    let targetId: string | null = deal.client_id ?? deal.lead_id ?? null
    let created = false

    if (!targetId) {
      const seedPhone =
        typeof (deal.custom_fields as Record<string, unknown> | null)
          ?.contact_phone === "string"
          ? ((deal.custom_fields as Record<string, string>).contact_phone)
          : null

      const { data: lead, error: leadError } = await admin
        .from("crm_leads")
        .insert({
          name: parsed.name?.trim() || deal.title,
          phone: parsed.phone ?? seedPhone,
          status: "new",
          source: "manual",
          assigned_to: deal.owner_id ?? null,
          created_by: user.id,
        })
        .select("id")
        .single()

      if (leadError) throw leadError
      targetId = lead.id
      created = true

      const { error: linkError } = await admin
        .from("deals")
        .update({ lead_id: targetId })
        .eq("id", id)
      if (linkError) throw linkError

      log.info("[DealContact] lead criado on-demand", { dealId: id, leadId: targetId })
    }

    // Merge do endereco: o painel salva um campo por vez, entao
    // sobrescrever o jsonb inteiro apagaria os irmaos.
    const updates: Record<string, unknown> = { ...parsed }
    if (parsed.address) {
      const { data: current } = await admin
        .from(table)
        .select("address")
        .eq("id", targetId)
        .maybeSingle()
      updates.address = { ...(current?.address ?? {}), ...parsed.address }
    }

    const { error: updateError } = await admin
      .from(table)
      .update(updates)
      .eq("id", targetId)
    if (updateError) throw updateError

    // Sem cliente, o titulo do deal E o nome que aparece no board — os
    // dois andam juntos. Com cliente, o titulo e do deal e nao se mexe.
    if (parsed.name && table === "crm_leads") {
      await admin.from("deals").update({ title: parsed.name.trim() }).eq("id", id)
    }

    return successResponse(request, {
      ok: true,
      target: table === "clients" ? "client" : "lead",
      target_id: targetId,
      created,
    })
  } catch (error) {
    log.error("Deal contact patch error:", error)
    return errorResponse(request, error, "crm-deal-contact")
  }
}
