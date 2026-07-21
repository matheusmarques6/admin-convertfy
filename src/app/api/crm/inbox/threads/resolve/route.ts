/**
 * POST /api/crm/inbox/threads/resolve
 *
 * Resolve (e opcionalmente cria) a thread WhatsApp de um telefone —
 * usado pelo popup de conversa do card de deal. Fluxo:
 *
 *  1. normaliza o telefone (BR-first, ver lib/whatsapp/phone.ts)
 *  2. valida posse dos vínculos (deal/client/lead precisam ser da org —
 *     ids de fora são DESCARTADOS em silêncio, só log)
 *  3. sem canal WhatsApp ativo → { thread_id: null, reason: "no_channel" }
 *  4. procura thread existente pelas variantes do nono dígito
 *  5. achou → backfill de vínculo (deal/client/lead) APENAS se NULL
 *  6. não achou e create!=true → { thread_id: null } (criação lazy —
 *     a thread só nasce no primeiro envio)
 *  7. não achou e create=true → insert puro; race (23505, ex.: webhook
 *     inbound criou a thread no meio) → re-lookup + backfill-só-se-NULL
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

interface ThreadLinks {
  deal_id?: string
  client_id?: string
  lead_id?: string
}

type Admin = ReturnType<typeof createAdminClient>

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

    // Vínculos vêm do client — só entram os que pertencem à org.
    const links = await filterOwnedLinks(admin, orgId, parsed)

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

    const existing = await findThread(admin, orgId, channelIds, phone)
    if (existing) {
      await backfillLinks(admin, existing, links)
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

    // create=true → insert PURO (não upsert): em race com o webhook
    // inbound, o upsert faria merge-update e sobrescreveria contact_name/
    // status/last_message_at/vínculos da thread recém-criada. O 23505
    // vira re-lookup + backfill-só-se-NULL (padrão do webhook-processor).
    const { data: created, error: crErr } = await admin
      .from("crm_threads")
      .insert({
        org_id: orgId,
        channel_id: channelIds[0],
        contact_external_id: phone,
        contact_name: parsed.contact_name ?? null,
        deal_id: links.deal_id ?? null,
        client_id: links.client_id ?? null,
        lead_id: links.lead_id ?? null,
        status: "open",
        last_message_at: new Date().toISOString(),
      })
      .select("id, channel_id")
      .single()

    if (crErr) {
      if (crErr.code === "23505") {
        const raced = await findThread(admin, orgId, channelIds, phone)
        if (raced) {
          await backfillLinks(admin, raced, links)
          return successResponse(request, {
            thread_id: raced.id,
            channel_id: raced.channel_id,
          })
        }
      }
      throw crErr
    }
    if (!created) throw new Error("Falha ao criar thread")

    return successResponse(request, {
      thread_id: created.id,
      channel_id: created.channel_id,
    })
  } catch (error) {
    log.error("Inbox thread resolve error:", error)
    return errorResponse(request, error, "crm-inbox-thread-resolve")
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

interface FoundThread {
  id: string
  channel_id: string
  deal_id: string | null
  client_id: string | null
  lead_id: string | null
}

/** Thread existente — variantes do nono dígito cobrem wa_id com/sem 9. */
async function findThread(
  admin: Admin,
  orgId: string,
  channelIds: string[],
  phone: string,
): Promise<FoundThread | null> {
  const { data, error } = await admin
    .from("crm_threads")
    .select("id, channel_id, deal_id, client_id, lead_id")
    .eq("org_id", orgId)
    .in("channel_id", channelIds)
    .in("contact_external_id", phoneVariants(phone))
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as FoundThread | null) ?? null
}

/**
 * Backfill de vínculo APENAS quando NULL — nunca sobrescreve nem
 * "rouba" a thread de outro deal/client/lead. Best-effort.
 */
async function backfillLinks(
  admin: Admin,
  thread: FoundThread,
  links: ThreadLinks,
): Promise<void> {
  const backfill: Record<string, string> = {}
  if (links.deal_id && !thread.deal_id) backfill.deal_id = links.deal_id
  if (links.client_id && !thread.client_id) backfill.client_id = links.client_id
  if (links.lead_id && !thread.lead_id) backfill.lead_id = links.lead_id
  if (Object.keys(backfill).length === 0) return

  const { error } = await admin.from("crm_threads").update(backfill).eq("id", thread.id)
  if (error) log.warn("Backfill de vínculo falhou (best-effort)", error)
}

/**
 * Valida posse dos ids de vínculo: só passam os que pertencem à org do
 * usuário; os demais são descartados em silêncio (log warn). `deals`
 * não tem org_id próprio — a posse é derivada do client vinculado
 * (deal sem client não tem sinal de org e passa pela existência).
 */
async function filterOwnedLinks(
  admin: Admin,
  orgId: string,
  ids: { deal_id?: string; client_id?: string; lead_id?: string },
): Promise<ThreadLinks> {
  const out: ThreadLinks = {}
  const discard = (kind: string, id: string) =>
    log.warn("Vínculo descartado — não pertence à org", { kind, id, orgId })

  // PromiseLike: o query builder do supabase é thenable, não Promise
  const tasks: Array<PromiseLike<void>> = []

  if (ids.client_id) {
    const clientId = ids.client_id
    tasks.push(
      admin
        .from("clients")
        .select("id")
        .eq("id", clientId)
        .eq("org_id", orgId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) out.client_id = clientId
          else discard("client", clientId)
        }),
    )
  }

  if (ids.lead_id) {
    const leadId = ids.lead_id
    tasks.push(
      admin
        .from("crm_leads")
        .select("id")
        .eq("id", leadId)
        .eq("org_id", orgId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) out.lead_id = leadId
          else discard("lead", leadId)
        }),
    )
  }

  if (ids.deal_id) {
    const dealId = ids.deal_id
    tasks.push(
      admin
        .from("deals")
        .select("id, client:clients (org_id)")
        .eq("id", dealId)
        .maybeSingle()
        .then(({ data }) => {
          const rawClient = Array.isArray(data?.client) ? data?.client[0] : data?.client
          const clientOrg =
            (rawClient as { org_id: string | null } | null | undefined)?.org_id ?? null
          if (data && (!clientOrg || clientOrg === orgId)) out.deal_id = dealId
          else discard("deal", dealId)
        }),
    )
  }

  await Promise.all(tasks)
  return out
}
