/**
 * Sincroniza mudancas de coluna do onboarding com o deal CRM de origem.
 *
 * Quando onboarding muda de coluna:
 *  1. Cria crm_deal_activities com type='internal_note' descrevendo a transicao
 *  2. Atualiza deals.custom_fields.onboarding_stage = nextCol.name
 *  3. Insere crm_deal_history pra auditoria do campo
 *
 * Tudo fire-and-forget — falha silenciosa.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { OperationalPipelineColumn } from "@/types/onboarding-pipeline"

const log = logger.child("OnboardingDealSync")

interface SyncOpts {
  onboardingId: string
  sourceDealId: string | null
  fromCol: OperationalPipelineColumn
  toCol: OperationalPipelineColumn
  actorId: string | null
}

export async function syncOnboardingStageToDeal(opts: SyncOpts): Promise<void> {
  if (!opts.sourceDealId) return
  try {
    const admin = createAdminClient()

    // 1. Atualiza custom_fields.onboarding_stage
    const { data: deal } = await admin
      .from("deals")
      .select("id, custom_fields")
      .eq("id", opts.sourceDealId)
      .maybeSingle()
    if (!deal) return

    const existingCustom =
      (deal.custom_fields as Record<string, unknown>) ?? {}
    const oldStage = existingCustom["onboarding_stage"] ?? null
    const newCustom = {
      ...existingCustom,
      onboarding_stage: opts.toCol.name,
      onboarding_stage_slug: opts.toCol.slug,
      onboarding_stage_updated_at: new Date().toISOString(),
    }

    await admin
      .from("deals")
      .update({ custom_fields: newCustom })
      .eq("id", opts.sourceDealId)

    // 2. Audit via crm_deal_history
    await admin.from("crm_deal_history").insert({
      deal_id: opts.sourceDealId,
      changed_by: opts.actorId,
      field: "onboarding_stage",
      old_value: oldStage,
      new_value: opts.toCol.name,
      automation_id: null,
    })

    // 3. Activity feed
    await admin.from("crm_deal_activities").insert({
      deal_id: opts.sourceDealId,
      type: "internal_note",
      content: `Onboarding avançou: ${opts.fromCol.name} → ${opts.toCol.name}`,
      created_by: opts.actorId,
      is_internal: true,
      metadata: {
        onboarding_id: opts.onboardingId,
        from_column: opts.fromCol.slug,
        to_column: opts.toCol.slug,
      },
    })
  } catch (e) {
    log.error("syncOnboardingStageToDeal failed", e)
  }
}
