/**
 * Helper unificado pra criar tasks na tabela `tasks`.
 *
 * Padrao pra qualquer modulo do app que precise criar uma task que
 * aparece em /admin/me, /admin/productivity (widget), e nos drill-downs
 * contextuais.
 *
 * Uso:
 *   await createUnifiedTask({
 *     orgId,
 *     title: "Revisar proposta Loja X",
 *     sourceType: "acompanhamento",
 *     sourceId: someAcompanhamentoId,
 *     sourceMetadata: { store_name: "Loja X", client_name: "..." },
 *     assigneeRole: "estrategista",
 *     slaHours: 24,
 *   })
 */

import { createAdminClient } from "@/lib/supabase/server"

export type UnifiedTaskSource =
  | "onboarding"
  | "acompanhamento"
  | "project"
  | "crm"
  | "manual"
  | "campaign_suggestion"

export interface CreateUnifiedTaskInput {
  orgId: string
  title: string
  description?: string | null
  sourceType: UnifiedTaskSource
  sourceId?: string | null
  sourceMetadata?: Record<string, unknown>
  assigneeId?: string | null
  assigneeRole?: string | null
  slaHours?: number
  dueDate?: string | Date | null
  priority?: "low" | "medium" | "high" | "urgent"
  createdBy?: string | null
  metadata?: Record<string, unknown>
}

export async function createUnifiedTask(
  input: CreateUnifiedTaskInput,
): Promise<{ id: string } | null> {
  const admin = createAdminClient()

  // Calcula due_date a partir de slaHours se dueDate nao foi passado
  let due: string | null = null
  if (input.dueDate instanceof Date) {
    due = input.dueDate.toISOString()
  } else if (typeof input.dueDate === "string") {
    due = input.dueDate
  } else if (typeof input.slaHours === "number" && input.slaHours > 0) {
    due = new Date(Date.now() + input.slaHours * 3_600_000).toISOString()
  }

  const { data, error } = await admin
    .from("tasks")
    .insert({
      org_id: input.orgId,
      title: input.title,
      description: input.description ?? null,
      status: "pending",
      priority: input.priority ?? "medium",
      type: input.sourceType === "onboarding" ? "onboarding" : "general",
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      source_metadata: input.sourceMetadata ?? {},
      assignee_id: input.assigneeId ?? null,
      assignee_role: input.assigneeRole ?? null,
      due_date: due,
      sla_hours: input.slaHours ?? null,
      created_by: input.createdBy ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single()

  if (error || !data) return null
  return data
}
