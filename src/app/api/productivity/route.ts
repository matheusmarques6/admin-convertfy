/**
 * GET /api/productivity — Unified data endpoint for productivity module.
 * Returns all data needed for Início + Board pages in a single request.
 *
 * POST /api/productivity — Create/update productivity data (tasks, goals, habits, etc.)
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"

// ── GET: Fetch all productivity data for the current user ──

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Get user's org membership for multi-tenant
    const { data: orgMember } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .single()

    const orgId = orgMember?.org_id

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
      groupMap.get(groupId)!.items.push(task)
    }

    const groups = Array.from(groupMap.values()).sort((a, b) => a.position - b.position)

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
            weeklyBars[dayOfWeek].actual += task.actual_minutes || est
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
      profile: profileRes.data || { name: "Usuario", avatar_url: null },
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
        const { error } = await supabase
          .from("productivity_tasks")
          .update(updates)
          .eq("id", id)
          .eq("org_id", orgId)
        if (error) throw error
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
        const { error } = await supabase
          .from("productivity_focus_sessions")
          .insert({
            user_id: user.id,
            task_id,
            duration_minutes,
            category: category || "productivity",
            started_at: new Date().toISOString(),
            org_id: orgId,
          })
        if (error) throw error
        break
      }

      case "end_focus": {
        const { session_id, actual_minutes } = data
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
        const { title, area, color, quarter } = data
        const now = new Date()
        const q = quarter || `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`
        const { error } = await supabase
          .from("productivity_goals")
          .insert({
            title,
            area: area || null,
            color: color || "#4E62D8",
            quarter: q,
            org_id: orgId,
          })
        if (error) throw error
        break
      }

      case "create_habit": {
        const { name: habitName, color: habitColor } = data
        const { error } = await supabase
          .from("productivity_habits")
          .insert({
            name: habitName,
            color: habitColor || "#4E62D8",
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
        // Groups are stored as fields on tasks — create a placeholder task for new groups
        // Or update all tasks in the group
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
