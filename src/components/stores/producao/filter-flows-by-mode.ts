import type { EmailFlow, FlowType } from "@/types/email-workspace"
import type { WorkspaceMode, AllowedEmailRef } from "./production-workspace-types"

/**
 * Em modo "preview", restringe `flows` aos flow_types e numbers
 * listados em `allowedEmails`. Em modo "full", retorna intacto.
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
  return flows
    .filter((f) => byFlowType.has(f.flow_type))
    .map((f) => ({
      ...f,
      emails: (f.emails ?? []).filter((e) =>
        byFlowType.get(f.flow_type)!.has(e.number),
      ),
    }))
    .filter((f) => (f.emails ?? []).length > 0)
}
