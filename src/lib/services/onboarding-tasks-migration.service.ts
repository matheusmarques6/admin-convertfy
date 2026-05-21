/**
 * Migracao de tasks legadas pra incluir sub_items no metadata.
 *
 * Contexto: o re-sync do ensureOnboardingBootstrap atualiza o
 * checklist_template das colunas em cada deploy, mas tasks JA instanciadas
 * em onboardings em progresso ficam com o snapshot antigo. Pra Etapa 05
 * (emails_finais), isso significa que as tasks existentes nao tem
 * metadata.sub_items e a UI mostra so o nome do flow sem os emails.
 *
 * Esta migracao e aditiva e idempotente: percorre tasks de onboarding
 * em progresso, encontra o item correspondente no checklist_template
 * (matching por task.slug = checklist_item.slug) e, se o item tem
 * sub_items mas a task ainda nao, copia pra metadata. Tasks ja
 * migradas (com sub_items no metadata) sao puladas.
 *
 * O que NAO migra (precisa decisao manual):
 *  - Tasks com slugs antigos que sumiram do template novo (ex: Etapa 05
 *    legada tinha emails_finais_lido, emails_finais_copies etc).
 *    Permanecem no banco — se quiser apagar, e via UPDATE separado.
 *  - Novas tasks faltantes (ex: aprovacao_confirmacao_final na Etapa 04).
 *    Pra adicionar, re-instanciar a coluna do onboarding (destrutivo).
 *  - Novos deliverables required adicionados ao template.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingTasksMigration")

interface SubItemTemplate {
  slug: string
  label: string
  from_preview?: string
}

interface ChecklistItemTemplate {
  id: string
  slug?: string
  label: string
  sub_items?: SubItemTemplate[]
}

export interface MigrationResult {
  scanned: number
  migrated: number
  skipped_already_has_sub_items: number
  skipped_no_template_match: number
  skipped_template_has_no_sub_items: number
  errors: Array<{ task_id: string; error: string }>
}

export async function migrateLegacyTasksAddSubItems(): Promise<MigrationResult> {
  const admin = createAdminClient()
  const result: MigrationResult = {
    scanned: 0,
    migrated: 0,
    skipped_already_has_sub_items: 0,
    skipped_no_template_match: 0,
    skipped_template_has_no_sub_items: 0,
    errors: [],
  }

  // 1) Carrega todas as colunas com seus checklist_templates.
  //    Indexa por (column_id) -> { template, slugIndex }.
  const { data: cols } = await admin
    .from("operational_pipeline_columns")
    .select("id, slug, checklist_template")

  const colIndex = new Map<
    string,
    { slug: string; bySlug: Map<string, ChecklistItemTemplate> }
  >()
  for (const c of cols ?? []) {
    const template = (c.checklist_template ?? []) as ChecklistItemTemplate[]
    const bySlug = new Map<string, ChecklistItemTemplate>()
    for (const item of template) {
      if (item.slug) bySlug.set(item.slug, item)
    }
    colIndex.set(c.id as string, { slug: c.slug as string, bySlug })
  }

  // 2) Busca todas as tasks ligadas a onboardings em progresso.
  //    Filtro por status do onboarding pra nao mexer em concluidos/cancelados.
  const { data: activeOnbs } = await admin
    .from("onboardings")
    .select("id, current_version")
    .eq("status", "in_progress")

  const activeIds = (activeOnbs ?? []).map((o) => o.id as string)
  const versionByOnb = new Map<string, number>(
    (activeOnbs ?? []).map((o) => [o.id as string, (o.current_version as number) ?? 1]),
  )

  if (activeIds.length === 0) {
    log.info("Nenhum onboarding em progresso pra migrar")
    return result
  }

  const { data: tasks } = await admin
    .from("tasks")
    .select("id, slug, metadata, onboarding_id, operational_column_id, version")
    .in("onboarding_id", activeIds)
    .not("operational_column_id", "is", null)

  for (const t of tasks ?? []) {
    result.scanned++

    // So migra task da versao atual do onboarding (versoes antigas ficam
    // como snapshot historico).
    const currentVersion = versionByOnb.get(t.onboarding_id as string) ?? 1
    if ((t.version as number) !== currentVersion) continue

    const colInfo = colIndex.get(t.operational_column_id as string)
    if (!colInfo) {
      result.skipped_no_template_match++
      continue
    }

    const taskSlug = (t.slug as string | null) ?? null
    if (!taskSlug) {
      result.skipped_no_template_match++
      continue
    }

    const templateItem = colInfo.bySlug.get(taskSlug)
    if (!templateItem) {
      result.skipped_no_template_match++
      continue
    }

    const subItemsTemplate = templateItem.sub_items ?? []
    if (subItemsTemplate.length === 0) {
      result.skipped_template_has_no_sub_items++
      continue
    }

    const meta = (t.metadata ?? {}) as Record<string, unknown> & {
      sub_items?: Array<{ slug: string; completed?: boolean }>
    }
    if (Array.isArray(meta.sub_items) && meta.sub_items.length > 0) {
      result.skipped_already_has_sub_items++
      continue
    }

    // Migra: adiciona sub_items com completed=false a partir do template.
    const newSubItems = subItemsTemplate.map((s) => ({
      ...s,
      completed: false,
    }))
    const { error: upErr } = await admin
      .from("tasks")
      .update({ metadata: { ...meta, sub_items: newSubItems } })
      .eq("id", t.id)
    if (upErr) {
      result.errors.push({ task_id: t.id as string, error: upErr.message })
    } else {
      result.migrated++
    }
  }

  log.info("Migracao concluida", { ...result, errors_count: result.errors.length })
  return result
}
