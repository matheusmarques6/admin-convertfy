/**
 * Fase 4 do pipeline de DESIGN de campanha — dispatcher de gatilho.
 *
 * Ponte entre os endpoints vivos de task (conclusao / preenchimento de
 * deliverable) e o orquestrador de handoff (`attemptCampaignDesignHandoff`).
 *
 * Dada uma task qualquer, resolve se ela pertence ao pipeline de design de
 * campanha (source_type='campaign_suggestion' + source_id). Se sim, delega pro
 * handoff da campanha correspondente; caso contrario (task de onboarding/comum
 * ou inexistente) e um no-op silencioso.
 *
 * Chamado de forma non-blocking (try/catch) ao lado do handoff de onboarding.
 *
 * Referencia: `./campaign-design-handoff.service` -> `attemptCampaignDesignHandoff`
 */

import { createAdminClient } from "@/lib/supabase/server"
import { attemptCampaignDesignHandoff } from "./campaign-design-handoff.service"

export async function attemptCampaignDesignHandoffForTask(params: {
  taskId: string
  actorId: string
}): Promise<string | null> {
  const { taskId, actorId } = params
  const admin = createAdminClient()

  const { data: task } = await admin
    .from("tasks")
    .select("id, org_id, source_type, source_id")
    .eq("id", taskId)
    .maybeSingle()

  if (
    !task ||
    task.source_type !== "campaign_suggestion" ||
    !task.source_id
  ) {
    return null
  }

  return attemptCampaignDesignHandoff({
    suggestionId: task.source_id as string,
    orgId: task.org_id as string,
    actorId,
  })
}
