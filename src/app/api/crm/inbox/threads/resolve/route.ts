/**
 * POST /api/crm/inbox/threads/resolve
 *
 * Resolve (e opcionalmente cria) a thread WhatsApp de um telefone —
 * usado pelo popup de conversa do card de deal. Fluxo:
 *
 *  1. normaliza o telefone (BR-first, ver lib/whatsapp/phone.ts)
 *  2. sem canal WhatsApp ativo → { thread_id: null, reason: "no_channel" }
 *  3. procura thread existente pelas variantes do nono dígito
 *  4. achou → backfill de vínculo (deal/client/lead) APENAS se NULL
 *  5. não achou e create!=true → { thread_id: null } (criação lazy —
 *     a thread só nasce no primeiro envio)
 *  6. não achou e create=true → upsert (channel_id,contact_external_id)
 *
 * Body: { phone, deal_id?, client_id?, lead_id?, contact_name?, create? }
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuidOptional } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { normalizePhone, phoneVariants } from "@/lib/whatsapp/phone"
import { logger } from "@/lib/logger"

const log = logger.child("CrmInboxThreadResolve")

export const dynamic = "force-dynamic"

const resolveSchema = z.object({
  phone: z.string().min(1),
  deal_id: uuidOptional(),
  client_id: uuidOptional(),
  lead_id: uuidOptional(),
  contact_name: z.string().trim().min(1).max(200).optional(),
  create: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const orgId = await resolveOrgId(user.id)

    const body = await request.json()
    const parsed = resolveSchema.parse(body)

    const phone = normalizePhone(parsed.phone)
    if (!phone) {
      throw new AppError("Telefone inválido (mínimo 10 dígitos)", 422, "invalid-phone")
    }

    // Canais WhatsApp ativos da org (mesmo padrão do onboarding:
    // primeiro ativo por created_at é o canal default de envio)
    const { data: channels, error: chErr } = await admin
      .from("crm_channels")
      .select("id")
      .eq("org_id", orgId)
      .eq("type", "whatsapp")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
    if (chErr) throw chErr

    if (!channels || channels.length === 0) {
      return successResponse(request, {
        thread_id: null,
        channel_id: null,
        reason: "no_channel",
      })
    }
    const channelIds = channels.map((c) => c.id as string)

    // Thread existente — variantes do nono dígito cobrem wa_id com/sem 9
    const { data: existing, error: thErr } = await admin
      .from("crm_threads")
      .select("id, channel_id, deal_id, client_id, lead_id")
      .eq("org_id", orgId)
      .in("channel_id", channelIds)
      .in("contact_external_id", phoneVariants(phone))
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (thErr) throw thErr

    if (existing) {
      // Backfill de vínculo APENAS quando NULL — nunca sobrescreve nem
      // "rouba" a thread de outro deal/client/lead.
      const backfill: Record<string, string> = {}
      if (parsed.deal_id && !existing.deal_id) backfill.deal_id = parsed.deal_id
      if (parsed.client_id && !existing.client_id) backfill.client_id = parsed.client_id
      if (parsed.lead_id && !existing.lead_id) backfill.lead_id = parsed.lead_id
      if (Object.keys(backfill).length > 0) {
        const { error: upErr } = await admin
          .from("crm_threads")
          .update(backfill)
          .eq("id", existing.id)
        if (upErr) log.warn("Backfill de vínculo falhou (best-effort)", upErr)
      }

      return successResponse(request, {
        thread_id: existing.id,
        channel_id: existing.channel_id,
      })
    }

    // Sem thread e sem create → criação LAZY (nasce no primeiro envio)
    if (parsed.create !== true) {
      return successResponse(request, {
        thread_id: null,
        channel_id: channelIds[0],
      })
    }

    // create=true → upsert idempotente (mesmo padrão do onboarding)
    const { data: created, error: crErr } = await admin
      .from("crm_threads")
      .upsert(
        {
          org_id: orgId,
          channel_id: channelIds[0],
          contact_external_id: phone,
          contact_name: parsed.contact_name ?? null,
          deal_id: parsed.deal_id ?? null,
          client_id: parsed.client_id ?? null,
          lead_id: parsed.lead_id ?? null,
          status: "open",
          last_message_at: new Date().toISOString(),
        },
        { onConflict: "channel_id,contact_external_id" },
      )
      .select("id, channel_id")
      .single()
    if (crErr || !created) throw crErr || new Error("Falha ao criar thread")

    return successResponse(request, {
      thread_id: created.id,
      channel_id: created.channel_id,
    })
  } catch (error) {
    log.error("Inbox thread resolve error:", error)
    return errorResponse(request, error, "crm-inbox-thread-resolve")
  }
}
