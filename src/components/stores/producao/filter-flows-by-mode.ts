import type { EmailFlow } from "@/types/email-workspace"
import type { WorkspaceMode, AllowedEmailRef } from "./production-workspace-types"

/**
 * Modo "preview" (Produção piloto): mantém todos os flows e todos os emails
 * navegáveis e clicáveis — sem cadeado. A lista de pilotos (`allowedEmails`)
 * não restringe mais a navegação; serve só para o auto-select inicial e para
 * o gate de rollout, ambos fora desta função.
 *
 * Modo "implementation": handoff focado num flow — mantém SÓ os flows que têm
 * emails permitidos, todos navegáveis. Sem allowedEmails, mostra tudo.
 *
 * Qualquer outro modo (incl. "full") retorna intacto.
 */
export function filterFlowsByMode(
  flows: EmailFlow[],
  mode: WorkspaceMode,
  allowedEmails?: AllowedEmailRef[],
): EmailFlow[] {
  if (mode === "implementation") {
    if (!allowedEmails || allowedEmails.length === 0) return flows
    const types = new Set(allowedEmails.map((r) => r.flowType))
    return flows.filter((f) => types.has(f.flow_type))
  }
  return flows
}
