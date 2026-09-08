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
 *
 * Entra na fila quem não tem foto E quem tem uma foto de CDN de terceiro
 * (a URL da Meta vence — as duas gravadas em produção venceram em
 * 31/08/2026). O serviço espelha no nosso Storage; foto espelhada não
 * volta para a fila.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"
import { ensureThreadAvatar } from "@/lib/services/crm-contact-avatar.service"
import { CONVERTIA_IMAGE_ROUTE } from "@/lib/ai/convertia-image-url"
import { canaisElegiveisParaAvatar } from "@/lib/crm/avatar-elegibilidade"

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

    // Canais que HOJE conseguem entregar uma foto. Sem este filtro, um
    // canal desconectado (54 das 59 conversas em produção) ocupa o lote
    // inteiro sendo pulado e o Instagram nunca é alcançado.
    const { data: canais, error: erroCanais } = await admin
      .from("crm_channels")
      .select("id, type, provider, config")
      .eq("is_active", true)
    if (erroCanais) throw erroCanais

    const elegiveis = canaisElegiveisParaAvatar(canais ?? [])

    if (elegiveis.length === 0) {
      return NextResponse.json({ success: true, checked: 0, filled: 0, skipped: 0, elegiveis: 0 })
    }

    const { data: threads, error } = await admin
      .from("crm_threads")
      .select("id, org_id, contact_external_id, contact_avatar_url, channel_id")
      .in("channel_id", elegiveis)
      // Aspas: o `.` é separador de campo no `or()` do PostgREST.
      .or(`contact_avatar_url.is.null,contact_avatar_url.not.like."${CONVERTIA_IMAGE_ROUTE}%"`)
      .not("contact_external_id", "like", "comment:%")
      .or(`contact_avatar_checked_at.is.null,contact_avatar_checked_at.lt.${cutoff}`)
      .order("last_message_at", { ascending: false })
      .limit(BATCH)
    if (error) throw error

    let filled = 0
    let skipped = 0
    for (const thread of threads ?? []) {
      // O serviço carimba `contact_avatar_checked_at` na MESMA escrita
      // da foto (crm_threads está na publication do realtime: dois
      // UPDATEs acordariam todas as abas duas vezes). Aqui só contamos.
      const { url, tentou } = await ensureThreadAvatar(admin, thread)
      if (url) filled++
      // Canal desconectado não gasta a janela de 7 dias: tem de voltar à
      // fila assim que religar, não uma semana depois.
      if (!tentou) skipped++
    }

    if (filled > 0) log.info("avatares preenchidos", { filled, checked: threads?.length ?? 0 })

    return NextResponse.json({
      success: true,
      checked: threads?.length ?? 0,
      filled,
      skipped,
      elegiveis: elegiveis.length,
    })
  } catch (error) {
    log.error("backfill de avatar falhou", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
