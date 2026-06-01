/**
 * Reconciliacao destrutiva de tasks legadas com o template atual.
 *
 * Diferente do migrateLegacyTasksAddSubItems (que so adiciona sub_items),
 * este servico:
 *  - DELETA tasks da current_version cujo slug nao existe mais no
 *    checklist_template da coluna (mesmo se status=completed).
 *  - CRIA tasks faltantes (slug existe no template mas nao tem task).
 *  - MANTEM tasks cujo slug bate (preserva status, assignee, completed_at).
 *  - Sub_items: pra tasks mantidas, se o template tem sub_items e o
 *    metadata da task ainda nao, adiciona (chamando reuso do migrate).
 *
 * Escopo: SO mexe em onboardings status=in_progress, SO toca current_version,
 * SO toca tasks com operational_column_id (tasks de onboarding). Versoes
 * antigas (historico de reworks) ficam intocadas.
 *
 * Resultado por onboarding: tasks alinhadas 100% com o template atual.
 *
 * AVISO: destrutivo. Apaga task_deliverables linkados via FK cascade
 * (config do schema). Task_overrides apontando pras tasks deletadas
 * sobrevivem (FK ON DELETE SET NULL).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { ensureOnboardingBootstrap } from "./onboarding-bootstrap.service"
import type { ChecklistItem } from "@/types/onboarding-pipeline"

const log = logger.child("OnboardingTasksResync")

export interface ResyncStats {
  onboardings_scanned: number
  tasks_deleted: number
  tasks_created: number
  tasks_kept: number
  sub_items_added: number
  errors: Array<{ onboarding_id: string; column_id: string; error: string }>
}

interface OnboardingRow {
  id: string
  org_id: string
  current_version: number | null
}

interface ColumnRow {
  id: string
  slug: string
  name: string
  color: string
  default_assignee_role: string | null
  sla_hours: number | null
  checklist_template: ChecklistItem[] | null
  deliverables_template: Array<{
    slug: string
    label: string
    type: string
    required: boolean
  }> | null
}

export async function resyncAllOnboardingTasks(): Promise<ResyncStats> {
  const admin = createAdminClient()
  const stats: ResyncStats = {
    onboardings_scanned: 0,
    tasks_deleted: 0,
    tasks_created: 0,
    tasks_kept: 0,
    sub_items_added: 0,
    errors: [],
  }

  // 0) Re-sync dos templates de coluna por org. ensureOnboardingBootstrap
  //    atualiza checklist_template, deliverables_template, automation_rules
  //    de cada coluna com o SEED atual. Sem isso, a reconciliacao usaria o
  //    template antigo do banco.
  const { data: activeOrgsRows } = await admin
    .from("onboardings")
    .select("org_id")
    .eq("status", "in_progress")
  const activeOrgs = Array.from(
    new Set((activeOrgsRows ?? []).map((r) => r.org_id as string)),
  )
  for (const orgId of activeOrgs) {
    try {
      await ensureOnboardingBootstrap(orgId, null)
    } catch (e) {
      log.warn("Re-sync de templates falhou pra org", { orgId, error: e })
    }
  }

  // 1) Carrega TODAS as colunas com templates indexadas por id
  const { data: cols } = await admin
    .from("operational_pipeline_columns")
    .select(
      "id, slug, name, color, default_assignee_role, sla_hours, checklist_template, deliverables_template",
    )
  const colById = new Map<string, ColumnRow>()
  for (const c of (cols ?? []) as ColumnRow[]) colById.set(c.id, c)

  // 2) Onboardings em progresso
  const { data: onbs } = await admin
    .from("onboardings")
    .select("id, org_id, current_version")
    .eq("status", "in_progress")
  const onbList = (onbs ?? []) as OnboardingRow[]

  for (const onb of onbList) {
    stats.onboardings_scanned++
    const currentVersion = onb.current_version ?? 1

    // 3) Pra cada coluna, reconcilia tasks da current_version
    for (const col of colById.values()) {
      try {
        await reconcileColumnForOnboarding({
          admin,
          onboarding: onb,
          column: col,
          version: currentVersion,
          stats,
        })
      } catch (e) {
        stats.errors.push({
          onboarding_id: onb.id,
          column_id: col.id,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  log.info("Resync concluido", {
    ...stats,
    errors_count: stats.errors.length,
  })
  return stats
}

// ── Auditoria (read-only) ───────────────────────────────────────────────

export interface ResyncAuditEntry {
  onboarding_id: string
  org_id: string
  column_slug: string
  column_name: string
  task_id: string
  task_slug: string | null
  task_title: string | null
  task_status: string
  deliverables_with_files: Array<{
    field_slug: string
    field_label: string | null
    file_url: string
  }>
}

export interface ResyncAuditResult {
  onboardings_scanned: number
  tasks_to_delete: number
  tasks_to_delete_with_files: number
  files_at_risk: number
  /** Apenas tasks que seriam deletadas E tem deliverables com file_url. */
  at_risk: ResyncAuditEntry[]
}

/**
 * Simula o resync SEM deletar nada e reporta o impacto destrutivo: quais
 * tasks seriam deletadas (slug fora do template atual) e, dessas, quais tem
 * task_deliverables com file_url preenchido — os arquivos que o cascade
 * apagaria. Rode ANTES de resyncAllOnboardingTasks para decidir com seguranca.
 *
 * IMPORTANTE: nao chama ensureOnboardingBootstrap (que reescreve templates).
 * Usa o template atual ja persistido em operational_pipeline_columns — mesmo
 * snapshot que o resync usaria apos o bootstrap. Para fidelidade total rode o
 * bootstrap antes; aqui priorizamos zero efeito colateral.
 */
export async function auditResyncImpact(): Promise<ResyncAuditResult> {
  const admin = createAdminClient()
  const result: ResyncAuditResult = {
    onboardings_scanned: 0,
    tasks_to_delete: 0,
    tasks_to_delete_with_files: 0,
    files_at_risk: 0,
    at_risk: [],
  }

  const { data: cols } = await admin
    .from("operational_pipeline_columns")
    .select("id, slug, name, checklist_template")
  const colById = new Map<
    string,
    { slug: string; name: string; templateSlugs: Set<string> }
  >()
  for (const c of (cols ?? []) as Array<{
    id: string
    slug: string
    name: string
    checklist_template: ChecklistItem[] | null
  }>) {
    const slugs = new Set<string>()
    for (const item of c.checklist_template ?? []) {
      if (item.slug) slugs.add(item.slug)
    }
    colById.set(c.id, { slug: c.slug, name: c.name, templateSlugs: slugs })
  }

  const { data: onbs } = await admin
    .from("onboardings")
    .select("id, org_id, current_version")
    .eq("status", "in_progress")
  const onbList = (onbs ?? []) as OnboardingRow[]

  for (const onb of onbList) {
    result.onboardings_scanned++
    const version = onb.current_version ?? 1

    const { data: tasks } = await admin
      .from("tasks")
      .select("id, slug, title, status, operational_column_id")
      .eq("onboarding_id", onb.id)
      .eq("version", version)
      .not("operational_column_id", "is", null)

    const taskList = (tasks ?? []) as Array<{
      id: string
      slug: string | null
      title: string | null
      status: string
      operational_column_id: string
    }>

    // Agrupa por coluna pra aplicar a regra "template tem itens?".
    const byCol = new Map<string, typeof taskList>()
    for (const t of taskList) {
      const arr = byCol.get(t.operational_column_id) ?? []
      arr.push(t)
      byCol.set(t.operational_column_id, arr)
    }

    for (const [colId, colTasks] of byCol.entries()) {
      const col = colById.get(colId)
      if (!col) continue
      const templateEmpty = col.templateSlugs.size === 0

      const toDelete = colTasks.filter((t) => {
        if (!t.slug) return !templateEmpty // sem slug some so se template tem slugs
        return !col.templateSlugs.has(t.slug)
      })
      if (toDelete.length === 0) continue
      result.tasks_to_delete += toDelete.length

      for (const t of toDelete) {
        const { data: delivs } = await admin
          .from("task_deliverables")
          .select("field_slug, field_label, file_url")
          .eq("task_id", t.id)
          .not("file_url", "is", null)

        const withFiles = (delivs ?? []).filter(
          (d) => typeof d.file_url === "string" && d.file_url.length > 0,
        ) as Array<{ field_slug: string; field_label: string | null; file_url: string }>

        if (withFiles.length === 0) continue
        result.tasks_to_delete_with_files++
        result.files_at_risk += withFiles.length
        result.at_risk.push({
          onboarding_id: onb.id,
          org_id: onb.org_id,
          column_slug: col.slug,
          column_name: col.name,
          task_id: t.id,
          task_slug: t.slug,
          task_title: t.title,
          task_status: t.status,
          deliverables_with_files: withFiles.map((d) => ({
            field_slug: d.field_slug,
            field_label: d.field_label,
            file_url: d.file_url,
          })),
        })
      }
    }
  }

  log.info("Auditoria de resync concluida", {
    onboardings_scanned: result.onboardings_scanned,
    tasks_to_delete: result.tasks_to_delete,
    tasks_to_delete_with_files: result.tasks_to_delete_with_files,
    files_at_risk: result.files_at_risk,
  })
  return result
}

type AdminClient = ReturnType<typeof createAdminClient>

interface ReconcileOpts {
  admin: AdminClient
  onboarding: OnboardingRow
  column: ColumnRow
  version: number
  stats: ResyncStats
}

async function reconcileColumnForOnboarding(opts: ReconcileOpts): Promise<void> {
  const { admin, onboarding, column, version, stats } = opts

  const template = column.checklist_template ?? []
  const templateBySlug = new Map<string, ChecklistItem>()
  for (const item of template) {
    if (item.slug) templateBySlug.set(item.slug, item)
  }

  // Tasks atuais dessa coluna+versao
  const { data: tasks } = await admin
    .from("tasks")
    .select("id, slug, status, metadata, assignee_id, completed_at")
    .eq("onboarding_id", onboarding.id)
    .eq("operational_column_id", column.id)
    .eq("version", version)

  const taskList = (tasks ?? []) as Array<{
    id: string
    slug: string | null
    status: string
    metadata: Record<string, unknown> | null
    assignee_id: string | null
    completed_at: string | null
  }>

  const taskBySlug = new Map<string, (typeof taskList)[number]>()
  for (const t of taskList) {
    if (t.slug) taskBySlug.set(t.slug, t)
  }

  // Se a coluna nao tem tasks instanciadas (onboarding nem chegou nessa
  // etapa ainda) e template tambem nao tem itens, skip.
  if (taskList.length === 0 && template.length === 0) return

  // Se taskList.length === 0 mas template existe, NAO instanciamos aqui
  // — onboardings ainda nao chegaram nessa coluna naturalmente.
  // O resync so atua em colunas que ja foram visitadas.
  if (taskList.length === 0) return

  // 1) DELETE: tasks com slug que sumiu do template (ou sem slug em meio
  //    a um template com slugs).
  const toDelete = taskList.filter((t) => {
    if (!t.slug) return template.length > 0
    return !templateBySlug.has(t.slug)
  })
  if (toDelete.length > 0) {
    const ids = toDelete.map((t) => t.id)
    const { error: delErr } = await admin.from("tasks").delete().in("id", ids)
    if (delErr) throw delErr
    stats.tasks_deleted += toDelete.length
  }

  // 2) CREATE: slugs do template sem task correspondente.
  const missing = Array.from(templateBySlug.entries()).filter(
    ([slug]) => !taskBySlug.has(slug),
  )
  if (missing.length > 0) {
    const now = Date.now()
    const sourceMeta: Record<string, unknown> = {
      stage_name: column.name,
      stage_color: column.color,
      stage_slug: column.slug,
      onboarding_id: onboarding.id,
    }

    const rows = missing.map(([slug, item], idx) => {
      const subItems = item.sub_items
      const slaHours = item.sla_hours ?? column.sla_hours ?? 24
      return {
        org_id: onboarding.org_id,
        title: item.label,
        description: item.description ?? null,
        status: "pending" as const,
        priority: "medium" as const,
        type: "onboarding" as const,
        source_type: "onboarding",
        source_id: onboarding.id,
        source_metadata: sourceMeta,
        onboarding_id: onboarding.id,
        operational_column_id: column.id,
        assignee_role:
          item.assignee_role ?? column.default_assignee_role ?? null,
        version,
        due_date: new Date(now + slaHours * 3_600_000).toISOString(),
        sla_hours: slaHours,
        slug,
        auto_complete_on: item.auto_complete_on ?? null,
        metadata: {
          column_slug: column.slug,
          column_name: column.name,
          item_position: item.order ?? idx,
          // Anchor recalculado depois (a coluna pode ja ter anchor preservada).
          is_column_anchor: false,
          ...(subItems && subItems.length > 0
            ? {
                sub_items: subItems.map((si) => ({
                  ...si,
                  completed: si.completed ?? false,
                })),
              }
            : {}),
        },
      }
    })
    const { error: insErr } = await admin.from("tasks").insert(rows)
    if (insErr) throw insErr
    stats.tasks_created += rows.length
  }

  // 3) MANTÊM + adiciona sub_items quando o template tem mas a task nao
  for (const t of taskList) {
    if (!t.slug || !templateBySlug.has(t.slug)) continue // ja foi deletada
    stats.tasks_kept++
    const item = templateBySlug.get(t.slug)
    if (!item || !item.sub_items || item.sub_items.length === 0) continue
    const meta = (t.metadata ?? {}) as Record<string, unknown> & {
      sub_items?: Array<{ slug: string; completed?: boolean }>
    }
    if (Array.isArray(meta.sub_items) && meta.sub_items.length > 0) continue
    const newSubItems = item.sub_items.map((s) => ({
      ...s,
      completed: false,
    }))
    await admin
      .from("tasks")
      .update({ metadata: { ...meta, sub_items: newSubItems } })
      .eq("id", t.id)
    stats.sub_items_added++
  }

  // 4) Reconcilia anchor (primeira task por item_position vira anchor pra
  //    receber deliverables). Se a coluna tem tasks novas, pode ser que
  //    a anchor anterior foi deletada — precisamos garantir 1 anchor.
  const { data: remainingTasks } = await admin
    .from("tasks")
    .select("id, metadata, created_at")
    .eq("onboarding_id", onboarding.id)
    .eq("operational_column_id", column.id)
    .eq("version", version)
    .order("created_at", { ascending: true })

  const remaining = (remainingTasks ?? []) as Array<{
    id: string
    metadata: Record<string, unknown> | null
  }>
  if (remaining.length === 0) return

  const hasAnchor = remaining.some(
    (t) => (t.metadata as { is_column_anchor?: boolean })?.is_column_anchor,
  )
  if (!hasAnchor) {
    // Promove primeira como anchor
    const first = remaining[0]
    const meta = (first.metadata ?? {}) as Record<string, unknown>
    await admin
      .from("tasks")
      .update({ metadata: { ...meta, is_column_anchor: true } })
      .eq("id", first.id)

    // 5) Garante que deliverables_template tem rows em task_deliverables na anchor.
    const fields = column.deliverables_template ?? []
    if (fields.length > 0) {
      const { data: existingDelivs } = await admin
        .from("task_deliverables")
        .select("field_slug")
        .eq("task_id", first.id)
      const have = new Set((existingDelivs ?? []).map((d) => d.field_slug as string))
      const toCreate = fields
        .filter((f) => !have.has(f.slug))
        .map((f) => ({
          task_id: first.id,
          field_slug: f.slug,
          field_label: f.label,
          field_type: f.type,
          required: f.required,
        }))
      if (toCreate.length > 0) {
        await admin.from("task_deliverables").insert(toCreate)
      }
    }
  }
}
