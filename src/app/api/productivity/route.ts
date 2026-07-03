/**
 * GET /api/productivity — Unified data endpoint for productivity module.
 * Returns all data needed for Início + Board pages in a single request.
 *
 * POST /api/productivity — Create/update productivity data (tasks, goals, habits, etc.)
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { ensureOnboardingBootstrap } from "@/lib/services/onboarding-bootstrap.service"
import {
  canAccessOnboardingStage,
  getOnboardingStageAccess,
} from "@/lib/permissions/onboarding-stage-access"
import { listCampaignDesignProjectGroups } from "@/lib/services/campaign-central/campaign-design-board.service"

// Cache em memoria de quando rodou ensureOnboardingBootstrap por org.
// Garante que checklist_template/deliverables_template das colunas estao
// sincronizados com o SEED atual sem precisar do operador rodar manutencao
// manualmente. TTL curto pra cobrir deploys.
const TEMPLATE_SYNC_TTL_MS = 5 * 60 * 1000
const lastTemplateSyncByOrg = new Map<string, number>()

// Sem cache: tasks/goals/habits mudam constantemente e o fetchData precisa
// ler estado fresco apos cada mutation. Sem isso, o Next cacheia e o
// optimistic update e sobrescrito por dados antigos (bug 'inicia e pausa').
export const dynamic = "force-dynamic"
export const revalidate = 0

// ── GET: Fetch all productivity data for the current user ──

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Get user's org membership for multi-tenant
    const { data: orgMember } = await supabase
      .from("org_members")
      .select("id, org_id")
      .eq("profile_id", user.id)
      .single()

    const orgId = orgMember?.org_id

    // Carrega TODAS as funções da conta (multi-função) via org_member_roles.
    // Usado pra filtrar a visibilidade dos onboardings por etapa NO SERVIDOR
    // (a UI não reimplementa a regra — recebe can_work/can_admin prontos).
    let userRoles: string[] = []
    if (orgMember?.id) {
      const { data: roleRows } = await supabase
        .from("org_member_roles")
        .select("role")
        .eq("org_member_id", orgMember.id)
      userRoles = (roleRows ?? [])
        .map((r) => r.role as string)
        .filter(Boolean)
    }

    // Lazy re-sync dos templates de coluna do pipeline de onboarding.
    // Garante que mudancas no SEED_COLUMNS (ex: allow_other no language)
    // se propagam pro banco sem precisar de ensureOnboardingBootstrap
    // explicito. Cacheado por org com TTL de 5 min pra nao pesar.
    if (orgId) {
      const last = lastTemplateSyncByOrg.get(orgId) ?? 0
      if (Date.now() - last > TEMPLATE_SYNC_TTL_MS) {
        try {
          await ensureOnboardingBootstrap(orgId, user.id)
          lastTemplateSyncByOrg.set(orgId, Date.now())
        } catch (e) {
          console.warn("[productivity GET] ensureOnboardingBootstrap failed", e)
        }
      }
    }

    // Fetch all data in parallel
    const [
      tasksRes,
      goalsRes,
      habitsRes,
      dailyPlanRes,
      focusSessionsRes,
      profileRes,
      membersRes,
      commentsRes,
    ] = await Promise.all([
      // Tasks with subtasks, assigned to user's org
      supabase
        .from("productivity_tasks")
        .select("*, subtasks:productivity_subtasks(*)")
        .eq("org_id", orgId)
        .order("position", { ascending: true }),

      // Goals/OKRs for the current quarter
      supabase
        .from("productivity_goals")
        .select("*, key_results:productivity_key_results(*)")
        .eq("org_id", orgId)
        .order("position", { ascending: true }),

      // Habits with today's completion
      supabase
        .from("productivity_habits")
        .select("*, completions:productivity_habit_completions(completed_at)")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("position", { ascending: true }),

      // Today's daily planning
      supabase
        .from("productivity_daily_plans")
        .select("*")
        .eq("user_id", user.id)
        .eq("plan_date", new Date().toISOString().split("T")[0])
        .maybeSingle(),

      // Focus sessions for today
      supabase
        .from("productivity_focus_sessions")
        .select("*")
        .eq("user_id", user.id)
        .gte("started_at", new Date().toISOString().split("T")[0])
        .order("started_at", { ascending: false }),

      // User profile for name
      supabase
        .from("profiles")
        .select("name, avatar_url")
        .eq("id", user.id)
        .single(),

      // Org members (for assignee picker)
      supabase
        .from("org_members")
        .select("id, profile_id, profiles(name, avatar_url)")
        .eq("org_id", orgId),

      // Comments on tasks
      supabase
        .from("productivity_comments")
        .select("*, profiles(name, avatar_url)")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true }),
    ])

    // Group tasks by group_id
    const tasks = tasksRes.data || []
    const groupMap = new Map<string, { id: string; name: string; color: string; position: number; items: typeof tasks }>()

    for (const task of tasks) {
      const groupId = task.group_id || "ungrouped"
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, {
          id: groupId,
          name: task.group_name || "Sem grupo",
          color: task.group_color || "#9CA3AF",
          position: task.group_position || 0,
          items: [],
        })
      }
      // Placeholder de grupo vazio nao aparece no board mas mantem o grupo
      if (task.name === "__group_placeholder__") continue
      groupMap.get(groupId)!.items.push(task)
    }

    const groups = Array.from(groupMap.values()).sort((a, b) => a.position - b.position)

    // ── Onboardings como projetos virtuais ───────────────────────────────
    // Cada onboarding ativo vira um grupo no board com items = tasks da
    // stage atual (filtradas por version atual pra evitar misturar v1+v2).
    // Sem duplicar dados: as tasks ja existem em `tasks` table (criadas
    // pelo pipeline operacional). Mapeia pro shape esperado pelo store.
    try {
      const { data: onboardings } = await supabase
        .from("onboardings")
        .select(
          `id, current_version, current_column_id, plan, mrr_value,
           client:clients!onboardings_client_id_fkey(id, name, company),
           store:client_stores(id, store_name, language),
           current_column:operational_pipeline_columns(id, name, slug, color, default_assignee_role, deliverables_template)`,
        )
        .eq("org_id", orgId)
        .eq("status", "in_progress")

      if (onboardings && onboardings.length > 0) {
        const onbIds = onboardings.map((o) => o.id as string)
        const { data: onbTasks } = await supabase
          .from("tasks")
          .select(
            "id, title, description, status, priority, due_date, sla_hours, assignee_role, assignee_id, onboarding_id, operational_column_id, version, metadata, created_at, time_spent_seconds, timer_started_at",
          )
          .in("onboarding_id", onbIds)
          .neq("status", "cancelled")
          .order("created_at", { ascending: true })

        // Carrega deliverables/checklists/comments por task em paralelo
        const taskIds = (onbTasks ?? []).map((t) => t.id as string)
        const [delvRes, chkRes, cmtRes] =
          taskIds.length > 0
            ? await Promise.all([
                supabase
                  .from("task_deliverables")
                  .select(
                    "id, task_id, field_slug, field_label, field_type, required, value, file_url, file_name, file_size_bytes, filled_at, metadata",
                  )
                  .in("task_id", taskIds),
                supabase
                  .from("task_checklists")
                  .select(
                    "id, task_id, title, position, is_completed, completed_by",
                  )
                  .in("task_id", taskIds)
                  .order("position", { ascending: true }),
                supabase
                  .from("task_comments")
                  .select(
                    "id, task_id, author_id, content, attachments, created_at, profiles:author_id(name, avatar_url)",
                  )
                  .in("task_id", taskIds)
                  .order("created_at", { ascending: true }),
              ])
            : [{ data: [] }, { data: [] }, { data: [] }]
        const delvByTask = new Map<string, Array<Record<string, unknown>>>()
        for (const d of (delvRes.data ?? []) as Array<Record<string, unknown>>) {
          const tid = d.task_id as string
          if (!delvByTask.has(tid)) delvByTask.set(tid, [])
          delvByTask.get(tid)!.push(d)
        }
        const chkByTask = new Map<string, Array<Record<string, unknown>>>()
        for (const c of (chkRes.data ?? []) as Array<Record<string, unknown>>) {
          const tid = c.task_id as string
          if (!chkByTask.has(tid)) chkByTask.set(tid, [])
          chkByTask.get(tid)!.push(c)
        }
        const cmtByTask = new Map<string, Array<Record<string, unknown>>>()
        for (const c of (cmtRes.data ?? []) as Array<Record<string, unknown>>) {
          const tid = c.task_id as string
          if (!cmtByTask.has(tid)) cmtByTask.set(tid, [])
          cmtByTask.get(tid)!.push(c)
        }

        for (const onb of onboardings) {
          const client = (
            Array.isArray(onb.client) ? onb.client[0] : onb.client
          ) as { id: string; name: string; company: string | null } | null
          const store = (
            Array.isArray(onb.store) ? onb.store[0] : onb.store
          ) as { id: string; store_name: string; language?: string | null } | null
          const col = (
            Array.isArray(onb.current_column)
              ? onb.current_column[0]
              : onb.current_column
          ) as {
            id: string
            name: string
            slug: string
            color: string
            default_assignee_role: string | null
            deliverables_template?: Array<{
              slug: string
              label: string
              type: string
              required?: boolean
              options?: string[]
              validation?: string
              placeholder?: string
              helpText?: string
            }>
          } | null

          // FILTRO SERVER-SIDE de visibilidade por etapa: o grupo virtual do
          // onboarding só entra no board se a função do usuário pode acessar a
          // etapa ATUAL (bypass vê tudo). Atribuição individual NÃO concede
          // acesso — a regra é puramente função × etapa.
          const stageSlug = col?.slug ?? null
          if (!canAccessOnboardingStage(userRoles, stageSlug)) {
            continue
          }
          const stageAccess = getOnboardingStageAccess(userRoles, stageSlug)
          // Indexa template por field_slug pra enriquecer cada task_deliverable
          // com options/validation/etc (nao guardado no row do banco).
          const tplBySlug = new Map<string, {
            options?: string[]
            validation?: string
            placeholder?: string
            helpText?: string
            allow_other?: boolean
          }>()
          for (const f of (col?.deliverables_template ?? []) as Array<{
            slug: string
            options?: string[]
            validation?: string
            placeholder?: string
            helpText?: string
            allow_other?: boolean
          }>) {
            tplBySlug.set(f.slug, {
              options: f.options,
              validation: f.validation,
              placeholder: f.placeholder,
              helpText: f.helpText,
              allow_other: f.allow_other,
            })
          }
          // Defaults derivados do contexto da loja/onboarding (usado pra
          // pre-selecionar valores quando o entregavel ainda esta vazio).
          const contextDefaults: Record<string, string | null> = {
            language: store?.language ?? null,
          }

          const tasksInOnb = (onbTasks ?? [])
            .filter(
              (t) =>
                t.onboarding_id === onb.id &&
                (t.version ?? 1) === (onb.current_version ?? 1) &&
                t.operational_column_id === onb.current_column_id,
            )
            .sort((a, b) => {
              // Ordena por metadata.item_position (gravado pelo instantiator
              // a partir do checklist_template.order). Antes vinha por
              // created_at, que pra tasks criadas em batch nao preserva ordem.
              const ma = (a.metadata ?? {}) as Record<string, unknown>
              const mb = (b.metadata ?? {}) as Record<string, unknown>
              const ap =
                typeof ma.item_position === "number"
                  ? ma.item_position
                  : Number.POSITIVE_INFINITY
              const bp =
                typeof mb.item_position === "number"
                  ? mb.item_position
                  : Number.POSITIVE_INFINITY
              if (ap !== bp) return ap - bp
              const ac = (a.created_at as string | null) ?? ""
              const bc = (b.created_at as string | null) ?? ""
              return ac.localeCompare(bc)
            })

          // Mapeia tasks pro shape esperado pelo store (productivity_tasks-like)
          const priorityMap: Record<string, number> = {
            urgent: 1,
            high: 2,
            medium: 3,
            low: 4,
          }
          const statusMap: Record<string, string> = {
            pending: "pending",
            in_progress: "progress",
            in_review: "review",
            completed: "done",
            cancelled: "done",
          }

          const items = tasksInOnb.map((t) => {
            const tMeta = (t.metadata ?? {}) as Record<string, unknown>
            const attachments = Array.isArray(tMeta.attachments)
              ? (tMeta.attachments as Array<Record<string, unknown>>)
              : []
            const links = Array.isArray(tMeta.links)
              ? (tMeta.links as Array<Record<string, unknown>>)
              : []
            return {
              id: t.id,
              name: t.title,
              description: t.description,
              project: client?.name ?? "",
              status: statusMap[t.status as string] ?? "pending",
              priority: priorityMap[t.priority as string] ?? 3,
              due_date: t.due_date,
              estimated_minutes: t.sla_hours ? t.sla_hours * 60 : null,
              time_spent_seconds: t.time_spent_seconds ?? 0,
              timer_started_at: t.timer_started_at ?? null,
              assigned_to: t.assignee_id ? [t.assignee_id] : [],
              assignee_role: t.assignee_role,
              // Marca a origem pro drawer renderizar briefing automatico
              source_type: "onboarding",
              source_id: onb.id,
              onboarding_id: onb.id,
              operational_column_id: t.operational_column_id,
              metadata: {
                ...tMeta,
                client_name: client?.name ?? null,
                store_name: store?.store_name ?? null,
                column_name: col?.name ?? null,
                stage_color: col?.color ?? null,
                stage_role: col?.default_assignee_role ?? null,
              },
              deliverables: (delvByTask.get(t.id as string) ?? []).map(
                (d) => {
                  const slug = d.field_slug as string
                  const enriched = {
                    ...d,
                    ...(tplBySlug.get(slug) ?? {}),
                    default_value: contextDefaults[slug] ?? null,
                  }
                  return enriched
                },
              ),
              checklist: chkByTask.get(t.id as string) ?? [],
              task_comments: cmtByTask.get(t.id as string) ?? [],
              attachments,
              links,
              subtasks: [],
              group_id: `onb-${onb.id}`,
              group_name: `Onboarding · ${store?.store_name ?? client?.name ?? "Loja"}`,
              group_color: col?.color ?? "#4E62D8",
            }
          })

          const onboardingName = store?.store_name ?? client?.name ?? "Loja"
          groups.push({
            id: `onb-${onb.id}`,
            name: `Onboarding · ${onboardingName}`,
            color: col?.color ?? "#4E62D8",
            position: 1000 + groups.length, // depois dos grupos legados
            items: items as never,
            // Meta extra pro frontend
            ...({
              source_type: "onboarding",
              onboarding_id: onb.id,
              stage_id: col?.id,
              stage_name: col?.name,
              stage_slug: col?.slug,
              stage_color: col?.color,
              stage_role: col?.default_assignee_role,
              // Flags de permissão resolvidas no servidor — a UI consome direto
              // sem reimplementar a matriz de visibilidade por etapa.
              can_work: stageAccess.canWork,
              can_admin: stageAccess.canAdmin,
              responsible_role: stageAccess.responsibleRole,
              plan: onb.plan,
              mrr_value: onb.mrr_value,
              client_id: client?.id,
              client_name: client?.name,
            } as Record<string, unknown>),
          })
        }
      }
    } catch (e) {
      console.error("[productivity GET] onboardings projection failed", e)
    }

    // ── Campanhas em design como projetos virtuais (Fase 7) ──────────────
    // Espelha a projecao de onboarding: cada campanha com design ATIVO vira um
    // grupo no board, filtrada por funcao × etapa no servidor. Aditivo — nao
    // mexe na projecao de onboarding nem nos grupos legados.
    try {
      const campaignGroups = await listCampaignDesignProjectGroups({
        orgId: orgId as string,
        roles: userRoles,
      })
      for (const cg of campaignGroups) {
        groups.push({
          id: cg.id,
          name: cg.name,
          color: cg.color,
          position: cg.position,
          items: cg.items as never,
          ...({
            source_type: "campaign_suggestion",
            suggestion_id: cg.suggestion_id,
            stage_slug: cg.design_stage,
            can_work: cg.can_work,
            can_admin: cg.can_admin,
            responsible_role: cg.responsible_role,
          } as Record<string, unknown>),
        })
      }
    } catch (e) {
      console.error("[productivity GET] campaign design projection failed", e)
    }

    // Process habits into weekly grid
    const habits = (habitsRes.data || []).map((h) => {
      const completions = (h.completions || []).map((c: { completed_at: string }) => c.completed_at)
      const today = new Date()
      const days: number[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().split("T")[0]
        if (i === 0) {
          days.push(completions.some((c: string) => c.startsWith(dateStr)) ? 1 : 2) // 2 = today unchecked
        } else {
          days.push(completions.some((c: string) => c.startsWith(dateStr)) ? 1 : 0)
        }
      }

      // Calculate streak
      let streak = 0
      for (let i = days.length - 1; i >= 0; i--) {
        if (days[i] === 1) streak++
        else if (days[i] !== 2) break // today pending doesn't break streak
      }

      return {
        ...h,
        days,
        streak,
        completions: undefined, // Don't send raw completions to client
      }
    })

    // Today's calendar events from meetings table
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const { data: meetings } = await supabase
      .from("meetings")
      .select("id, title, scheduled_at, duration_minutes")
      .gte("scheduled_at", todayStart.toISOString())
      .lte("scheduled_at", todayEnd.toISOString())
      .order("scheduled_at", { ascending: true })

    const calendarEvents = (meetings || []).map((m) => ({
      id: m.id,
      name: m.title,
      time: new Date(m.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      duration: m.duration_minutes,
      color: "#4E62D8",
    }))

    // Focus sessions summary
    const focusSessions = focusSessionsRes.data || []
    const totalFocusMinutes = focusSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0)

    // Compute weekly bars from tasks completed this week
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)

    const weekLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]
    const weeklyBars = weekLabels.map((label) => ({
      label,
      actual: 0,
      estimated: 0,
    }))

    // Map tasks to weekly stats
    for (const task of tasks) {
      if (task.due_date) {
        const dueDate = new Date(task.due_date)
        if (dueDate >= weekStart) {
          const dayOfWeek = dueDate.getDay()
          const est = parseTimeEstimate(task.estimated_minutes)
          weeklyBars[dayOfWeek].estimated += est
          if (task.status === "done") {
            // Tempo real do time tracking; fallback pra estimativa quando a
            // task foi concluida sem timer.
            weeklyBars[dayOfWeek].actual +=
              Math.round((task.time_spent_seconds || 0) / 60) || est
          }
        }
      }
    }

    // Map members for assignee picker
    const members = (membersRes.data || []).map((m: Record<string, unknown>) => {
      const profile = m.profiles as Record<string, unknown> | null
      return {
        id: m.profile_id,
        name: profile?.name || "?",
        avatar_url: profile?.avatar_url || null,
        initials: String(profile?.name || "?").split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase(),
      }
    })

    // Map comments by task_id
    const comments = (commentsRes.data || []).map((c: Record<string, unknown>) => {
      const profile = c.profiles as Record<string, unknown> | null
      return {
        id: c.id,
        task_id: c.task_id,
        text: c.text,
        user_name: profile?.name || "?",
        user_initials: String(profile?.name || "?").split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase(),
        created_at: c.created_at,
      }
    })

    return successResponse(request, {
      groups,
      tasks,
      goals: goalsRes.data || [],
      habits,
      calendarEvents,
      members,
      comments,
      dailyPlan: dailyPlanRes.data || null,
      focusSessions: {
        count: focusSessions.length,
        totalMinutes: totalFocusMinutes,
        sessions: focusSessions,
      },
      weeklyBars,
      profile: {
        id: user.id,
        name: profileRes.data?.name ?? "Usuario",
        avatar_url: profileRes.data?.avatar_url ?? null,
      },
    })
  } catch (error) {
    return errorResponse(request, error, "ProductivityAPI")
  }
}

function parseTimeEstimate(minutes: number | null): number {
  return minutes || 0
}

// ── POST: Create/update productivity data ──

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()
    const { action, ...data } = body

    const { data: orgMember } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .single()

    const orgId = orgMember?.org_id

    switch (action) {
      case "create_task": {
        const { error } = await supabase
          .from("productivity_tasks")
          .insert({
            ...data,
            org_id: orgId,
            created_by: user.id,
          })
        if (error) throw error
        break
      }

      case "update_task": {
        const { id, ...updates } = data
        // Auto start/stop do time tracking por status: entrar em "progress"
        // liga o timer; sair acumula e desliga. Server-side pra cobrir
        // mudancas vindas do board/kanban sem tocar nos componentes.
        if (typeof updates.status === "string") {
          const { data: current } = await supabase
            .from("productivity_tasks")
            .select("time_spent_seconds, timer_started_at")
            .eq("id", id)
            .eq("org_id", orgId)
            .single()
          if (current) {
            if (updates.status === "progress" && !current.timer_started_at) {
              updates.timer_started_at = new Date().toISOString()
            } else if (
              updates.status !== "progress" &&
              current.timer_started_at
            ) {
              const elapsedSec = Math.max(
                0,
                Math.floor(
                  (Date.now() - Date.parse(current.timer_started_at)) / 1000,
                ),
              )
              updates.time_spent_seconds =
                (current.time_spent_seconds || 0) + elapsedSec
              updates.timer_started_at = null
            }
          }
        }
        const { error } = await supabase
          .from("productivity_tasks")
          .update(updates)
          .eq("id", id)
          .eq("org_id", orgId)
        if (error) throw error
        break
      }

      case "start_task_timer":
      case "stop_task_timer": {
        // Start/stop manual do time tracking (botao play/pause do drawer).
        // Idempotente: start com timer rodando e stop com timer parado sao
        // no-ops. O acumulo e calculado no servidor.
        const { task_id: timerTaskId } = data
        const { data: row, error: rowError } = await supabase
          .from("productivity_tasks")
          .select("time_spent_seconds, timer_started_at")
          .eq("id", timerTaskId)
          .eq("org_id", orgId)
          .single()
        if (rowError || !row) throw rowError ?? new Error("Task não encontrada")

        const timerUpdates: Record<string, unknown> = {}
        if (action === "start_task_timer") {
          if (!row.timer_started_at) {
            timerUpdates.timer_started_at = new Date().toISOString()
          }
        } else if (row.timer_started_at) {
          const elapsedSec = Math.max(
            0,
            Math.floor(
              (Date.now() - Date.parse(row.timer_started_at)) / 1000,
            ),
          )
          timerUpdates.time_spent_seconds =
            (row.time_spent_seconds || 0) + elapsedSec
          timerUpdates.timer_started_at = null
        }

        if (Object.keys(timerUpdates).length > 0) {
          const { error } = await supabase
            .from("productivity_tasks")
            .update(timerUpdates)
            .eq("id", timerTaskId)
            .eq("org_id", orgId)
          if (error) throw error
        }
        break
      }

      case "toggle_subtask": {
        const { id, done } = data
        const { error } = await supabase
          .from("productivity_subtasks")
          .update({ done })
          .eq("id", id)
        if (error) throw error
        break
      }

      case "complete_habit": {
        const { habit_id } = data
        const { error } = await supabase
          .from("productivity_habit_completions")
          .insert({
            habit_id,
            user_id: user.id,
            completed_at: new Date().toISOString(),
          })
        if (error) throw error
        break
      }

      case "uncomplete_habit": {
        const { habit_id } = data
        const today = new Date().toISOString().split("T")[0]
        const { error } = await supabase
          .from("productivity_habit_completions")
          .delete()
          .eq("habit_id", habit_id)
          .eq("user_id", user.id)
          .gte("completed_at", today)
        if (error) throw error
        break
      }

      case "save_daily_plan": {
        const { objectives, mood, tasks_planned } = data
        const { error } = await supabase
          .from("productivity_daily_plans")
          .upsert({
            user_id: user.id,
            plan_date: new Date().toISOString().split("T")[0],
            objectives,
            mood,
            tasks_planned,
            org_id: orgId,
          }, { onConflict: "user_id,plan_date" })
        if (error) throw error
        break
      }

      case "start_focus": {
        const { task_id, duration_minutes, category } = data
        const { data: session, error } = await supabase
          .from("productivity_focus_sessions")
          .insert({
            user_id: user.id,
            task_id,
            duration_minutes,
            category: category || "productivity",
            started_at: new Date().toISOString(),
            org_id: orgId,
          })
          .select("id")
          .single()
        if (error) throw error
        // Devolve o id pro cliente conseguir fechar a sessao no end_focus.
        return successResponse(request, {
          success: true,
          session_id: session?.id ?? null,
        })
      }

      case "end_focus": {
        const { session_id, actual_minutes } = data
        // Sem id nao ha sessao pra fechar (start falhou ou resposta perdida).
        if (!session_id) break
        const { error } = await supabase
          .from("productivity_focus_sessions")
          .update({
            actual_minutes,
            ended_at: new Date().toISOString(),
          })
          .eq("id", session_id)
        if (error) throw error
        break
      }

      case "shutdown_day": {
        const { tomorrow_priorities } = data
        const today = new Date().toISOString().split("T")[0]
        const { error } = await supabase
          .from("productivity_daily_plans")
          .update({
            shutdown_at: new Date().toISOString(),
            tomorrow_priorities,
          })
          .eq("user_id", user.id)
          .eq("plan_date", today)
        if (error) throw error
        break
      }

      case "create_goal": {
        const { title, area, color, quarter, target, current, unit } = data as Record<string, unknown>
        const now = new Date()
        const q = (quarter as string) || `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`
        const targetNum = target != null ? Number(target) : null
        const currentNum = current != null ? Number(current) : 0
        const progress = targetNum && targetNum > 0
          ? Math.min(Math.round((currentNum / targetNum) * 100), 100)
          : 0
        const { error } = await supabase
          .from("productivity_goals")
          .insert({
            title: title as string,
            area: (area as string) || null,
            color: (color as string) || "#4E62D8",
            quarter: q,
            target_value: targetNum,
            current_value: currentNum,
            unit: (unit as string) ?? null,
            progress,
            org_id: orgId,
          })
        if (error) throw error
        break
      }

      case "create_habit": {
        const { name: habitName, color: habitColor, frequency, reminder_at, note } = data as Record<string, unknown>
        const { error } = await supabase
          .from("productivity_habits")
          .insert({
            name: habitName as string,
            color: (habitColor as string) || "#4E62D8",
            frequency: (frequency as string) || "daily",
            reminder_at: (reminder_at as string) || null,
            note: (note as string) || null,
            user_id: user.id,
            org_id: orgId,
          })
        if (error) throw error
        break
      }

      case "create_subtask": {
        const { task_id: subTaskId, name: subName } = data
        const { error } = await supabase
          .from("productivity_subtasks")
          .insert({
            task_id: subTaskId,
            name: subName,
          })
        if (error) throw error
        break
      }

      case "add_comment": {
        const { task_id: commentTaskId, text: commentText } = data
        const { error } = await supabase
          .from("productivity_comments")
          .insert({
            task_id: commentTaskId,
            user_id: user.id,
            text: commentText,
            org_id: orgId,
          })
        if (error) throw error
        break
      }

      case "update_assignee": {
        const { id: assignTaskId, assigned_to: assignees } = data
        const { error } = await supabase
          .from("productivity_tasks")
          .update({ assigned_to: assignees })
          .eq("id", assignTaskId)
          .eq("org_id", orgId)
        if (error) throw error
        break
      }

      case "delete_task": {
        const { id: deleteTaskId } = data
        const { error } = await supabase
          .from("productivity_tasks")
          .delete()
          .eq("id", deleteTaskId)
          .eq("org_id", orgId)
        if (error) throw error
        break
      }

      case "create_group": {
        // Cria um grupo "vazio" registrando uma task placeholder oculta.
        // Como groups sao colunas em productivity_tasks, sem nenhuma task
        // o grupo nao persiste. Estrategia: cria task fantasma com nome
        // "__group_placeholder__" e status "archived" que NAO aparece no
        // board mas mantem o grupo registrado.
        const { group_id: cgId, group_name: cgName, group_color: cgColor } = data
        const { error } = await supabase
          .from("productivity_tasks")
          .insert({
            org_id: orgId,
            created_by: user.id,
            name: "__group_placeholder__",
            status: "archived",
            priority: 3,
            group_id: cgId,
            group_name: cgName,
            group_color: cgColor ?? "#9CA3AF",
            position: 0,
          })
        if (error) throw error
        break
      }

      case "delete_group": {
        // Excluir grupo = excluir todas as tasks do grupo. UI deve
        // confirmar com aviso explicito antes de chamar.
        const { group_id: dgId } = data
        const { error } = await supabase
          .from("productivity_tasks")
          .delete()
          .eq("group_id", dgId)
          .eq("org_id", orgId)
        if (error) throw error
        break
      }

      case "update_subtask": {
        const { id: subId, name: subNewName, done: subDone } = data
        const updates: Record<string, unknown> = {}
        if (typeof subNewName === "string") updates.name = subNewName
        if (typeof subDone === "boolean") updates.done = subDone
        const { error } = await supabase
          .from("productivity_subtasks")
          .update(updates)
          .eq("id", subId)
        if (error) throw error
        break
      }

      case "delete_subtask": {
        const { id: delSubId } = data
        const { error } = await supabase
          .from("productivity_subtasks")
          .delete()
          .eq("id", delSubId)
        if (error) throw error
        break
      }

      case "delete_comment": {
        const { id: delCommentId } = data
        const { error } = await supabase
          .from("productivity_comments")
          .delete()
          .eq("id", delCommentId)
          .eq("org_id", orgId)
        if (error) throw error
        break
      }

      case "update_comment": {
        const { id: updCommentId, text: updCommentText } = data
        if (typeof updCommentText !== "string" || !updCommentText.trim()) {
          throw new Error("text obrigatorio")
        }
        const { error } = await supabase
          .from("productivity_comments")
          .update({ text: updCommentText })
          .eq("id", updCommentId)
          .eq("org_id", orgId)
          .eq("user_id", user.id) // so o autor edita
        if (error) throw error
        break
      }

      case "reorder_groups": {
        // Espera { positions: [{ group_id, position }] }
        const positions = (data?.positions ?? []) as Array<{
          group_id: string
          position: number
        }>
        for (const p of positions) {
          await supabase
            .from("productivity_tasks")
            .update({ group_position: p.position })
            .eq("group_id", p.group_id)
            .eq("org_id", orgId)
        }
        break
      }

      case "bulk_delete_tasks": {
        const ids = (data?.ids ?? []) as string[]
        if (ids.length === 0) break
        const { error } = await supabase
          .from("productivity_tasks")
          .delete()
          .in("id", ids)
          .eq("org_id", orgId)
        if (error) throw error
        break
      }

      case "bulk_update_tasks": {
        const ids = (data?.ids ?? []) as string[]
        const updates = (data?.updates ?? {}) as Record<string, unknown>
        if (ids.length === 0 || Object.keys(updates).length === 0) break
        // Whitelist de campos editaveis em bulk
        const allowed: Record<string, unknown> = {}
        for (const k of [
          "status",
          "priority",
          "group_id",
          "group_name",
          "group_color",
          "assigned_to",
          "due_date",
        ]) {
          if (k in updates) allowed[k] = updates[k]
        }
        if (allowed.status === "done") {
          allowed.completed_at = new Date().toISOString()
        }
        const { error } = await supabase
          .from("productivity_tasks")
          .update(allowed)
          .in("id", ids)
          .eq("org_id", orgId)
        if (error) throw error
        break
      }

      case "update_group": {
        const { group_id: gId, group_name: gName, group_color: gColor } = data
        const updates: Record<string, unknown> = {}
        if (gName) updates.group_name = gName
        if (gColor) updates.group_color = gColor
        const { error } = await supabase
          .from("productivity_tasks")
          .update(updates)
          .eq("group_id", gId)
          .eq("org_id", orgId)
        if (error) throw error
        break
      }

      default:
        return successResponse(request, { error: "Unknown action" }, { status: 400 })
    }

    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "ProductivityAPI")
  }
}
