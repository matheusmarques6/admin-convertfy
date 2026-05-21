/**
 * AUTO·CLIENTE — marcacao automatica de tasks de onboarding.
 *
 * Tasks com `auto_complete_on` populado sao marcadas como status='completed'
 * quando o evento correspondente dispara, sem acao manual do CS/designer/ops.
 *
 * Modelo novo (refator "1 task por checklist item"): cada item do
 * checklist_template do SEED vira 1 task individual. Esse service atua
 * direto em `tasks.status` (nao mais em task_checklists.is_completed).
 *
 * Eventos suportados:
 *   - form_section_completed  → cliente completou X secoes do wizard
 *                                (campos no submit-data/route.ts)
 *   - briefing_approved       → cliente confirmou o briefing inline
 *                                (confirmBriefing em onboarding-pipeline.service.ts)
 *   - email_sent              → email automatico foi disparado
 *                                (sendAccountActiveEmail em onboarding-email.service.ts)
 *
 * Idempotente: chamadas repetidas com o mesmo estado nao mudam nada.
 * Best-effort: falhas sao logadas mas nao propagadas (chamadas em
 * after()/fire-and-forget pelos call sites).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingAutoChecklist")

type TaskRow = {
  id: string
  status: string
  slug: string | null
  auto_complete_on: Record<string, unknown> | null
  onboarding_id: string | null
  operational_column_id: string | null
}

/**
 * Busca tasks elegiveis: tasks do onboarding na versao atual, ainda nao
 * completadas, com auto_complete_on populado e event correspondente.
 *
 * Importante: nao filtra por current_column_id — confirmBriefing avanca
 * a coluna antes de chamar o auto-complete, entao tasks da coluna anterior
 * (cliente_formulario) ja teriam ficado fora. Como os slugs no SEED sao
 * globalmente unicos (entrada_*, form_*, preview_*, etc), o filtro por
 * event + version basta.
 */
async function fetchEligibleTasks(
  onboardingId: string,
  event: string,
): Promise<TaskRow[]> {
  const admin = createAdminClient()

  const { data: onb } = await admin
    .from("onboardings")
    .select("current_version")
    .eq("id", onboardingId)
    .maybeSingle()
  if (!onb) return []

  const { data: tasks } = await admin
    .from("tasks")
    .select("id, status, slug, auto_complete_on, onboarding_id, operational_column_id")
    .eq("onboarding_id", onboardingId)
    .eq("version", onb.current_version)
    .neq("status", "completed")
    .not("auto_complete_on", "is", null)

  return ((tasks ?? []) as TaskRow[]).filter(
    (t) => (t.auto_complete_on as { event?: string } | null)?.event === event,
  )
}

async function markTasksCompleted(taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) return
  const admin = createAdminClient()
  const { error } = await admin
    .from("tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .in("id", taskIds)
  if (error) log.warn("Marcacao auto falhou", { code: error.code, msg: error.message })
}

/**
 * Trigger: cliente completou secoes do wizard. Marca tasks cujo
 * auto_complete_on.sections seja subconjunto das sections completadas.
 */
export async function autoCompleteChecklistsForFormSections(
  onboardingId: string,
  sectionsCompleted: string[],
): Promise<void> {
  try {
    if (sectionsCompleted.length === 0) return
    const tasks = await fetchEligibleTasks(onboardingId, "form_section_completed")
    const completedSet = new Set(sectionsCompleted)

    const toComplete: string[] = []
    for (const task of tasks) {
      const required =
        (task.auto_complete_on as { sections?: string[] } | null)?.sections ?? []
      if (required.length === 0) continue
      // Todas as secoes necessarias precisam estar completadas
      const allDone = required.every((s) => completedSet.has(s))
      if (allDone) toComplete.push(task.id)
    }

    await markTasksCompleted(toComplete)
    if (toComplete.length > 0) {
      log.info("AUTO·CLIENTE marcou tasks via form_section_completed", {
        onboardingId,
        sectionsCompleted,
        marked: toComplete.length,
      })
    }
  } catch (e) {
    log.error("autoCompleteChecklistsForFormSections falhou", e)
  }
}

/**
 * Trigger: cliente confirmou o briefing inline. Marca tasks com
 * auto_complete_on.event = "briefing_approved" + popula deliverables
 * auto-preenchiveis da Etapa 02.
 */
export async function autoCompleteOnBriefingApproved(
  onboardingId: string,
): Promise<void> {
  try {
    const tasks = await fetchEligibleTasks(onboardingId, "briefing_approved")
    const ids = tasks.map((t) => t.id)
    await markTasksCompleted(ids)
    if (ids.length > 0) {
      log.info("AUTO·CLIENTE marcou tasks via briefing_approved", {
        onboardingId,
        marked: ids.length,
      })
    }

    // Auto-marca os deliverables "brand_brain_generated" e
    // "form_100_percent_filled" (checkbox required) da Etapa 02.
    await autoFillBriefingDeliverables(onboardingId)
  } catch (e) {
    log.error("autoCompleteOnBriefingApproved falhou", e)
  }
}

/**
 * Trigger: email automatico foi disparado. Marca tasks com
 * auto_complete_on.event = "email_sent" e template_slug correspondente.
 */
export async function autoCompleteOnEmailSent(
  onboardingId: string,
  templateSlug: string,
): Promise<void> {
  try {
    const tasks = await fetchEligibleTasks(onboardingId, "email_sent")
    const matching = tasks.filter(
      (t) =>
        (t.auto_complete_on as { template_slug?: string } | null)?.template_slug ===
        templateSlug,
    )
    const ids = matching.map((t) => t.id)
    await markTasksCompleted(ids)
    if (ids.length > 0) {
      log.info("AUTO·CLIENTE marcou tasks via email_sent", {
        onboardingId,
        templateSlug,
        marked: ids.length,
      })
    }
  } catch (e) {
    log.error("autoCompleteOnEmailSent falhou", e)
  }
}

/**
 * Marca deliverables especificos como filled quando o briefing e aprovado:
 *   - brand_brain_generated (checkbox)
 *   - form_100_percent_filled (checkbox) — todas as secoes completadas
 *
 * Busca qualquer task da versao atual (sem filtrar por coluna porque o
 * confirmBriefing avanca antes desse callback). field_slugs sao unicos da
 * Etapa 02, sem risco de match cruzado.
 */
async function autoFillBriefingDeliverables(
  onboardingId: string,
): Promise<void> {
  const admin = createAdminClient()
  const { data: onb } = await admin
    .from("onboardings")
    .select("current_version, form_sections_completed")
    .eq("id", onboardingId)
    .maybeSingle()
  if (!onb) return

  const { data: tasks } = await admin
    .from("tasks")
    .select("id")
    .eq("onboarding_id", onboardingId)
    .eq("version", onb.current_version)
  const taskIds = (tasks ?? []).map((t) => t.id)
  if (taskIds.length === 0) return

  const now = new Date().toISOString()

  // Brand brain: marca sempre que o briefing foi aprovado (callsite garante).
  await admin
    .from("task_deliverables")
    .update({ value: "true", filled_at: now })
    .in("task_id", taskIds)
    .eq("field_slug", "brand_brain_generated")
    .is("filled_at", null)

  // Form 100% preenchido: marca se todas as 6 secoes do wizard foram feitas.
  const sections = (onb.form_sections_completed ?? []) as string[]
  const allSections = ["empresa", "loja", "marca", "cliente", "objetivos", "materiais"]
  const allDone = allSections.every((s) => sections.includes(s))
  if (allDone) {
    await admin
      .from("task_deliverables")
      .update({ value: "true", filled_at: now })
      .in("task_id", taskIds)
      .eq("field_slug", "form_100_percent_filled")
      .is("filled_at", null)
  }
}
