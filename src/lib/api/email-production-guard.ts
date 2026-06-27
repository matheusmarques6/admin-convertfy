import {
  resolveTaskWorkspaceTarget,
  resolveTaskWorkspaceTargetByTitle,
} from "@/lib/email-task-sync/slug-mapping"
import type { createAdminClient } from "@/lib/supabase/server"

/**
 * Invariante de integridade board↔workspace: completar manualmente uma task de
 * producao de email sem que o(s) email(s) correspondente(s) estejam
 * aprovados/live quebra a sincronia. Retorna uma string de motivo de bloqueio
 * (o caller deve responder 409) ou `null` quando esta OK completar.
 *
 * Extraido da rota PUT /api/tasks/[id] para ser testavel isoladamente — esta
 * regra ja foi acidentalmente removida uma vez numa reescrita; o teste em
 * `email-production-guard.test.ts` agora a protege.
 */
export async function guardEmailProductionCompletion(
  admin: ReturnType<typeof createAdminClient>,
  taskId: string,
): Promise<string | null> {
  const { data: task } = await admin
    .from("tasks")
    .select("slug, title, store_id, onboarding_id")
    .eq("id", taskId)
    .maybeSingle()
  if (!task) return null
  const target =
    resolveTaskWorkspaceTarget(task.slug as string | null) ??
    resolveTaskWorkspaceTargetByTitle(task.title as string | null)
  if (
    !target ||
    target.kind === "checkbox-only" ||
    target.kind === "implementation-overview"
  ) {
    return null
  }

  // Resolve storeId
  let storeId = (task.store_id as string | null) ?? null
  if (!storeId && task.onboarding_id) {
    const { data: onb } = await admin
      .from("onboardings")
      .select("store_id")
      .eq("id", task.onboarding_id)
      .maybeSingle()
    storeId = (onb?.store_id ?? null) as string | null
  }
  if (!storeId) return null

  const { data: flow } = await admin
    .from("email_flows")
    .select("id")
    .eq("store_id", storeId)
    .eq("flow_type", target.flowType)
    .maybeSingle()
  if (!flow) return "email_flow_missing"

  if (target.kind === "email") {
    const { data: email } = await admin
      .from("email_flow_emails")
      .select("status")
      .eq("flow_id", flow.id)
      .eq("number", target.emailNumber)
      .maybeSingle()
    if (!email) return "email_missing"
    if (email.status !== "approved" && email.status !== "live") {
      return "email_not_approved"
    }
    return null
  }

  // email-list: todos numbers listados precisam estar approved/live
  const numbers = target.subItems.map((s) => s.emailNumber)
  const { data: emails } = await admin
    .from("email_flow_emails")
    .select("number, status")
    .eq("flow_id", flow.id)
    .in("number", numbers)
  const found = (emails ?? []) as Array<{ number: number; status: string }>
  if (found.length !== numbers.length) return "some_emails_missing"
  const allApproved = found.every(
    (e) => e.status === "approved" || e.status === "live",
  )
  return allApproved ? null : "emails_not_all_approved"
}
