import type { EmailFlow, FlowType } from "@/types/email-workspace"
import type { WorkspaceMode, AllowedEmailRef } from "./production-workspace-types"

/**
 * Em modo "preview", mantém todos os flows mas:
 *  - flows com emails-piloto: filtra `emails` para somente os liberados.
 *  - flows sem nenhum email-piloto: zera `emails` e marca `preview_locked: true`
 *    para a UI renderizá-los como bloqueados visuais (sem botão Desbloquear).
 * Em modo "full" — ou preview sem `allowedEmails` — retorna intacto.
 */
export function filterFlowsByMode(
  flows: EmailFlow[],
  mode: WorkspaceMode,
  allowedEmails?: AllowedEmailRef[],
): EmailFlow[] {
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
    const allowed = byFlowType.get(f.flow_type)
    if (!allowed) {
      return { ...f, emails: [], preview_locked: true }
    }
    const filteredEmails = (f.emails ?? []).filter((e) => allowed.has(e.number))
    if (filteredEmails.length === 0) {
      return { ...f, emails: [], preview_locked: true }
    }
    return { ...f, emails: filteredEmails }
  })
}
