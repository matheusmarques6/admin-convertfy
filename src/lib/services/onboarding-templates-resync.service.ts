/**
 * Re-sync rapido dos templates das colunas do pipeline de onboarding.
 *
 * Diferente do resyncAllOnboardingTasks (destrutivo), este servico SO
 * atualiza checklist_template/deliverables_template/automation_rules
 * das colunas existentes — nao mexe em tasks instanciadas.
 *
 * Use quando voce alterou o SEED_COLUMNS e quer que onboardings em
 * progresso vejam o template novo (ex: deliverable com allow_other,
 * options ampliadas, novos auto_complete_on) sem destruir progresso.
 *
 * Idempotente: re-rodar nao causa efeito.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { ensureOnboardingBootstrap } from "./onboarding-bootstrap.service"

const log = logger.child("OnboardingTemplatesResync")

export interface TemplatesResyncStats {
  orgs_scanned: number
  orgs_synced: number
  errors: Array<{ org_id: string; error: string }>
}

export async function resyncAllPipelineTemplates(): Promise<TemplatesResyncStats> {
  const admin = createAdminClient()
  const stats: TemplatesResyncStats = {
    orgs_scanned: 0,
    orgs_synced: 0,
    errors: [],
  }

  // Coleta orgs com onboarding ativo. Re-sync e per-org porque
  // ensureOnboardingBootstrap recebe orgId.
  const { data: orgRows } = await admin
    .from("onboardings")
    .select("org_id")
    .eq("status", "in_progress")
  const orgIds = Array.from(
    new Set((orgRows ?? []).map((r) => r.org_id as string)),
  )

  for (const orgId of orgIds) {
    stats.orgs_scanned++
    try {
      await ensureOnboardingBootstrap(orgId, null)
      stats.orgs_synced++
    } catch (e) {
      stats.errors.push({
        org_id: orgId,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  log.info("Re-sync de templates concluido", stats)
  return stats
}
