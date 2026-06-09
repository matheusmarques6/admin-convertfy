import type { EmailFlow, FlowType } from "@/types/email-workspace"
import type { WorkspaceMode, AllowedEmailRef } from "./production-workspace-types"

/**
 * Em modo "preview", mantém todos os flows e todos os emails abertos, mas
 * marca com `preview_locked: true` cada email que não esta na lista de pilotos.
 * UI renderiza emails bloqueados com cadeado individual (sem Desbloquear) e
 * impede a selecao deles. Flows ficam SEMPRE navegaveis em preview — mesmo
 * que nenhum email do flow esteja na lista (todos os subs ficam bloqueados).
 *
 * Em modo "full" — ou preview sem `allowedEmails` — retorna intacto.
 */
export function filterFlowsByMode(
  flows: EmailFlow[],
  mode: WorkspaceMode,
  allowedEmails?: AllowedEmailRef[],
): EmailFlow[] {
  // Modo implementação: handoff focado num flow. Mantém SÓ os flows que têm
  // emails permitidos (o flow da subtask `impl_*`), todos os emails visíveis e
  // navegáveis (sem cadeado — é read-only por natureza). Sem allowedEmails,
  // comporta-se como full (mostra tudo).
  if (mode === "implementation") {
    if (!allowedEmails || allowedEmails.length === 0) return flows
    const types = new Set(allowedEmails.map((r) => r.flowType))
    return flows.filter((f) => types.has(f.flow_type))
  }
  if (mode !== "preview" || !allowedEmails || allowedEmails.length === 0) {
    return flows
  }
  const byFlowType = new Map<FlowType, Set<number>>()
  for (const ref of allowedEmails) {
    const set = byFlowType.get(ref.flowType) ?? new Set<number>()
    set.add(ref.number)
    byFlowType.set(ref.flowType, set)
  }
  return flows.map((f) => {
    const allowed = byFlowType.get(f.flow_type) ?? new Set<number>()
    const emails = (f.emails ?? []).map((e) => ({
      ...e,
      preview_locked: !allowed.has(e.number),
    }))
    return { ...f, emails }
  })
}
