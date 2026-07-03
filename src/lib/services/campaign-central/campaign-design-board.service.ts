/**
 * Fase 7 do pipeline de DESIGN de campanha — projecao das campanhas em design
 * como grupos virtuais no board de Projetos (/api/productivity).
 *
 * Espelha a projecao de onboarding (`/api/productivity/route.ts`, bloco
 * "Onboardings como projetos virtuais"):
 *   - 1 grupo por campanha com design ATIVO (design_column_id != null) cuja
 *     etapa atual a FUNCAO do usuario pode acessar (bypass ve todas);
 *   - items = tasks da etapa atual (operational_column_id = design_column_id) na
 *     versao atual (version = design_version), exceto cancelled;
 *   - flags can_work/can_admin/responsible_role resolvidas no SERVIDOR via
 *     `getCampaignStageAccess` — a UI consome direto sem reimplementar a matriz.
 *
 * Sem duplicar dados: as tasks ja existem na tabela `tasks` (criadas pelo
 * instanciador do pipeline de design). Aqui so projetamos pro shape do board.
 */

import { createAdminClient } from "@/lib/supabase/server"
import {
  canAccessCampaignStage,
  getCampaignStageAccess,
} from "@/lib/permissions/campaign-stage-access"

export interface CampaignDesignGroup {
  id: string
  suggestion_id: string
  name: string
  color: string
  position: number
  items: Array<Record<string, unknown>>
  can_work: boolean
  can_admin: boolean
  responsible_role: string | null
  design_stage: string | null
  // Campos de display consumidos pelo board (mesmo shape do grupo de onboarding):
  // o header rico do board renderiza quando source_type e um "projeto virtual".
  source_type: "campaign_design"
  stage_name: string | null
  stage_color: string | null
  stage_role: string | null
}

interface CampaignRow {
  id: string
  org_id: string
  title: string | null
  design_column_id: string | null
  design_version: number | null
}

interface ColumnRow {
  id: string
  slug: string | null
  name?: string | null
  color?: string | null
}

interface TaskRow {
  id: string
  title: string | null
  description: string | null
  status: string | null
  priority: string | null
  due_date: string | null
  sla_hours: number | null
  assignee_role: string | null
  assignee_id: string | null
  source_type: string | null
  source_id: string | null
  operational_column_id: string | null
  version: number | null
  // Slug do checklist item que originou a task (ex.: impl_corte_modelo) —
  // discriminante estável pro drawer (isCutMappingTask).
  slug: string | null
  metadata: Record<string, unknown> | null
  created_at: string | null
  time_spent_seconds: number | null
  timer_started_at: string | null
}

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

/**
 * Lista os grupos virtuais (1 por campanha em design ativo) visiveis pela funcao
 * do usuario, ja com items (tasks da etapa atual) e flags de permissao.
 */
export async function listCampaignDesignProjectGroups(params: {
  orgId: string
  roles: string[]
}): Promise<CampaignDesignGroup[]> {
  const { orgId, roles } = params
  if (!orgId) return []

  const admin = createAdminClient()

  // Campanhas do org com design ATIVO (design_column_id != null).
  const { data: campaignsData } = await admin
    .from("campaign_suggestions")
    .select("id, org_id, title, design_column_id, design_version")
    .eq("org_id", orgId)
    .not("design_column_id", "is", null)

  const campaigns = (campaignsData ?? []) as CampaignRow[]
  if (campaigns.length === 0) return []

  // Resolve slug de cada coluna de design (id = design_column_id).
  const columnIds = Array.from(
    new Set(
      campaigns
        .map((c) => c.design_column_id)
        .filter((v): v is string => Boolean(v)),
    ),
  )
  const { data: columnsData } = await admin
    .from("operational_pipeline_columns")
    .select("id, slug, name, color")
    .in("id", columnIds)
  const columnById = new Map<string, ColumnRow>()
  for (const c of (columnsData ?? []) as ColumnRow[]) {
    columnById.set(c.id, c)
  }

  // Pre-filtra campanhas cuja etapa atual a funcao do usuario pode acessar.
  const visible = campaigns.filter((c) => {
    if (!c.design_column_id) return false
    const slug = columnById.get(c.design_column_id)?.slug ?? null
    return canAccessCampaignStage(roles, slug)
  })
  if (visible.length === 0) return []

  // Tasks de TODAS as campanhas visiveis em uma query (source_type campaign).
  const suggestionIds = visible.map((c) => c.id)
  const { data: tasksData } = await admin
    .from("tasks")
    .select(
      "id, title, description, status, priority, due_date, sla_hours, assignee_role, assignee_id, source_type, source_id, operational_column_id, version, slug, metadata, created_at, time_spent_seconds, timer_started_at",
    )
    .eq("source_type", "campaign_suggestion")
    .in("source_id", suggestionIds)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true })
  const allTasks = (tasksData ?? []) as TaskRow[]

  // Enriquecimento por task (deliverables/checklists/comments), espelhando o
  // onboarding. Vazio quando nao ha tasks — nao quebra a projecao.
  const allTaskIds = allTasks.map((t) => t.id)
  const [delvRes, chkRes, cmtRes] =
    allTaskIds.length > 0
      ? await Promise.all([
          admin
            .from("task_deliverables")
            .select(
              "id, task_id, field_slug, field_label, field_type, required, value, file_url, file_name, file_size_bytes, filled_at, metadata",
            )
            .in("task_id", allTaskIds),
          admin
            .from("task_checklists")
            .select("id, task_id, title, position, is_completed, completed_by")
            .in("task_id", allTaskIds)
            .order("position", { ascending: true }),
          admin
            .from("task_comments")
            .select(
              "id, task_id, author_id, content, attachments, created_at, profiles:author_id(name, avatar_url)",
            )
            .in("task_id", allTaskIds)
            .order("created_at", { ascending: true }),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }]

  const groupByTask = <T extends { task_id?: unknown }>(
    rows: T[] | null | undefined,
  ) => {
    const map = new Map<string, T[]>()
    for (const r of (rows ?? []) as T[]) {
      const tid = r.task_id as string
      if (!map.has(tid)) map.set(tid, [])
      map.get(tid)!.push(r)
    }
    return map
  }
  const delvByTask = groupByTask(
    delvRes.data as Array<Record<string, unknown>> | undefined,
  )
  const chkByTask = groupByTask(
    chkRes.data as Array<Record<string, unknown>> | undefined,
  )
  const cmtByTask = groupByTask(
    cmtRes.data as Array<Record<string, unknown>> | undefined,
  )

  const groups: CampaignDesignGroup[] = []
  let order = 0
  for (const campaign of visible) {
    const designColumnId = campaign.design_column_id as string
    const column = columnById.get(designColumnId) ?? null
    const slug = column?.slug ?? null
    const version = campaign.design_version ?? 1
    const access = getCampaignStageAccess(roles, slug)

    // Tasks da etapa atual: coluna atual + versao atual (rework-safe).
    const stageTasks = allTasks
      .filter(
        (t) =>
          t.source_id === campaign.id &&
          t.operational_column_id === designColumnId &&
          (t.version ?? 1) === version,
      )
      .sort((a, b) => {
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
        const ac = a.created_at ?? ""
        const bc = b.created_at ?? ""
        return ac.localeCompare(bc)
      })

    const groupId = `campaign-${campaign.id}`
    const groupColor = column?.color ?? "#1F1F1F"
    const groupName = `Campanha · ${campaign.title ?? "Campanha"}`

    const items = stageTasks.map((t) => {
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
        project: campaign.title ?? "",
        status: statusMap[t.status as string] ?? "pending",
        priority: priorityMap[t.priority as string] ?? 3,
        due_date: t.due_date,
        estimated_minutes: t.sla_hours ? t.sla_hours * 60 : null,
        time_spent_seconds: t.time_spent_seconds ?? 0,
        timer_started_at: t.timer_started_at ?? null,
        assigned_to: t.assignee_id ? [t.assignee_id] : [],
        assignee_role: t.assignee_role,
        // Origem pro drawer renderizar o contexto de campanha.
        source_type: "campaign_suggestion",
        source_id: campaign.id,
        suggestion_id: campaign.id,
        operational_column_id: t.operational_column_id,
        version: t.version ?? version,
        slug: t.slug ?? null,
        metadata: {
          ...tMeta,
          campaign_title: campaign.title ?? null,
          column_name: column?.name ?? null,
          stage_color: column?.color ?? null,
          design_stage: slug,
        },
        deliverables: delvByTask.get(t.id) ?? [],
        checklist: chkByTask.get(t.id) ?? [],
        task_comments: cmtByTask.get(t.id) ?? [],
        attachments,
        links,
        subtasks: [],
        group_id: groupId,
        group_name: groupName,
        group_color: groupColor,
      } as Record<string, unknown>
    })

    groups.push({
      id: groupId,
      suggestion_id: campaign.id,
      name: groupName,
      color: groupColor,
      position: 2000 + order,
      items,
      can_work: access.canWork,
      can_admin: access.canAdmin,
      responsible_role: access.responsibleRole,
      design_stage: slug,
      source_type: "campaign_design",
      stage_name: column?.name ?? null,
      stage_color: column?.color ?? null,
      stage_role: access.responsibleRole,
    })
    order += 1
  }

  return groups
}
