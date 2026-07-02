import type { createAdminClient } from "@/lib/supabase/server"

/**
 * Gate de ENTREGÁVEL OBRIGATÓRIO por-task: uma task não pode ser concluída
 * enquanto algum entregável `required` (linha em `task_deliverables`) estiver
 * VAZIO. "Preenchido" = tem `value` OU `file_url` OU `filled_at` (mesmo predicado
 * do handoff por-etapa `deliverableHasValue`).
 *
 * Retorna a string de motivo pro caller responder 409 (mesmo contrato do
 * `guardEmailProductionCompletion`), ou `null` quando está OK concluir.
 *
 * Deliverables só existem na task-ÂNCORA da etapa, então tasks sem entregável
 * (ex.: as 3 de `producao`) passam livres; só a task do Figma (`estrutura`)
 * fica bloqueada sem o link. Chamado em TODOS os caminhos que escrevem
 * `tasks.status='completed'` (PUT /api/tasks/[id] e completeTaskWithHandoff).
 */
export async function guardRequiredDeliverables(
  admin: ReturnType<typeof createAdminClient>,
  taskId: string,
): Promise<string | null> {
  const { data: rows } = await admin
    .from("task_deliverables")
    .select("field_label, value, file_url, filled_at")
    .eq("task_id", taskId)
    .eq("required", true)

  const missing = (
    (rows ?? []) as Array<{
      field_label: string | null
      value: string | null
      file_url: string | null
      filled_at: string | null
    }>
  ).filter((d) => !(d.value || d.file_url || d.filled_at))

  if (missing.length === 0) return null

  const labels = missing
    .map((d) => d.field_label)
    .filter((l): l is string => !!l)
    .join(", ")
  return `Anexe antes de concluir: ${labels || "entregável obrigatório"}`
}
