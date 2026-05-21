/**
 * AUTO·CLIENTE — marcacao automatica de task_checklists.
 *
 * Items do checklist com `auto_complete_on` populado sao marcados como
 * is_completed=true quando o evento correspondente dispara, sem acao
 * manual do CS/designer/ops.
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

type ChecklistRow = {
  id: string
  task_id: string
  slug: string | null
  is_completed: boolean
  auto_complete_on: Record<string, unknown> | null
}

/**
 * Busca task_checklists elegiveis: items de qualquer task do onboarding
 * na versao atual, ainda nao completados, com auto_complete_on populado.
 *
 * Importante: nao filtra por current_column_id — confirmBriefing avanca a
 * coluna antes de chamar o auto-complete, entao items de cliente_formulario
 * ja teriam ficado fora. Como os slugs no SEED sao globalmente unicos
 * (entrada_*, form_*, preview_*, etc), o filtro por event + version basta.
 */
async function fetchEligibleChecklists(
  onboardingId: string,
  event: string,
): Promise<ChecklistRow[]> {
  const admin = createAdminClient()

  // Filtra por version pra nao marcar items de versoes antigas em go-backs.
  const { data: onb } = await admin
    .from("onboardings")
    .select("current_version")
    .eq("id", onboardingId)
    .maybeSingle()
  if (!onb) return []

  const { data: tasks } = await admin
    .from("tasks")
    .select("id")
    .eq("onboarding_id", onboardingId)
    .eq("version", onb.current_version)
  const taskIds = (tasks ?? []).map((t) => t.id)
  if (taskIds.length === 0) return []

  const { data: items } = await admin
    .from("task_checklists")
    .select("id, task_id, slug, is_completed, auto_complete_on")
    .in("task_id", taskIds)
    .eq("is_completed", false)
    .not("auto_complete_on", "is", null)

  return ((items ?? []) as ChecklistRow[]).filter(
    (i) => (i.auto_complete_on as { event?: string } | null)?.event === event,
  )
}

async function markCompleted(checklistIds: string[]): Promise<void> {
  if (checklistIds.length === 0) return
  const admin = createAdminClient()
  const { error } = await admin
    .from("task_checklists")
    .update({ is_completed: true, completed_at: new Date().toISOString() })
    .in("id", checklistIds)
  if (error) log.warn("Marcacao auto falhou", { code: error.code, msg: error.message })
}

/**
 * Trigger: cliente completou secoes do wizard. Marca items cujo
 * auto_complete_on.sections seja subconjunto das sections completadas.
 */
export async function autoCompleteChecklistsForFormSections(
  onboardingId: string,
  sectionsCompleted: string[],
): Promise<void> {
  try {
    if (sectionsCompleted.length === 0) return
    const items = await fetchEligibleChecklists(onboardingId, "form_section_completed")
    const completedSet = new Set(sectionsCompleted)

    const toComplete: string[] = []
    for (const item of items) {
      const required = (item.auto_complete_on as { sections?: string[] } | null)?.sections ?? []
      if (required.length === 0) continue
      // Todas as secoes necessarias precisam estar completadas
      const allDone = required.every((s) => completedSet.has(s))
      if (allDone) toComplete.push(item.id)
    }

    await markCompleted(toComplete)
    if (toComplete.length > 0) {
      log.info("AUTO·CLIENTE marcou items via form_section_completed", {
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
 * Trigger: cliente confirmou o briefing inline. Marca items com
 * auto_complete_on.event = "briefing_approved".
 */
export async function autoCompleteOnBriefingApproved(
  onboardingId: string,
): Promise<void> {
  try {
    const items = await fetchEligibleChecklists(onboardingId, "briefing_approved")
    const ids = items.map((i) => i.id)
    await markCompleted(ids)
    if (ids.length > 0) {
      log.info("AUTO·CLIENTE marcou items via briefing_approved", {
        onboardingId,
        marked: ids.length,
      })
    }

    // Tambem auto-marca o deliverable "brand_brain_generated" (checkbox required)
    // da Etapa 02 — quando o briefing e aprovado, a Sintese estruturada existe.
    await autoFillBriefingDeliverables(onboardingId)
  } catch (e) {
    log.error("autoCompleteOnBriefingApproved falhou", e)
  }
}

/**
 * Trigger: email automatico foi disparado. Marca items com
 * auto_complete_on.event = "email_sent" e template_slug correspondente.
 */
export async function autoCompleteOnEmailSent(
  onboardingId: string,
  templateSlug: string,
): Promise<void> {
  try {
    const items = await fetchEligibleChecklists(onboardingId, "email_sent")
    const matching = items.filter(
      (i) =>
        (i.auto_complete_on as { template_slug?: string } | null)?.template_slug ===
        templateSlug,
    )
    const ids = matching.map((i) => i.id)
    await markCompleted(ids)
    if (ids.length > 0) {
      log.info("AUTO·CLIENTE marcou items via email_sent", {
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

  // Mesmo motivo de fetchEligibleChecklists: confirmBriefing pode ter
  // avancado a coluna ja. Busca em qualquer task da versao atual; os
  // field_slugs (brand_brain_generated, form_100_percent_filled) so
  // existem na Etapa 02, entao nao ha risco de marcar errado.
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
