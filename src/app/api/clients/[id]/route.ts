/**
 * GET   /api/clients/[id]  — ficha do cliente
 * PATCH /api/clients/[id]  — atualiza dados de contato
 *
 * Existia rota de busca (`/search`), performance e um `manage` só com
 * DELETE — nenhuma de update. Sem isto, a ficha do deal ligada a um
 * CLIENTE nao tinha como salvar nome/email/telefone/endereco (deal
 * ligado a lead salvava via /api/crm/leads/[id]).
 *
 * `address` segue o shape de clients.address (jsonb), o mesmo de
 * crm_leads.address — o front usa um componente unico pras duas.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("ClientDetail")

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
  // string vazia do input inline vira null (campo limpo), em vez de
  // estourar o .email() do Zod.
  email: z
    .union([z.string().email(), z.literal("")])
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
  phone: z.string().max(40).nullable().optional(),
  company: z.string().max(240).nullable().optional(),
  website: z.string().max(500).nullable().optional(),
  address: addressSchema.optional(),
})

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data: client, error } = await admin
      .from("clients")
      .select(
        "id, name, email, phone, company, website, address, status, tags, created_at, updated_at",
      )
      .eq("id", id)
      .single()

    if (error || !client) {
      throw new AppError("Cliente nao encontrado", 404, "not-found")
    }

    return successResponse(request, { client })
  } catch (error) {
    log.error("Client detail error:", error)
    return errorResponse(request, error, "client-detail")
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    // Merge do endereco: o painel salva um campo por vez, entao
    // sobrescrever o jsonb inteiro apagaria os irmaos.
    let updates: Record<string, unknown> = { ...parsed }
    if (parsed.address) {
      const { data: current } = await admin
        .from("clients")
        .select("address")
        .eq("id", id)
        .maybeSingle()
      updates = {
        ...updates,
        address: { ...(current?.address ?? {}), ...parsed.address },
      }
    }

    const { data, error } = await admin
      .from("clients")
      .update(updates)
      .eq("id", id)
      .select("id, name, email, phone, company, website, address")
      .single()

    if (error) throw error
    if (!data) throw new AppError("Cliente nao encontrado", 404, "not-found")

    return successResponse(request, { client: data })
  } catch (error) {
    log.error("Client patch error:", error)
    return errorResponse(request, error, "client-patch")
  }
}
