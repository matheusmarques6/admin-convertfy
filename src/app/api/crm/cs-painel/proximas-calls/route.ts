/**
 * GET /api/crm/cs-painel/proximas-calls
 *
 * Proximas calls da carteira, ordenadas por proximidade.
 *
 * DUAS origens, que não valem o mesmo: reunião AGENDADA com a loja (existe
 * evento e convite) ou a data PREVISTA pela cadência
 * (`client_stores.next_feedback_date`, calculada pelo trigger). Até set/2026
 * só a segunda existia aqui, e a tela a mostrava como "próxima call agendada"
 * — nome que dava a entender que alguém tinha sido convidado.
 *
 * A previsão continua listada (marcada como previsão): hoje quase nenhuma
 * reunião tem loja vinculada, e mostrar só as agendadas deixaria o painel
 * vazio. Loja com reunião de verdade entra mesmo sem `next_feedback_date` —
 * antes ela ficava de fora do painel por não ter a data calculada.
 *
 * Enriquecido com CSM (clients.owner_id -> profiles) e cadencia
 * (store_cadence_overrides, default 'weekly').
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolverProximaCall, type ReuniaoDaLoja } from "@/lib/meetings/proxima-call"
import { logger } from "@/lib/logger"

const log = logger.child("CsPainelProximasCalls")

export const dynamic = "force-dynamic"

const CADENCE_LABEL: Record<string, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  paused: "Pausada",
}

type StoreRow = {
  id: string
  store_name: string
  next_feedback_date: string | null
  client: { id: string; name: string; owner_id: string | null } | { id: string; name: string; owner_id: string | null }[] | null
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const nowIso = new Date().toISOString()

    const { data: stores } = await admin
      .from("client_stores")
      .select(
        "id, store_name, next_feedback_date, client:clients(id, name, owner_id)",
      )
      .eq("is_active", true)
      .order("next_feedback_date", { ascending: true, nullsFirst: false })
      .limit(200)
      .returns<StoreRow[]>()

    const rows = stores || []
    const storeIds = rows.map((s) => s.id)

    // Reuniões agendadas com loja vinculada. Enriquecimento: falhar aqui
    // devolve o painel só com previsões, que é como ele sempre funcionou.
    const reunioesByStore = new Map<string, ReuniaoDaLoja[]>()
    try {
      const { data: ms } = await admin
        .from("meetings")
        .select("id, title, scheduled_at, status, store_id, participants:meeting_participants(participant_type)")
        .not("store_id", "is", null)
        .gte("scheduled_at", nowIso)
        .order("scheduled_at", { ascending: true })
        .limit(500)
      for (const m of ms ?? []) {
        const sid = m.store_id as string
        const ps = (m.participants ?? []) as Array<{ participant_type: string }>
        const arr = reunioesByStore.get(sid) ?? []
        arr.push({
          id: m.id as string,
          title: m.title as string | null,
          scheduled_at: m.scheduled_at as string,
          status: m.status as string,
          tem_convidado_do_cliente: ps.some((p) => p.participant_type === "contact"),
        })
        reunioesByStore.set(sid, arr)
      }
    } catch (err) {
      log.warn("Falha ao ler reuniões da carteira", {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Cadencia por loja
    const cadenceByStore = new Map<string, string>()
    if (storeIds.length > 0) {
      const { data: overrides } = await admin
        .from("store_cadence_overrides")
        .select("store_id, frequency")
        .in("store_id", storeIds)
      for (const o of overrides || []) {
        cadenceByStore.set(o.store_id as string, o.frequency as string)
      }
    }

    // Nome do CSM (owner)
    const ownerIds = Array.from(
      new Set(
        rows
          .map((s) => {
            const c = Array.isArray(s.client) ? s.client[0] : s.client
            return c?.owner_id
          })
          .filter(Boolean) as string[],
      ),
    )
    const ownerName = new Map<string, string>()
    if (ownerIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, name")
        .in("id", ownerIds)
      for (const p of profiles || []) {
        ownerName.set(p.id as string, (p.name as string) || "")
      }
    }

    const agora = new Date()

    const calls = rows
      .map((s) => {
        const c = Array.isArray(s.client) ? s.client[0] : s.client
        const freq = cadenceByStore.get(s.id) || "weekly"
        const proxima = resolverProximaCall({
          reunioes: reunioesByStore.get(s.id),
          nextFeedbackDate: s.next_feedback_date,
          agora,
        })
        return {
          store_id: s.id,
          store_name: s.store_name,
          next_call_date: proxima.quando,
          // A palavra que separa compromisso de conta. A tela mostra isso.
          origem: proxima.origem,
          meeting_id: proxima.meetingId ?? null,
          sem_convidado_do_cliente: proxima.semConvidadoDoCliente ?? false,
          csm_name: c?.owner_id ? ownerName.get(c.owner_id) || null : null,
          cadence: freq,
          cadence_label: CADENCE_LABEL[freq] || freq,
        }
      })
      // Loja sem call nem previsão não é "próxima call" — some da lista.
      .filter((c) => c.next_call_date !== null)
      .sort((a, b) => (a.next_call_date! < b.next_call_date! ? -1 : 1))
      .slice(0, 6)

    return successResponse(request, {
      calls,
      // Quantas das listadas são só previsão — ninguém foi convidado.
      presumidas: calls.filter((c) => c.origem === "prevista").length,
    })
  } catch (error) {
    log.error("CS painel proximas-calls error:", error)
    return errorResponse(request, error, "cs-painel-proximas-calls")
  }
}
