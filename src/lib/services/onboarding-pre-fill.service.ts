/**
 * Pre-fill 03->05: copia deliverables dos pilotos (Etapa 03) pros sub_items
 * correspondentes da Etapa 05.
 *
 * Disparado pelo advanceColumn quando o onboarding entra em `emails_finais`.
 * Idempotente: re-aplicar nao duplica nem sobrescreve sub_items ja editados
 * manualmente (so atualiza os que ainda nao foram tocados).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingPreFill")

/** slug do piloto (Etapa 03) -> { flow_slug da Etapa 05, sub_item_slug } */
const PREVIEW_TO_FLOW_MAP: Record<string, { flowSlug: string; subItemSlug: string }> = {
  piloto_welcome_files: { flowSlug: "flow_welcome", subItemSlug: "welcome_email_1" },
  piloto_carrinho_1_files: { flowSlug: "flow_carrinho_abandonado", subItemSlug: "carrinho_email_1" },
  piloto_carrinho_2_files: { flowSlug: "flow_carrinho_abandonado", subItemSlug: "carrinho_email_2" },
  piloto_pos_compra_files: { flowSlug: "flow_upsell", subItemSlug: "upsell_email_1" },
}

interface SubItem {
  slug: string
  label: string
  from_preview?: string
  completed?: boolean
  preview_deliverable_id?: string | null
  preview_file_url?: string | null
  completed_at?: string | null
  completed_by?: string | null
}

interface TaskMetadata {
  column_slug?: string
  sub_items?: SubItem[]
  [k: string]: unknown
}

/**
 * Copia file_url + deliverable_id dos pilotos pros sub_items mapeados.
 *
 * Estrategia: para cada deliverable da Etapa 03 cujo slug aparece no map,
 * encontra a task da Etapa 05 (mesma onboarding/versao) cujo metadata.column_slug
 * bate com flowSlug, e atualiza o sub_item correspondente.
 */
export async function applyPreFillFromPreview(
  onboardingId: string,
  actorId: string | null,
): Promise<void> {
  const admin = createAdminClient()

  const { data: onb } = await admin
    .from("onboardings")
    .select("id, current_version")
    .eq("id", onboardingId)
    .maybeSingle()
  if (!onb) return

  // 1) Busca task anchor da Etapa 03 (preview_producao) na versao atual.
  //    O anchor concentra todos os task_deliverables.
  const { data: previewTasks } = await admin
    .from("tasks")
    .select("id, metadata")
    .eq("onboarding_id", onboardingId)
    .eq("version", onb.current_version)
    .contains("metadata", { column_slug: "preview_producao", is_column_anchor: true })

  const previewAnchorId = previewTasks?.[0]?.id
  if (!previewAnchorId) {
    log.info("Pre-fill skip: anchor da Etapa 03 nao encontrada", { onboardingId })
    return
  }

  // 2) Busca deliverables do piloto cujos slugs estao mapeados.
  const previewSlugs = Object.keys(PREVIEW_TO_FLOW_MAP)
  const { data: pilotDeliverables } = await admin
    .from("task_deliverables")
    .select("id, field_slug, file_url")
    .eq("task_id", previewAnchorId)
    .in("field_slug", previewSlugs)

  if (!pilotDeliverables || pilotDeliverables.length === 0) {
    log.info("Pre-fill skip: nenhum deliverable de piloto preenchido", { onboardingId })
    return
  }

  // 3) Para cada deliverable de piloto, atualiza o sub_item correspondente
  //    na task da Etapa 05.
  for (const piloto of pilotDeliverables) {
    if (!piloto.file_url) continue
    const mapping = PREVIEW_TO_FLOW_MAP[piloto.field_slug]
    if (!mapping) continue

    // Busca a task do flow correspondente na Etapa 05.
    const { data: flowTasks } = await admin
      .from("tasks")
      .select("id, metadata, slug")
      .eq("onboarding_id", onboardingId)
      .eq("version", onb.current_version)
      .eq("slug", mapping.flowSlug)

    const flowTask = flowTasks?.[0]
    if (!flowTask) {
      log.warn("Pre-fill: flow task nao encontrada", {
        onboardingId,
        flowSlug: mapping.flowSlug,
      })
      continue
    }

    const meta = (flowTask.metadata ?? {}) as TaskMetadata
    const subItems = meta.sub_items ?? []
    const targetIdx = subItems.findIndex((s) => s.slug === mapping.subItemSlug)
    if (targetIdx === -1) continue

    const target = subItems[targetIdx]
    // Idempotencia: nao sobrescrever se ja foi editado manualmente.
    if (target.completed && !target.preview_deliverable_id) continue

    subItems[targetIdx] = {
      ...target,
      completed: true,
      preview_deliverable_id: piloto.id,
      preview_file_url: piloto.file_url,
      completed_at: target.completed_at ?? new Date().toISOString(),
      completed_by: target.completed_by ?? actorId,
    }

    await admin
      .from("tasks")
      .update({ metadata: { ...meta, sub_items: subItems } })
      .eq("id", flowTask.id)
  }
}
