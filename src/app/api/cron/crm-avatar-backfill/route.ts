/**
 * Vercel Cron — fotos de perfil dos contatos do inbox.
 *
 * Estava no `after()` do GET da lista, e era um laço: o backfill faz
 * `UPDATE crm_threads` → a tabela está na publication do realtime → todas
 * as abas da org recebem o evento → cada uma relista → cada lista dispara
 * um novo backfill. O cooldown existia num Map em memória da lambda, que
 * em serverless (várias instâncias, vida curta) quase não segura nada.
 *
 * Aqui a tentativa é PERSISTIDA em `contact_avatar_checked_at`: quem não
 * tem foto é tentado no máximo uma vez por semana, e a lista deixa de
 * escrever no banco para responder um GET.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"
import { ensureThreadAvatar } from "@/lib/services/crm-contact-avatar.service"

const log = logger.child("CronCrmAvatarBackfill")

export const dynamic = "force-dynamic"
export const maxDuration = 120

/** APIs de terceiros com rate limit — lote pequeno, sem paralelismo. */
const BATCH = 20
const RETRY_AFTER_DAYS = 7

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()
    const cutoff = new Date(Date.now() - RETRY_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { data: threads, error } = await admin
      .from("crm_threads")
      .select("id, contact_external_id, contact_avatar_url, channel_id")
      .is("contact_avatar_url", null)
      .not("contact_external_id", "like", "comment:%")
      .or(`contact_avatar_checked_at.is.null,contact_avatar_checked_at.lt.${cutoff}`)
      .order("last_message_at", { ascending: false })
      .limit(BATCH)
    if (error) throw error

    let filled = 0
    for (const thread of threads ?? []) {
      const url = await ensureThreadAvatar(admin, thread)
      if (url) filled++
      // Marca a tentativa mesmo sem foto: contato com perfil privado não
      // pode ser re-tentado a cada rodada.
      await admin
        .from("crm_threads")
        .update({ contact_avatar_checked_at: new Date().toISOString() })
        .eq("id", thread.id)
    }

    if (filled > 0) log.info("avatares preenchidos", { filled, checked: threads?.length ?? 0 })

    return NextResponse.json({ success: true, checked: threads?.length ?? 0, filled })
  } catch (error) {
    log.error("backfill de avatar falhou", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
