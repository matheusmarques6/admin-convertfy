/**
 * Cria task de follow-up automatica quando onboarding entra em coluna que
 * depende de RESPOSTA do cliente (ex: "Aprovacao do preview"). Se cliente
 * nao responde no prazo, a task fica ativa pro estrategista cobrar.
 *
 * Mapping coluna -> follow-up:
 *  - "preview_aprovacao":     48h, estrategista, "Cobrar resposta do cliente sobre preview"
 *  - "validacao_emails":      48h, estrategista, "Cobrar resposta do cliente sobre emails finais"
 *  - "implementacao":         72h, ops,           "Cobrar credenciais e DNS do cliente"
 *
 * Falha silenciosa.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { OperationalPipelineColumn } from "@/types/onboarding-pipeline"

const log = logger.child("OnboardingFollowup")

const FOLLOWUP_MAP: Record<
  string,
  { hours: number; role: string; title: string; description: string }
> = {
  preview_aprovacao: {
    hours: 48,
    role: "estrategista",
    title: "Cobrar resposta do cliente sobre preview",
    description:
      "Cliente recebeu o preview há 48h e ainda não respondeu. Mande follow-up no WhatsApp.",
  },
  validacao_emails: {
    hours: 48,
    role: "estrategista",
    title: "Cobrar resposta do cliente sobre emails finais",
    description:
      "Cliente recebeu os emails finais há 48h. Confirme se aprovou.",
  },
  implementacao: {
    hours: 72,
    role: "ops",
    title: "Cobrar credenciais e DNS do cliente",
    description:
      "Cliente ainda não compartilhou acesso/DNS após 72h. Mande follow-up.",
  },
}

export async function scheduleColumnFollowup(opts: {
  onboardingId: string
  orgId: string
  column: OperationalPipelineColumn
  actorId: string | null
}): Promise<void> {
  const cfg = FOLLOWUP_MAP[opts.column.slug]
  if (!cfg) return

  try {
    const admin = createAdminClient()
    const dueDate = new Date(Date.now() + cfg.hours * 60 * 60 * 1000)

    // Evita duplicar: se ja existe followup ativo dessa coluna pra esse onboarding, ignora
    const { data: existing } = await admin
      .from("tasks")
      .select("id")
      .eq("onboarding_id", opts.onboardingId)
      .eq("operational_column_id", opts.column.id)
      .eq("type", "followup")
      .neq("status", "completed")
      .maybeSingle()
    if (existing) return

    await admin.from("tasks").insert({
      org_id: opts.orgId,
      title: cfg.title,
      description: cfg.description,
      status: "pending",
      priority: "medium",
      type: "followup",
      source_type: "onboarding",
      source_id: opts.onboardingId,
      onboarding_id: opts.onboardingId,
      operational_column_id: opts.column.id,
      assignee_role: cfg.role,
      due_date: dueDate.toISOString(),
      sla_hours: cfg.hours,
      created_by: opts.actorId,
      metadata: {
        auto_followup: true,
        followup_for_column: opts.column.slug,
      },
    })
  } catch (e) {
    log.error("scheduleColumnFollowup failed", e)
  }
}
