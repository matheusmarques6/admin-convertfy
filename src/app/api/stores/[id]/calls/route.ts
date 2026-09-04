/**
 * GET  /api/stores/[id]/calls — histórico de calls + próxima agendada
 *                               + pauta da próxima reunião
 * POST /api/stores/[id]/calls — registra uma call (manual ou puxando
 *                               a reunião do Fathom pelo link)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { assertStoreInUserOrg } from "@/lib/api/store-org-guard"
import { syncCallToDeal } from "@/lib/services/cs-pipelines-sync.service"
import { fetchFathomMeetingByUrl, FathomError } from "@/lib/integrations/fathom/client"
import {
  digestToActionItemsText,
  digestToNotes,
  type FathomDigest,
} from "@/lib/integrations/fathom/meeting-digest"
import {
  buildNextMeetingAgenda,
  type CallForAgenda,
} from "@/lib/integrations/fathom/next-meeting-agenda"
import {
  computeCallCoverage,
  isMonthKey,
  monthOf,
  previousMonth,
  type CallForCoverage,
} from "@/lib/services/call-coverage"
import { logger } from "@/lib/logger"

const log = logger.child("StoreCalls")

export const maxDuration = 60

/** Colunas do Fathom (migration 20261106) — ausentes até ela rodar. */
const FATHOM_COLUMNS =
  "fathom_recording_id, fathom_url, fathom_share_url, summary_markdown, " +
  "action_items_json, participants, fathom_synced_at, reference_months"

const BASE_COLUMNS =
  "id, conducted_at, duration_minutes, notes, action_items, next_call_date, " +
  "result_percentage, klaviyo_revenue, total_revenue, " +
  "conducted_by_profile:profiles!store_feedback_calls_conducted_by_fkey(id, name, avatar_url)"

const MISSING_SCHEMA = new Set(["42703", "PGRST204", "PGRST205"])

const postSchema = z.object({
  conducted_at: z.string().min(4).optional(),
  duration_minutes: z.number().int().min(0).max(600).optional(),
  notes: z.string().max(20_000).nullable().optional(),
  action_items: z.string().max(10_000).nullable().optional(),
  next_call_date: z.string().min(4).nullable().optional(),
  klaviyo_revenue: z.number().nonnegative().optional(),
  total_revenue: z.number().nonnegative().optional(),
  result_percentage: z.number().nullable().optional(),
  /** Link da gravação no Fathom — puxa resumo, itens e participantes. */
  fathom_url: z.string().max(500).nullable().optional(),
  /** Meses que a call cobriu ("2026-08"). Vazio = mês anterior à call. */
  reference_months: z.array(z.string().max(7)).max(24).optional(),
})

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const admin = createAdminClient()
    await assertStoreInUserOrg(admin, user.id, id)

    // Retry sem as colunas do Fathom enquanto a migration não roda
    let calls: Array<Record<string, unknown>> = []
    let fathomReady = true
    const withFathom = await admin
      .from("store_feedback_calls")
      .select(`${BASE_COLUMNS}, ${FATHOM_COLUMNS}`)
      .eq("store_id", id)
      .order("conducted_at", { ascending: false })
    if (withFathom.error) {
      if (!MISSING_SCHEMA.has(withFathom.error.code)) {
        throw new AppError("Erro ao listar calls", 500)
      }
      fathomReady = false
      const legacy = await admin
        .from("store_feedback_calls")
        .select(BASE_COLUMNS)
        .eq("store_id", id)
        .order("conducted_at", { ascending: false })
      if (legacy.error) throw new AppError("Erro ao listar calls", 500)
      calls = (legacy.data ?? []) as unknown as Array<Record<string, unknown>>
    } else {
      calls = (withFathom.data ?? []) as unknown as Array<Record<string, unknown>>
    }

    const now = new Date().toISOString()
    const upcomingCall = calls.find(
      (c) => typeof c.next_call_date === "string" && c.next_call_date > now,
    )

    // Pauta da próxima reunião: o que ficou aberto nas calls anteriores
    const agenda = buildNextMeetingAgenda(calls as unknown as CallForAgenda[])

    // Cobertura mensal: que mês ficou sem alinhamento/relatório
    const { data: storeRow } = await admin
      .from("client_stores")
      .select("contract_start_date, created_at")
      .eq("id", id)
      .maybeSingle()
    const coverage = computeCallCoverage({
      calls: calls as unknown as CallForCoverage[],
      contractStart:
        (storeRow?.contract_start_date as string) ?? (storeRow?.created_at as string) ?? null,
    })

    return successResponse(request, {
      calls,
      upcoming_call_date: (upcomingCall?.next_call_date as string) ?? null,
      next_meeting_agenda: agenda,
      coverage,
      fathom_ready: fathomReady,
    })
  } catch (error) {
    return errorResponse(request, error, "StoreCalls")
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const admin = createAdminClient()
    await assertStoreInUserOrg(admin, user.id, id)

    const body = postSchema.parse(await request.json())

    const { data: store } = await admin
      .from("client_stores")
      .select("client_id")
      .eq("id", id)
      .maybeSingle()
    if (!store) throw new AppError("Loja não encontrada", 404)

    // ── Fathom: puxa a reunião quando veio link ──────────────────
    let digest: FathomDigest | null = null
    if (body.fathom_url && body.fathom_url.trim()) {
      try {
        digest = await fetchFathomMeetingByUrl(body.fathom_url)
      } catch (err) {
        if (err instanceof FathomError) {
          // Erro do Fathom é acionável: devolve como 422 com a
          // mensagem pronta, sem gravar call pela metade.
          throw new AppError(err.message, err.status === 412 ? 412 : 422, "fathom")
        }
        throw err
      }
    }

    const conductedAt =
      body.conducted_at ?? digest?.started_at ?? new Date().toISOString()
    const notes = digest ? digestToNotes(digest, body.notes) : (body.notes ?? null)
    const actionItems = digest
      ? (digestToActionItemsText(digest) ?? body.action_items ?? null)
      : (body.action_items ?? null)

    // Meses de referência: o que o operador marcou; sem marcação, a
    // convenção do time — a call fala do mês ANTERIOR ao que aconteceu.
    const declaredMonths = (body.reference_months ?? []).filter(isMonthKey)
    const conductedMonth = monthOf(conductedAt)
    const referenceMonths =
      declaredMonths.length > 0
        ? [...new Set(declaredMonths)].sort()
        : conductedMonth
          ? [previousMonth(conductedMonth)]
          : []

    const baseRow: Record<string, unknown> = {
      store_id: id,
      reference_months: referenceMonths,
      // client_id é denormalização: loja sem cliente vinculado (avulsa
      // ou fallback do onboarding) grava NULL. Era NOT NULL no schema
      // antigo e quebrava o registro da call — migration 20261106.
      client_id: store.client_id ?? null,
      conducted_by: user.id,
      conducted_at: conductedAt,
      duration_minutes: body.duration_minutes ?? digest?.duration_minutes ?? 30,
      notes: notes || null,
      action_items: actionItems,
      next_call_date: body.next_call_date ?? null,
      klaviyo_revenue: body.klaviyo_revenue ?? 0,
      total_revenue: body.total_revenue ?? 0,
      result_percentage: body.result_percentage ?? null,
    }
    const fathomRow: Record<string, unknown> = digest
      ? {
          fathom_recording_id: digest.recording_id,
          fathom_url: digest.url,
          fathom_share_url: digest.share_url,
          summary_markdown: digest.summary_markdown,
          action_items_json: digest.action_items,
          participants: digest.participants,
          transcript: digest.transcript,
          fathom_synced_at: new Date().toISOString(),
        }
      : {}

    // Reimportar o mesmo link ATUALIZA a call (índice único por
    // recording_id) em vez de duplicar o histórico.
    const existing = digest
      ? await admin
          .from("store_feedback_calls")
          .select("id")
          .eq("fathom_recording_id", digest.recording_id)
          .maybeSingle()
      : { data: null, error: null }

    const write = async (row: Record<string, unknown>) =>
      existing.data?.id
        ? admin
            .from("store_feedback_calls")
            .update(row)
            .eq("id", existing.data.id)
            .select()
            .single()
        : admin.from("store_feedback_calls").insert(row).select().single()

    // Degradação em cascata: colunas que dependem de migration são
    // descartadas uma camada por vez. Registrar a call NUNCA pode
    // falhar porque uma migration opcional ainda não rodou.
    let result = await write({ ...baseRow, ...fathomRow })
    if (result.error && MISSING_SCHEMA.has(result.error.code) && digest) {
      // Migration do Fathom (20261106) não rodou: grava o essencial
      // (resumo e itens já estão em notes/action_items).
      log.warn("colunas do Fathom ausentes — gravando sem elas", {
        store_id: id,
        recording_id: digest.recording_id,
      })
      result = await write(baseRow)
    }
    if (result.error && MISSING_SCHEMA.has(result.error.code)) {
      // Migration 20261108 (reference_months) não rodou.
      const { reference_months: _months, ...withoutMonths } = baseRow
      void _months
      log.warn("coluna reference_months ausente — gravando sem ela", { store_id: id })
      result = await write(withoutMonths)
    }
    if (result.error) {
      // 23502 = NOT NULL: acontece se a migration 20261106 (client_id
      // nullable) ainda não rodou numa loja sem cliente.
      if (result.error.code === "23502" && !store.client_id) {
        throw new AppError(
          "Esta loja não tem cliente vinculado e o banco ainda exige um. Aplique a migration 20261106_calls_fathom.sql ou vincule um cliente à loja.",
          422,
          "schema",
        )
      }
      throw new AppError(result.error.message, 500)
    }
    const created = result.data as { id: string; [k: string]: unknown }

    // Sync com o pipeline "Calls Mensais" — falha não bloqueia
    syncCallToDeal({
      callId: created.id,
      storeId: id,
      clientId: store.client_id ?? null,
      conductedBy: user.id,
      conductedAt: created.conducted_at as string,
      nextCallDate: (created.next_call_date as string) ?? null,
      notes: (created.notes as string) ?? null,
      actionItems: (created.action_items as string) ?? null,
      durationMinutes: (created.duration_minutes as number) ?? null,
      resultPercentage: (created.result_percentage as number) ?? null,
    }).catch(() => {
      /* logado no service */
    })

    return successResponse(request, {
      call: created,
      fathom: digest
        ? {
            recording_id: digest.recording_id,
            title: digest.title,
            action_items: digest.action_items.length,
            participants: digest.participants.length,
            has_summary: Boolean(digest.summary_markdown),
          }
        : null,
    })
  } catch (error) {
    return errorResponse(request, error, "StoreCalls")
  }
}
