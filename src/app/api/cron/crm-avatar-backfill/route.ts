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
import {
  type AvatarMotivo,
  cabeMaisUma,
  contarMotivos,
  janelasDaFila,
  ORDEM_DA_FILA,
} from "@/lib/crm/avatar-fila"

const log = logger.child("CronCrmAvatarBackfill")

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * O teto é o ORÇAMENTO de tempo, não o número de linhas: cada item faz
 * chamada externa + download + resize + upload, e a Evolution tem retry
 * interno. Com lote de 20 a base inteira levava três rodadas (18h) para
 * ser coberta uma vez — quem religa o número via as fotos no dia
 * seguinte. O lote agora cobre a base numa passada e para no relógio.
 */
const BATCH = 60
const ORCAMENTO_MS = 240_000

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()
    const inicio = Date.now()
    const { checadoAntesDe, falhouAntesDe } = janelasDaFila(new Date())

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
      // Nenhum canal entrega foto agora (Evolution deslogada, por
      // exemplo). Dizer isso é o que separa "não há o que fazer" de
      // "está quebrado" quando o inbox aparece só com iniciais.
      return NextResponse.json({
        success: true,
        checked: 0,
        filled: 0,
        skipped: 0,
        elegiveis: 0,
        motivos: {},
      })
    }

    // A ordem mora em ORDEM_DA_FILA (com o porquê). Ordenar por
    // recência, como antes, fazia o lote reprocessar o topo da lista a
    // cada rodada e nunca alcançar a cauda.
    const montarFila = (comFailedAt: boolean) => {
      let q = admin
        .from("crm_threads")
        .select("id, org_id, contact_external_id, contact_avatar_url, channel_id")
        .in("channel_id", elegiveis)
        // Aspas: o `.` é separador de campo no `or()` do PostgREST.
        .or(`contact_avatar_url.is.null,contact_avatar_url.not.like."${CONVERTIA_IMAGE_ROUTE}%"`)
        .not("contact_external_id", "like", "comment:%")
        .or(`contact_avatar_checked_at.is.null,contact_avatar_checked_at.lt.${checadoAntesDe}`)
      if (comFailedAt) {
        q = q.or(`contact_avatar_failed_at.is.null,contact_avatar_failed_at.lt.${falhouAntesDe}`)
      }
      for (const o of ORDEM_DA_FILA) {
        // Sem a migration a coluna de falha não existe: pular a ordem
        // dela é o que mantém a rodada de pé em vez de dar 42703.
        if (!comFailedAt && o.coluna === "contact_avatar_failed_at") continue
        q = q.order(o.coluna, { ascending: o.ascendente, nullsFirst: o.nulosPrimeiro })
      }
      return q.limit(BATCH)
    }

    let { data: threads, error } = await montarFila(true)
    // Migration 20261125 ainda não rodou: segue sem o filtro de falha.
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      log.warn("fila sem contact_avatar_failed_at — aplique a migration 20261125")
      ;({ data: threads, error } = await montarFila(false))
    }
    if (error) throw error

    let filled = 0
    let skipped = 0
    const motivos: AvatarMotivo[] = []
    let checked = 0
    for (const thread of threads ?? []) {
      if (!cabeMaisUma(inicio, Date.now(), ORCAMENTO_MS)) {
        log.info("orçamento esgotado — o resto fica para a próxima rodada", {
          restantes: (threads?.length ?? 0) - checked,
        })
        break
      }
      checked++
      // O serviço carimba o desfecho na MESMA escrita da foto
      // (crm_threads está na publication do realtime: dois UPDATEs
      // acordariam todas as abas duas vezes). Aqui só contamos.
      const { url, tentou, motivo } = await ensureThreadAvatar(admin, thread)
      motivos.push(motivo)
      if (url) filled++
      // Canal desconectado não gasta a janela: tem de voltar à fila
      // assim que religar, não uma semana depois.
      if (!tentou) skipped++
    }

    const contagem = contarMotivos(motivos)
    if (filled > 0) log.info("avatares preenchidos", { filled, checked })
    // Rodada que não preencheu nada tem de dizer por quê: erro do
    // provedor e contato sem foto pedem ações opostas.
    else if (checked > 0) log.info("rodada sem foto nova", { checked, motivos: contagem })

    return NextResponse.json({
      success: true,
      checked,
      filled,
      skipped,
      elegiveis: elegiveis.length,
      motivos: contagem,
      ms: Date.now() - inicio,
    })
  } catch (error) {
    log.error("backfill de avatar falhou", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
