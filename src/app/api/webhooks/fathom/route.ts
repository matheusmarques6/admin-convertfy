/**
 * POST /api/webhooks/fathom — "new meeting content ready".
 *
 * O Fathom avisa quando a gravação terminou de processar e entrega
 * resumo, itens de ação e (se habilitado) transcrição. Aqui a call
 * entra sozinha no histórico da loja — sem ninguém colar link.
 *
 * Segurança: assinatura Svix (`webhook-signature`) validada contra
 * FATHOM_WEBHOOK_SECRET, com janela de 5 min contra replay. Sem o
 * segredo configurado a rota RECUSA tudo (401) — webhook aberto é
 * porta para gravar call falsa no histórico do cliente.
 *
 * Descoberta da loja: domínio do convidado externo, depois nome no
 * título (match-store.ts). Sem certeza, NÃO chuta: responde 200 com
 * `matched: false` (o Fathom não precisa reenviar) e loga tudo que o
 * operador precisa para colar o link na loja certa — o caminho manual
 * é idempotente pelo recording_id, então nada duplica depois.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { verifyFathomSignature } from "@/lib/integrations/fathom/verify-signature"
import { matchStoreForMeeting } from "@/lib/integrations/fathom/match-store"
import {
  buildFathomDigest,
  digestToActionItemsText,
  digestToNotes,
  type FathomMeetingRaw,
} from "@/lib/integrations/fathom/meeting-digest"
import { logger } from "@/lib/logger"

const log = logger.child("FathomWebhook")

export const dynamic = "force-dynamic"
export const maxDuration = 60

const MISSING_SCHEMA = new Set(["42703", "PGRST204", "PGRST205"])

export async function POST(request: NextRequest) {
  // Corpo CRU: reserializar o JSON mudaria bytes e quebraria o HMAC
  const rawBody = await request.text()

  const secret = process.env.FATHOM_WEBHOOK_SECRET?.trim()
  if (!secret) {
    log.error("FATHOM_WEBHOOK_SECRET não configurado — webhook recusado")
    return NextResponse.json({ error: "webhook não configurado" }, { status: 401 })
  }

  const verdict = verifyFathomSignature({
    rawBody,
    headers: {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
    secret,
  })
  if (!verdict.ok) {
    log.warn("assinatura inválida", { reason: verdict.reason })
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 })
  }

  let payload: FathomMeetingRaw & { recording?: FathomMeetingRaw }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 })
  }

  // O payload traz a reunião no topo; algumas versões aninham em
  // `recording` — aceita os dois.
  const digest = buildFathomDigest(payload.recording ?? payload)
  if (!digest) {
    log.warn("payload sem recording_id — ignorado")
    return NextResponse.json({ ok: true, ignored: "sem recording_id" })
  }

  try {
    const admin = createAdminClient()

    // Já importada (o operador colou o link antes)? Atualiza.
    const { data: existing } = await admin
      .from("store_feedback_calls")
      .select("id, store_id")
      .eq("fathom_recording_id", digest.recording_id)
      .maybeSingle()

    let storeId = existing?.store_id as string | undefined
    let reason = "already_imported"

    if (!storeId) {
      const { data: stores } = await admin
        .from("client_stores")
        .select("id, store_name, store_url")
        .eq("is_active", true)
        .limit(500)
      const match = matchStoreForMeeting(
        { title: digest.title, participants: digest.participants },
        (stores ?? []) as Array<{ id: string; store_name: string; store_url: string | null }>,
      )
      if (!match) {
        // Não chuta: call na loja errada é pior que call ausente.
        log.warn("reunião não casou com nenhuma loja", {
          recording_id: digest.recording_id,
          title: digest.title,
          external_participants: digest.participants
            .filter((p) => p.is_external)
            .map((p) => p.email),
        })
        return NextResponse.json({
          ok: true,
          matched: false,
          recording_id: digest.recording_id,
          hint: "Cole o link da gravação em Gestão de Carteira → Registrar call para vincular à loja.",
        })
      }
      storeId = match.store_id
      reason = match.reason
    }

    const { data: store } = await admin
      .from("client_stores")
      .select("client_id")
      .eq("id", storeId)
      .maybeSingle()

    const baseRow: Record<string, unknown> = {
      store_id: storeId,
      client_id: store?.client_id ?? null,
      conducted_at: digest.started_at ?? new Date().toISOString(),
      duration_minutes: digest.duration_minutes ?? 30,
      notes: digestToNotes(digest) || null,
      action_items: digestToActionItemsText(digest),
    }
    const fathomRow = {
      fathom_recording_id: digest.recording_id,
      fathom_url: digest.url,
      fathom_share_url: digest.share_url,
      summary_markdown: digest.summary_markdown,
      action_items_json: digest.action_items,
      participants: digest.participants,
      transcript: digest.transcript,
      fathom_synced_at: new Date().toISOString(),
    }

    const write = async (row: Record<string, unknown>) =>
      existing?.id
        ? admin.from("store_feedback_calls").update(row).eq("id", existing.id)
        : admin.from("store_feedback_calls").insert(row)

    // conducted_by é NOT NULL e no webhook não há operador humano: usa
    // o responsável do deal da loja na carteira (é de onde o painel tira
    // o CSM) e, sem ele, o membro mais antigo da org da loja.
    if (!existing?.id) {
      let conductedBy: string | null = null
      const { data: deal } = await admin
        .from("deals")
        .select("owner_id")
        .eq("store_id", storeId)
        .not("owner_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      conductedBy = (deal?.owner_id as string) ?? null

      if (!conductedBy) {
        const { data: storeOrg } = await admin
          .from("client_stores")
          .select("org_id")
          .eq("id", storeId)
          .maybeSingle()
        if (storeOrg?.org_id) {
          const { data: member } = await admin
            .from("org_members")
            .select("profile_id")
            .eq("org_id", storeOrg.org_id)
            .eq("is_active", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle()
          conductedBy = (member?.profile_id as string) ?? null
        }
      }
      if (!conductedBy) {
        log.warn("sem responsável para atribuir a call", { store_id: storeId })
        return NextResponse.json({
          ok: true,
          matched: true,
          saved: false,
          hint: "Loja sem responsável e sem membro ativo na org — registre a call manualmente.",
        })
      }
      baseRow.conducted_by = conductedBy
    }

    let result = await write({ ...baseRow, ...fathomRow })
    if (result.error && MISSING_SCHEMA.has(result.error.code)) {
      log.warn("colunas do Fathom ausentes — gravando sem elas (migration 20261106)")
      result = await write(baseRow)
    }
    if (result.error) {
      log.error("falha ao gravar call do webhook", {
        error: result.error.message,
        code: result.error.code,
        store_id: storeId,
      })
      // 500 faz o Fathom reenviar — é o que queremos em falha nossa.
      return NextResponse.json({ error: "falha ao gravar" }, { status: 500 })
    }

    log.info("call registrada pelo webhook", {
      recording_id: digest.recording_id,
      store_id: storeId,
      match: reason,
      updated: Boolean(existing?.id),
      action_items: digest.action_items.length,
    })
    return NextResponse.json({
      ok: true,
      matched: true,
      saved: true,
      store_id: storeId,
      match_reason: reason,
    })
  } catch (err) {
    log.error("webhook falhou", { error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: "erro interno" }, { status: 500 })
  }
}
