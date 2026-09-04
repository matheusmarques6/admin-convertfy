/**
 * Sync bidirecional entre tabelas legadas (store_feedback_calls,
 * store_cadence_overrides) e os deals dos pipelines CS canonicos
 * (Calls Mensais, Cadencias CS).
 *
 * Cada funcao e idempotente e silencia falhas (nao bloqueia o fluxo
 * principal — o legado continua sendo fonte de verdade pra ficha de
 * loja e crons existentes).
 *
 * Acompanhamento tem sync proprio em acompanhamento-flagging.service.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { clearCsPipelineCache, getCsPipeline } from "@/lib/cs-pipelines"
import { getStoreHealthRules } from "./store-health-rules.service"
import {
  buildOnboardingStateByStore,
  CARTEIRA_ONBOARDING_STAGE,
  isOnboardingStageName,
  type OnboardingRow,
  type StoreOnboardingState,
} from "./carteira-onboarding"
import { logger } from "@/lib/logger"

const log = logger.child("CsPipelinesSync")

// ─────────────────────────────────────────────────────────────
// CALLS MENSAIS
// ─────────────────────────────────────────────────────────────

interface CallSyncInput {
  callId: string
  storeId: string
  /** null quando a loja não tem cliente vinculado (loja avulsa). */
  clientId: string | null
  conductedBy: string | null
  conductedAt: string | null
  nextCallDate: string | null
  notes: string | null
  actionItems: string | null
  durationMinutes: number | null
  resultPercentage: number | null
}

/**
 * Calcula o stage correto pra uma call no pipeline "Calls Mensais"
 * baseado nas datas e no estado de notes/action_items.
 */
function resolveCallStage(args: {
  conductedAt: string | null
  nextCallDate: string | null
  notes: string | null
}): "a_marcar" | "aguardando" | "agendadas" | "hoje" | "pos_call_pendente" | "finalizada" {
  if (args.conductedAt) {
    if (!args.notes || args.notes.trim() === "") return "pos_call_pendente"
    return "finalizada"
  }
  if (args.nextCallDate) {
    const nextDate = new Date(args.nextCallDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const nextDay = new Date(nextDate)
    nextDay.setHours(0, 0, 0, 0)
    const diffDays = Math.round(
      (nextDay.getTime() - today.getTime()) / 86_400_000,
    )
    if (diffDays === 0) return "hoje"
    if (diffDays >= 1 && diffDays <= 3) return "agendadas"
    if (diffDays > 3) return "aguardando"
  }
  return "a_marcar"
}

const CALL_STAGE_ORDER: Record<
  "a_marcar" | "aguardando" | "agendadas" | "hoje" | "pos_call_pendente" | "finalizada",
  number
> = {
  a_marcar: 1,
  aguardando: 2,
  agendadas: 3,
  hoje: 4,
  pos_call_pendente: 5,
  finalizada: 6,
}

/**
 * Sincroniza uma call (criada/atualizada) com o pipeline "Calls Mensais".
 * Idempotente — busca deal existente por custom_fields.legacy_call_id.
 */
export async function syncCallToDeal(args: CallSyncInput): Promise<void> {
  try {
    const admin = createAdminClient()
    const pipeline = await getCsPipeline("calls")
    if (!pipeline) return

    const stageKey = resolveCallStage({
      conductedAt: args.conductedAt,
      nextCallDate: args.nextCallDate,
      notes: args.notes,
    })
    const order = CALL_STAGE_ORDER[stageKey]
    const stage = pipeline.stages.find((s) => s.order === order)
    if (!stage) return

    // Busca dados extras da store
    const { data: store } = await admin
      .from("client_stores")
      .select("store_name, mrr_cents")
      .eq("id", args.storeId)
      .maybeSingle()

    const storeName = store?.store_name ?? "(loja)"
    const dateLabel = args.conductedAt
      ? new Date(args.conductedAt).toLocaleDateString("pt-BR")
      : args.nextCallDate
        ? new Date(args.nextCallDate).toLocaleDateString("pt-BR")
        : "a marcar"
    const title = `${storeName} — Call ${dateLabel}`

    const customFields = {
      conducted_at: args.conductedAt,
      next_call_date: args.nextCallDate,
      duration_minutes: args.durationMinutes,
      notes: args.notes,
      action_items: args.actionItems,
      result_percentage: args.resultPercentage,
      legacy_call_id: args.callId,
    }

    // Existe deal pra essa call?
    const { data: existing } = await admin
      .from("deals")
      .select("id, stage_id")
      .eq("pipeline_id", pipeline.id)
      .contains("custom_fields", { legacy_call_id: args.callId })
      .limit(1)
      .maybeSingle()

    if (existing) {
      // Update stage + custom_fields
      const status = stageKey === "finalizada" ? "won" : "open"
      await admin
        .from("deals")
        .update({
          stage_id: stage.id,
          title,
          status,
          custom_fields: customFields,
        })
        .eq("id", existing.id)
    } else {
      await admin.from("deals").insert({
        pipeline_id: pipeline.id,
        stage_id: stage.id,
        title,
        status: stageKey === "finalizada" ? "won" : "open",
        source: "feedback_call",
        store_id: args.storeId,
        client_id: args.clientId,
        owner_id: args.conductedBy,
        currency: "BRL",
        value: 0,
        custom_fields: customFields,
      })
    }
  } catch (err) {
    log.warn("syncCallToDeal falhou", {
      callId: args.callId,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

// ─────────────────────────────────────────────────────────────
// GESTAO DE CARTEIRA
// ─────────────────────────────────────────────────────────────

/**
 * Régua do auto-manage por SEMÂNTICA, não por `order` fixo: as 3
 * primeiras etapas ABERTAS são a faixa do health score (Saudável ≥80 /
 * Atenção ≥60 / Risco <60); a etapa `lost` é o churn de loja inativa;
 * as demais abertas (Em recuperação, Churn iminente, novas do editor)
 * são MANUAIS. A régua antiga por número de order quebrava assim que a
 * org inseria/reordenava etapas (ex.: a "Pausada" entra antes do Churn
 * e renumera tudo).
 *
 * A etapa "Onboarding" é aberta mas fica FORA da faixa de score: ela
 * espelha o pipeline operacional. Sem tirá-la daqui, ela roubaria o
 * lugar de "Saudável" (é a primeira aberta) e toda loja com score alto
 * cairia na coluna de onboarding.
 */
type CarteiraStage = { id: string; name: string; order: number; stage_type: string | null }

function carteiraTargets(stages: CarteiraStage[]) {
  const onboarding = stages.find((s) => isOnboardingStageName(s.name)) ?? null
  const open = stages
    .filter((s) => (s.stage_type ?? "open") === "open" && !isOnboardingStageName(s.name))
    .sort((a, b) => a.order - b.order)
  const auto = open.slice(0, 3)
  const lost = stages.find((s) => s.stage_type === "lost") ?? null
  return { auto, autoIds: new Set(auto.map((s) => s.id)), lost, onboarding }
}

function stageForScore(
  score: number | null,
  auto: CarteiraStage[],
  thresholds: { healthy: number; attention: number },
): CarteiraStage | null {
  if (auto.length === 0) return null
  const s = score ?? 50
  const idx = s >= thresholds.healthy ? 0 : s >= thresholds.attention ? 1 : 2
  return auto[Math.min(idx, auto.length - 1)]
}

/**
 * Estado de onboarding das lojas (pipeline operacional real). Falha de
 * leitura devolve mapa vazio: sem o dado, a carteira volta a se guiar
 * só pelo score — nunca deixa de responder.
 */
async function loadOnboardingStates(args: {
  admin: ReturnType<typeof createAdminClient>
  orgId?: string
  storeIds?: string[]
}): Promise<Map<string, StoreOnboardingState>> {
  try {
    let query = args.admin
      .from("onboardings")
      .select(
        "id, store_id, status, entered_at, last_column_change_at, created_at, " +
          "current_column:operational_pipeline_columns(name, slug, is_final)",
      )
    if (args.orgId) query = query.eq("org_id", args.orgId)
    if (args.storeIds) {
      if (args.storeIds.length === 0) return new Map()
      query = query.in("store_id", args.storeIds)
    }
    const { data, error } = await query
    if (error) throw error

    const raws = (data ?? []) as unknown as Array<Record<string, unknown>>
    const rows: OnboardingRow[] = raws.map((raw) => {
      const col = (Array.isArray(raw.current_column) ? raw.current_column[0] : raw.current_column) as
        | { name?: string | null; slug?: string | null; is_final?: boolean | null }
        | null
        | undefined
      return {
        id: raw.id as string,
        store_id: (raw.store_id as string) ?? "",
        status: (raw.status as string) ?? null,
        column_slug: col?.slug ?? null,
        column_name: col?.name ?? null,
        column_is_final: col?.is_final ?? null,
        entered_at: (raw.entered_at as string) ?? null,
        last_column_change_at: (raw.last_column_change_at as string) ?? null,
        created_at: (raw.created_at as string) ?? null,
      }
    })
    return buildOnboardingStateByStore(rows)
  } catch (err) {
    log.warn("onboarding indisponível para a carteira", {
      err: err instanceof Error ? err.message : String(err),
    })
    return new Map()
  }
}

/**
 * Sincroniza um store com seu deal no pipeline "Gestao de Carteira".
 * Cria deal se nao existe; move entre stages auto-managed conforme
 * health_score. Respeita moves manuais (Em recuperacao / Churn iminente):
 * deal nesses stages nao e movido automaticamente.
 *
 * Chamado por:
 * - crm-health.service apos computar score (cron diario 5h UTC)
 * - admin endpoint de resync manual
 */
export async function syncCarteiraDeal(args: {
  storeId: string
  healthScore: number | null
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const pipeline = await getCsPipeline("carteira")
    if (!pipeline) return

    const { data: store } = await admin
      .from("client_stores")
      .select("id, client_id, store_name, mrr_cents, is_active, client:clients(owner_id)")
      .eq("id", args.storeId)
      .maybeSingle()
    if (!store) return

    const { auto, autoIds, lost, onboarding } = carteiraTargets(pipeline.stages)
    const isActive = store.is_active ?? true
    const rules = await getStoreHealthRules()

    // Loja ainda em onboarding não entra na faixa de score: o card só
    // vira acompanhamento quando o pipeline operacional chega em
    // "Cliente ativo".
    const onbStates = await loadOnboardingStates({ admin, storeIds: [args.storeId] })
    const inOnboarding = onbStates.get(args.storeId)?.in_onboarding === true

    const targetStage = !isActive
      ? lost
      : inOnboarding && onboarding
        ? onboarding
        : stageForScore(args.healthScore, auto, rules.stage_thresholds)
    if (!targetStage) return
    const targetIsChurn = !isActive

    // Existe deal pra essa store?
    const { data: existing } = await admin
      .from("deals")
      .select("id, stage_id, status, custom_fields")
      .eq("pipeline_id", pipeline.id)
      .eq("store_id", args.storeId)
      .limit(1)
      .maybeSingle()

    if (existing) {
      // Determina o order atual do deal
      const currentStage = pipeline.stages.find((s) => s.id === existing.stage_id)
      const currentOrder = currentStage?.order

      // Movimento MANUAL do CSM (board da Gestão de Carteira) é
      // soberano: o cron não desfaz pausa/churn/estágio escolhido à
      // mão. "Reativar loja" limpa a flag e o auto-manage volta.
      const cf = (existing.custom_fields as Record<string, unknown> | null) ?? {}
      if (cf.manual_stage === true) return

      // Stage terminal (churn = lost) ou de pausa (archived) nunca é
      // desfeita pelo sync.
      if (currentStage?.stage_type === "lost" || currentStage?.stage_type === "archived") return

      // Stage aberta MANUAL (Em recuperação, Churn iminente, novas) —
      // não mexe. Exceção: loja INATIVA vai pro churn de onde estiver.
      // A etapa "Onboarding" NÃO é manual: ela é auto-gerida pelo
      // pipeline operacional e precisa liberar o card no handoff.
      const currentIsOnboarding = currentStage
        ? isOnboardingStageName(currentStage.name)
        : false
      if (currentStage && !autoIds.has(currentStage.id) && !currentIsOnboarding && isActive) {
        return
      }

      // Mesma stage? Atualiza so o custom_fields
      if (existing.stage_id === targetStage.id) {
        await admin
          .from("deals")
          .update({
            custom_fields: {
              ...((existing.custom_fields as Record<string, unknown> | null) ?? {}),
              health_score: args.healthScore,
              last_sync: new Date().toISOString(),
            },
          })
          .eq("id", existing.id)
        return
      }

      // Move stage
      await admin
        .from("deals")
        .update({
          stage_id: targetStage.id,
          status: (targetIsChurn ? "lost" : "open") as "lost" | "open",
          custom_fields: {
            ...((existing.custom_fields as Record<string, unknown> | null) ?? {}),
            health_score: args.healthScore,
            last_sync: new Date().toISOString(),
            previous_stage_order: currentOrder ?? null,
          },
        })
        .eq("id", existing.id)
      return
    }

    // Cria deal novo
    const owner = Array.isArray(store.client) ? store.client[0] : store.client
    await admin.from("deals").insert({
      pipeline_id: pipeline.id,
      stage_id: targetStage.id,
      title: store.store_name,
      status: targetIsChurn ? "lost" : "open",
      source: "carteira_sync",
      store_id: args.storeId,
      client_id: store.client_id,
      owner_id: owner?.owner_id ?? null,
      currency: "BRL",
      value: (store.mrr_cents ?? 0) / 100,
      custom_fields: {
        health_score: args.healthScore,
        auto_managed: true,
        last_sync: new Date().toISOString(),
      },
    })
  } catch (err) {
    log.warn("syncCarteiraDeal falhou", {
      storeId: args.storeId,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Higieniza as etapas da carteira pro estado do design (idempotente,
 * chamado pelo GET do board):
 * - conserta os acentos do seed 20260507 (só nomes EXATOS do seed —
 *   etapa renomeada pelo usuário nunca é tocada);
 * - garante a etapa "Pausada" (archived) antes do Churn — o design a
 *   tem como coluna permanente e o seed não a criou. Os orders das
 *   etapas seguintes são renumerados (a régua do sync é semântica,
 *   então renumerar é seguro).
 */
const SEED_ACCENT_FIXES: Record<string, string> = {
  Saudavel: "Saudável",
  Atencao: "Atenção",
  "Em recuperacao": "Em recuperação",
}

export async function ensureCarteiraStages(pipelineId: string): Promise<void> {
  try {
    const admin = createAdminClient()

    const [{ data: pipe }, { data: stagesData }] = await Promise.all([
      admin.from("pipelines").select("id, name").eq("id", pipelineId).maybeSingle(),
      admin
        .from("pipeline_stages")
        .select("id, name, \"order\", stage_type")
        .eq("pipeline_id", pipelineId)
        .order("order", { ascending: true }),
    ])
    if (!pipe) return
    const stages = (stagesData ?? []) as CarteiraStage[]

    let changed = false

    // 1) Acentos do seed (e do nome da pipeline)
    if (pipe.name === "Gestao de Carteira") {
      await admin.from("pipelines").update({ name: "Gestão de Carteira" }).eq("id", pipelineId)
      changed = true
    }
    for (const s of stages) {
      const fixed = SEED_ACCENT_FIXES[s.name]
      if (fixed) {
        await admin.from("pipeline_stages").update({ name: fixed }).eq("id", s.id)
        changed = true
      }
    }

    // 2) Etapa "Onboarding" — primeira coluna, espelho do pipeline
    //    operacional. Entra ANTES de "Saudável": a loja só vira
    //    acompanhamento quando o onboarding chega em "Cliente ativo".
    if (!stages.some((s) => isOnboardingStageName(s.name))) {
      const firstOrder = stages.length > 0 ? Math.min(...stages.map((s) => s.order)) : 1
      // Abre espaço de trás pra frente (UNIQUE de order na pipeline).
      for (const s of [...stages].sort((a, b) => b.order - a.order)) {
        await admin.from("pipeline_stages").update({ order: s.order + 1 }).eq("id", s.id)
      }
      const { error } = await admin.from("pipeline_stages").insert({
        pipeline_id: pipelineId,
        name: CARTEIRA_ONBOARDING_STAGE,
        color: "#6366F1",
        order: firstOrder,
        stage_type: "open",
        description:
          "Automática — espelha o pipeline de onboarding. A loja sai daqui sozinha quando o onboarding chega em \"Cliente ativo\".",
      })
      if (error) throw error
      // As etapas seguintes mudaram de order; recarrega para os passos
      // abaixo não trabalharem com números velhos.
      const { data: reloaded } = await admin
        .from("pipeline_stages")
        .select("id, name, \"order\", stage_type")
        .eq("pipeline_id", pipelineId)
        .order("order", { ascending: true })
      stages.length = 0
      stages.push(...((reloaded ?? []) as CarteiraStage[]))
      changed = true
    }

    // 3) Etapa de pausa
    const hasPause = stages.some(
      (s) => s.stage_type === "archived" || /pausad/i.test(s.name),
    )
    if (!hasPause) {
      const lost = stages.find((s) => s.stage_type === "lost")
      const pauseOrder = lost ? lost.order : Math.max(0, ...stages.map((s) => s.order)) + 1
      if (lost) {
        // Abre espaço: tudo a partir do churn desce uma posição
        // (de trás pra frente, por causa do UNIQUE de order).
        for (const s of [...stages]
          .filter((x) => x.order >= pauseOrder)
          .sort((a, b) => b.order - a.order)) {
          await admin.from("pipeline_stages").update({ order: s.order + 1 }).eq("id", s.id)
        }
      }
      await admin.from("pipeline_stages").insert({
        pipeline_id: pipelineId,
        name: "Pausada",
        color: "#6B7280",
        order: pauseOrder,
        stage_type: "archived",
        description: "Fora da carteira ativa — motivo registrado no negócio",
      })
      changed = true
    }

    if (changed) clearCsPipelineCache()
  } catch (err) {
    log.warn("ensureCarteiraStages falhou", {
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Garante 1 deal na carteira pra cada loja ATIVA da org que ainda não
 * tem (a mesma régua de score do cron). Lojas inativas SEM deal ficam
 * de fora — semear churn histórico só encheria a coluna de ruído; a
 * loja que desativar DEPOIS de entrar na carteira é movida pro churn
 * pelo cron. Idempotente e barato quando não falta ninguém (2 selects).
 */
export async function ensureCarteiraDeals(orgId: string, pipelineId: string): Promise<number> {
  try {
    const admin = createAdminClient()
    const { data: stagesData } = await admin
      .from("pipeline_stages")
      .select("id, name, \"order\", stage_type")
      .eq("pipeline_id", pipelineId)
      .order("order", { ascending: true })
    const stages = (stagesData ?? []) as CarteiraStage[]

    const { auto, onboarding } = carteiraTargets(stages)
    if (auto.length === 0) return 0

    const { data: stores } = await admin
      .from("client_stores")
      .select("id, client_id, store_name, mrr_cents, is_active, health_score, client:clients(owner_id)")
      .eq("org_id", orgId)
      .eq("is_active", true)
    if (!stores || stores.length === 0) return 0

    // Quem já tem deal (em lotes — .in() com centenas de ids estoura URL)
    const have = new Set<string>()
    for (let i = 0; i < stores.length; i += 150) {
      const slice = stores.slice(i, i + 150).map((s) => s.id)
      const { data: existing } = await admin
        .from("deals")
        .select("store_id")
        .eq("pipeline_id", pipelineId)
        .in("store_id", slice)
      for (const d of existing ?? []) if (d.store_id) have.add(d.store_id)
    }

    const missing = stores.filter((s) => !have.has(s.id))
    if (missing.length === 0) return 0

    const nowIso = new Date().toISOString()
    const rules = await getStoreHealthRules()
    // Loja nova costuma estar em onboarding — nascer em "Saudável"
    // por score default (50) daria uma leitura errada da carteira.
    const onbStates = await loadOnboardingStates({
      admin,
      storeIds: missing.map((s) => s.id as string),
    })
    const rows = missing.map((s) => {
      const inOnboarding = onbStates.get(s.id as string)?.in_onboarding === true
      const stage =
        (inOnboarding ? onboarding : null) ??
        stageForScore((s.health_score as number | null) ?? null, auto, rules.stage_thresholds) ??
        auto[0]
      const owner = Array.isArray(s.client) ? s.client[0] : s.client
      return {
        pipeline_id: pipelineId,
        stage_id: stage.id,
        title: s.store_name as string,
        status: "open" as const,
        source: "carteira_sync",
        store_id: s.id as string,
        client_id: s.client_id as string | null,
        owner_id: owner?.owner_id ?? null,
        currency: "BRL",
        value: ((s.mrr_cents as number | null) ?? 0) / 100,
        custom_fields: {
          health_score: (s.health_score as number | null) ?? null,
          auto_managed: true,
          last_sync: nowIso,
        },
      }
    })

    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await admin.from("deals").insert(rows.slice(i, i + 200))
      if (error) throw error
    }
    log.info("ensureCarteiraDeals criou deals", { org_id: orgId, created: rows.length })
    return rows.length
  } catch (err) {
    log.warn("ensureCarteiraDeals falhou", {
      err: err instanceof Error ? err.message : String(err),
    })
    return 0
  }
}

/**
 * Espelha o pipeline de onboarding na coluna "Onboarding" da carteira
 * (idempotente, chamado pelo GET do board e barato quando nada muda:
 * 2 selects e nenhum update no caso comum).
 *
 * Duas direções:
 * - loja com onboarding em andamento entra na coluna Onboarding;
 * - loja cujo onboarding chegou em "Cliente ativo" SAI dela para a
 *   faixa de health score — é o handoff para o acompanhamento.
 *
 * Não toca em: etapa terminal (churn/pausa) e deal com `manual_stage`
 * — decisão humana registrada continua soberana, como no resto do
 * board. Devolve quantos cards moveu.
 */
export async function syncCarteiraOnboarding(
  orgId: string,
  pipelineId: string,
): Promise<number> {
  try {
    const admin = createAdminClient()

    const { data: stagesData } = await admin
      .from("pipeline_stages")
      .select("id, name, \"order\", stage_type")
      .eq("pipeline_id", pipelineId)
      .order("order", { ascending: true })
    const stages = (stagesData ?? []) as CarteiraStage[]
    const { auto, onboarding } = carteiraTargets(stages)
    // Sem a coluna Onboarding (org que a apagou) não há o que espelhar.
    if (!onboarding || auto.length === 0) return 0

    const { data: dealsData } = await admin
      .from("deals")
      .select("id, store_id, stage_id, custom_fields, store:client_stores!inner(id, org_id, health_score, is_active)")
      .eq("pipeline_id", pipelineId)
      .eq("store.org_id", orgId)
    const deals = (dealsData ?? []) as unknown as Array<{
      id: string
      store_id: string | null
      stage_id: string
      custom_fields: Record<string, unknown> | null
      store: { health_score: number | null; is_active: boolean | null } | null
    }>
    if (deals.length === 0) return 0

    const states = await loadOnboardingStates({ admin, orgId })
    const rules = await getStoreHealthRules()
    const stageById = new Map(stages.map((s) => [s.id, s]))
    const nowIso = new Date().toISOString()
    let moved = 0

    for (const deal of deals) {
      if (!deal.store_id) continue
      const cf = deal.custom_fields ?? {}
      if (cf.manual_stage === true) continue

      const current = stageById.get(deal.stage_id)
      const type = current?.stage_type ?? "open"
      if (type === "lost" || type === "archived") continue
      // Loja desativada é assunto do churn, não do onboarding.
      if (deal.store?.is_active === false) continue

      const inOnboarding = states.get(deal.store_id)?.in_onboarding === true
      const isHere = current ? isOnboardingStageName(current.name) : false

      let target: CarteiraStage | null = null
      if (inOnboarding && !isHere) {
        target = onboarding
      } else if (!inOnboarding && isHere) {
        // Handoff: entra na faixa de score pelo health atual.
        target =
          stageForScore(deal.store?.health_score ?? null, auto, rules.stage_thresholds) ?? auto[0]
      }
      if (!target || target.id === deal.stage_id) continue

      const { error } = await admin
        .from("deals")
        .update({
          stage_id: target.id,
          status: "open" as const,
          custom_fields: { ...cf, onboarding_sync: nowIso },
        })
        .eq("id", deal.id)
      if (!error) moved++
    }

    if (moved > 0) log.info("syncCarteiraOnboarding moveu cards", { org_id: orgId, moved })
    return moved
  } catch (err) {
    log.warn("syncCarteiraOnboarding falhou", {
      err: err instanceof Error ? err.message : String(err),
    })
    return 0
  }
}

// ─────────────────────────────────────────────────────────────
// CADENCIAS CS
// ─────────────────────────────────────────────────────────────

const CADENCE_STAGE_TO_FREQUENCY: Record<number, "weekly" | "biweekly" | "monthly" | "paused"> = {
  1: "weekly",
  2: "biweekly",
  3: "monthly",
  4: "paused",
}

/**
 * Hook chamado em /api/crm/deals/[id]/move quando o deal pertence ao
 * pipeline "Cadencias CS". Atualiza store_cadence_overrides pra refletir
 * a nova frequencia (drag-drop entre colunas).
 *
 * Se o deal nao for de Cadencias, retorna sem fazer nada.
 * Se o deal nao tem store_id, retorna (nao da pra atualizar override).
 */
export async function syncCadenceMove(args: {
  dealId: string
  newStageId: string
  movedBy: string
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const pipeline = await getCsPipeline("cadencias")
    if (!pipeline) return

    // Confirma que o deal eh do pipeline Cadencias e pega store_id
    const { data: deal } = await admin
      .from("deals")
      .select("id, pipeline_id, store_id, custom_fields")
      .eq("id", args.dealId)
      .maybeSingle()
    if (!deal || deal.pipeline_id !== pipeline.id) return
    if (!deal.store_id) return

    // Acha a stage atual e descobre a frequencia correspondente
    const stage = pipeline.stages.find((s) => s.id === args.newStageId)
    if (!stage) return
    const newFrequency = CADENCE_STAGE_TO_FREQUENCY[stage.order]
    if (!newFrequency) return

    // Resolve org_id via store
    const { data: store } = await admin
      .from("client_stores")
      .select("org_id")
      .eq("id", deal.store_id)
      .maybeSingle()
    if (!store?.org_id) return

    // Upsert no override (so cria/atualiza se o user mudou a frequencia)
    const existingOverrideId = (
      deal.custom_fields as { legacy_override_id?: string | null } | null
    )?.legacy_override_id

    if (existingOverrideId) {
      await admin
        .from("store_cadence_overrides")
        .update({
          frequency: newFrequency,
          configured_by: args.movedBy,
          configured_at: new Date().toISOString(),
        })
        .eq("id", existingOverrideId)
    } else {
      const { data: created } = await admin
        .from("store_cadence_overrides")
        .insert({
          org_id: store.org_id,
          store_id: deal.store_id,
          frequency: newFrequency,
          reason: `Configurado via pipeline Cadencias CS`,
          configured_by: args.movedBy,
        })
        .select("id")
        .single()

      if (created) {
        // Atualiza custom_fields do deal pra apontar pro override
        await admin
          .from("deals")
          .update({
            custom_fields: {
              ...(deal.custom_fields as Record<string, unknown> | null),
              frequency: newFrequency,
              legacy_override_id: created.id,
              is_default: false,
            },
          })
          .eq("id", args.dealId)
      }
    }

    log.info("Cadence sync ok", {
      deal_id: args.dealId,
      store_id: deal.store_id,
      new_frequency: newFrequency,
    })
  } catch (err) {
    log.warn("syncCadenceMove falhou", {
      dealId: args.dealId,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}
