/**
 * Fase 8 do pipeline de DESIGN de campanha — rota de decisao do COO.
 *
 * Ponto de entrada autorizado para a decisao explicita na etapa `aprovacao`:
 *   - "approve"         -> approveCampaignDesign        (aprovacao -> producao)
 *   - "request_changes" -> requestCampaignDesignChanges (version++, volta estrutura)
 *
 * Autorizacao: so quem PODE acessar a etapa `aprovacao` decide. O conjunto de
 * bypass (admin/dev/coo) ja esta embutido em `canAccessCampaignStage`. Designer
 * e suporte caem em 403 e nada e avancado.
 *
 * Referencias:
 *   - `./campaign-design-handoff.service` -> approve/requestChanges (CAS)
 *   - `@/lib/permissions/campaign-stage-access` -> canAccessCampaignStage
 *   - `@/lib/api/onboarding-permissions` -> getUserOrgRole
 */

import { AppError } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { canAccessCampaignStage } from "@/lib/permissions/campaign-stage-access"
import {
  approveCampaignDesign,
  requestCampaignDesignChanges,
} from "./campaign-design-handoff.service"

export type CampaignDesignDecision = "approve" | "request_changes"

export async function decideCampaignDesign(params: {
  suggestionId: string
  orgId: string
  userId: string
  decision: CampaignDesignDecision
}): Promise<string> {
  const { suggestionId, orgId, userId, decision } = params

  const member = await getUserOrgRole(userId)
  if (!member) {
    throw new AppError("Sem org membership", 403)
  }

  // So quem acessa a etapa `aprovacao` (coo/admin/dev = bypass) pode decidir.
  if (!canAccessCampaignStage(member.roles, "aprovacao")) {
    throw new AppError("Sem permissao para decidir nesta etapa", 403)
  }

  if (decision === "approve") {
    return approveCampaignDesign({ suggestionId, orgId, actorId: userId })
  }
  if (decision === "request_changes") {
    return requestCampaignDesignChanges({ suggestionId, orgId, actorId: userId })
  }

  throw new AppError("Decisao invalida", 400)
}
