import type { FlowType } from "@/types/email-workspace"

export type WorkspaceMode = "full" | "preview" | "implementation"

export interface AllowedEmailRef {
  flowType: FlowType
  number: number
}
