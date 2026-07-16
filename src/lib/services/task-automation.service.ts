import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { TaskSourceType } from "@/types"

const log = logger.child("TaskAutomation")

interface AutoTaskInput {
  title: string
  description?: string
  type: "onboarding" | "campaign" | "request" | "general" | "meeting" | "deadline"
  priority: "low" | "medium" | "high" | "urgent"
  source_type: TaskSourceType
  source_id: string
  org_id: string
  client_id?: string
  store_id?: string
  due_date?: string
  candidate_assignees: string[] // org_member_ids that might receive this task
}

/**
 * Serviço de automação de tasks do board.
 * Cria tasks automaticamente quando eventos ocorrem no sistema,
 * respeitando a board_config de cada agente.
 */
export class TaskAutomationService {
  /**
   * Cria task automática para todos os assignees elegíveis
   * que tenham a fonte habilitada na board_config.
   */
  static async createAutoTask(input: AutoTaskInput): Promise<string[]> {
    const supabase = createAdminClient()
    const createdTaskIds: string[] = []

    // Map source_type to board_config column
    const configColumn = SOURCE_TO_CONFIG_COLUMN[input.source_type]
    if (!configColumn) {
      log.warn("source_type sem mapeamento de config", { source_type: input.source_type })
      return []
    }

    for (const assigneeId of input.candidate_assignees) {
      try {
        // Check if task already exists for this source + assignee (avoid duplicates)
        const { data: existing } = await supabase
          .from("tasks")
          .select("id")
          .eq("source_type", input.source_type)
          .eq("source_id", input.source_id)
          .eq("assignee_id", assigneeId)
          .limit(1)
          .single()

        if (existing) {
          continue // Skip duplicate
        }

        // Check if assignee has this source enabled in board_config
        const isEnabled = await isSourceEnabledForMember(supabase, assigneeId, configColumn)
        if (!isEnabled) {
          continue // Assignee doesn't want this type of task
        }

        // Get max position for pending tasks
        const { data: maxPos } = await supabase
          .from("tasks")
          .select("position")
          .eq("org_id", input.org_id)
          .eq("status", "pending")
          .order("position", { ascending: false })
          .limit(1)
          .single()

        const position = (maxPos?.position ?? 0) + 1

        // created_by e FK -> profiles. candidate_assignees sao org_member_ids,
        // entao resolvemos o profile do membro (fallback: o id ja e profile).
        const { data: omRow } = await supabase
          .from("org_members")
          .select("profile_id")
          .eq("id", assigneeId)
          .maybeSingle()
        const createdByProfile = (omRow?.profile_id as string | undefined) || assigneeId

        // Create the task
        const { data: task, error } = await supabase
          .from("tasks")
          .insert({
            title: input.title,
            description: input.description,
            type: input.type,
            priority: input.priority,
            status: "pending",
            source_type: input.source_type,
            source_id: input.source_id,
            org_id: input.org_id,
            assignee_id: assigneeId,
            client_id: input.client_id,
            store_id: input.store_id,
            due_date: input.due_date,
            position,
            metadata: {},
            tags: [],
            created_by: createdByProfile,
          })
          .select("id")
          .single()

        if (error) {
          log.error("Erro ao criar auto-task", { error, assigneeId, source_type: input.source_type })
          continue
        }

        if (task) {
          createdTaskIds.push(task.id)
        }
      } catch (err) {
        log.error("Exceção ao criar auto-task", { err, assigneeId })
      }
    }

    if (createdTaskIds.length > 0) {
      log.info("Auto-tasks criadas", {
        count: createdTaskIds.length,
        source_type: input.source_type,
        source_id: input.source_id,
      })
    }

    return createdTaskIds
  }

  /**
   * Trigger: quando um onboarding é criado ou muda para in_progress
   */
  static async onOnboardingStarted(params: {
    onboardingId: string
    storeName: string
    clientId: string
    storeId?: string
    assignedTo: string
    orgId: string
  }): Promise<void> {
    await this.createAutoTask({
      title: `Iniciar onboarding: ${params.storeName}`,
      description: `Novo onboarding criado para a loja ${params.storeName}. Verifique os passos necessários.`,
      type: "onboarding",
      priority: "high",
      source_type: "auto_onboarding",
      source_id: params.onboardingId,
      org_id: params.orgId,
      client_id: params.clientId,
      store_id: params.storeId,
      candidate_assignees: [params.assignedTo],
    })
  }

  /**
   * Trigger: quando uma reunião é criada
   */
  static async onMeetingCreated(params: {
    meetingId: string
    title: string
    scheduledAt: string
    clientId?: string
    participantOrgMemberIds: string[]
    orgId: string
  }): Promise<void> {
    await this.createAutoTask({
      title: `Reunião: ${params.title}`,
      description: `Reunião agendada para ${new Date(params.scheduledAt).toLocaleString("pt-BR")}.`,
      type: "meeting",
      priority: "medium",
      source_type: "auto_meeting",
      source_id: params.meetingId,
      org_id: params.orgId,
      client_id: params.clientId,
      due_date: params.scheduledAt,
      candidate_assignees: params.participantOrgMemberIds,
    })
  }

  /**
   * Trigger: quando uma campanha muda para scheduled
   */
  static async onCampaignScheduled(params: {
    campaignId: string
    campaignName: string
    storeName: string
    scheduledDate: string
    clientId?: string
    storeId?: string
    orgId: string
  }): Promise<void> {
    // Find designers and copywriters in the org
    const supabase = createAdminClient()
    const { data: designersAndCopywriters } = await supabase
      .from("org_members")
      .select("id")
      .eq("org_id", params.orgId)
      .eq("is_active", true)
      .in("role", ["designer", "copywriter", "coordinator", "manager", "owner"])

    const candidates = designersAndCopywriters?.map((m) => m.id) || []

    await this.createAutoTask({
      title: `Campanha: ${params.campaignName} - ${params.storeName}`,
      description: `Campanha agendada para ${params.scheduledDate}. Preparar design e copy.`,
      type: "campaign",
      priority: "high",
      source_type: "auto_campaign",
      source_id: params.campaignId,
      org_id: params.orgId,
      client_id: params.clientId,
      store_id: params.storeId,
      due_date: params.scheduledDate,
      candidate_assignees: candidates,
    })
  }

  /**
   * Trigger: quando um onboarding step transiciona para `pending` (deps satisfeitos).
   * Cria task no board do assignee e atualiza back-reference no step.
   *
   * Retorna o task_id criado, ou null se:
   * - Nenhum assignee encontrado
   * - Task duplicada já existe
   * - Assignee desabilitou onboarding tasks na board_config
   */
  static async onOnboardingStepPending(params: {
    stepId: string
    stepName: string
    stepDescription?: string
    stepPhase?: string
    onboardingId: string
    clientId: string
    clientName: string
    storeId?: string
    storeName?: string
    assignedTo?: string
    defaultAssigneeRole?: string
    onboardingAssignedTo?: string
    orgId: string
    dueDate?: string
  }): Promise<string | null> {
    try {
      const supabase = createAdminClient()

      // 1. Resolve assignee (AC 40.10.1 / 40.10.2 / 40.10.9-10)
      let assigneeId = params.assignedTo

      // 1a. If direct assignee provided, verify they are active
      if (assigneeId) {
        const { data: activeMember } = await supabase
          .from("org_members")
          .select("id")
          .eq("id", assigneeId)
          .eq("is_active", true)
          .maybeSingle()

        if (!activeMember) {
          log.warn("onOnboardingStepPending: assigned member is inactive, skipping", {
            stepId: params.stepId,
            assigneeId,
            orgId: params.orgId,
          })
          assigneeId = undefined
        }
      }

      // 1b. Try resolving by role (filters is_active = true)
      if (!assigneeId && params.defaultAssigneeRole) {
        const { data: members } = await supabase
          .from("org_members")
          .select("id")
          .eq("org_id", params.orgId)
          .eq("role", params.defaultAssigneeRole)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)

        assigneeId = members?.[0]?.id

        // AC 40.10.2: Role exists but no active member — notify managers
        if (!assigneeId) {
          log.warn("onOnboardingStepPending: no active member for role", {
            stepId: params.stepId,
            stepName: params.stepName,
            role: params.defaultAssigneeRole,
            orgId: params.orgId,
          })

          // Find owners/managers to notify
          try {
            const { data: managers } = await supabase
              .from("org_members")
              .select("profile_id")
              .eq("org_id", params.orgId)
              .eq("is_active", true)
              .in("role", ["owner", "manager"])

            const profileIds = (managers ?? [])
              .map((m) => m.profile_id)
              .filter(Boolean) as string[]

            if (profileIds.length > 0) {
              const { notifyNoMemberForRole } = await import("./onboarding-notifications")
              await notifyNoMemberForRole({
                recipientProfileIds: profileIds,
                stepName: params.stepName,
                roleName: params.defaultAssigneeRole,
                storeName: params.storeName || "Onboarding",
                onboardingId: params.onboardingId,
                stepId: params.stepId,
                orgId: params.orgId,
              })
            }
          } catch (notifyErr) {
            log.error("onOnboardingStepPending: failed to notify managers", { error: notifyErr })
          }
        }
      }

      // 1c. AC 40.10.1: Fallback to onboarding general assignee
      if (!assigneeId && params.onboardingAssignedTo) {
        assigneeId = params.onboardingAssignedTo
      }

      if (!assigneeId) {
        log.warn("onOnboardingStepPending: nenhum assignee encontrado", {
          stepId: params.stepId,
          stepName: params.stepName,
          defaultAssigneeRole: params.defaultAssigneeRole,
          orgId: params.orgId,
        })
        return null
      }

      // 2. Build description
      const storeLabel = params.storeName ? ` - ${params.storeName}` : ""
      const description = params.stepDescription
        || `Etapa de onboarding: ${params.stepName}`

      // 3. Create auto-task (createAutoTask handles idempotency + board_config check)
      const createdIds = await this.createAutoTask({
        title: `[Onboarding] ${params.stepName} - ${params.clientName}`,
        description: `${description}\nCliente: ${params.clientName}${storeLabel}`,
        type: "onboarding",
        priority: "medium",
        source_type: "auto_onboarding_step",
        source_id: params.stepId,
        org_id: params.orgId,
        client_id: params.clientId,
        store_id: params.storeId,
        due_date: params.dueDate,
        candidate_assignees: [assigneeId],
      })

      const taskId = createdIds[0] ?? null

      // 4. Update metadata on the created task
      if (taskId) {
        await supabase
          .from("tasks")
          .update({
            metadata: {
              onboarding_id: params.onboardingId,
              step_id: params.stepId,
              step_name: params.stepName,
              client_name: params.clientName,
              store_name: params.storeName ?? null,
              phase: params.stepPhase ?? null,
            },
          })
          .eq("id", taskId)

        // 5. Update back-reference: step.task_id → task
        const { error: backrefError } = await supabase
          .from("client_onboarding_steps")
          .update({ task_id: taskId })
          .eq("id", params.stepId)

        if (backrefError) {
          log.error("Falha ao atualizar task_id no step", {
            stepId: params.stepId,
            taskId,
            error: backrefError,
          })
        }

        log.info("Onboarding step task criada", {
          stepId: params.stepId,
          stepName: params.stepName,
          taskId,
          assigneeId,
        })
      }

      return taskId
    } catch (err) {
      log.error("Exceção em onOnboardingStepPending", {
        stepId: params.stepId,
        err,
      })
      return null
    }
  }

  /**
   * Cron: verificar feedbacks atrasados (lojas sem feedback há mais de X dias)
   */
  static async checkOverdueFeedbacks(orgId: string, thresholdDays = 30): Promise<void> {
    const supabase = createAdminClient()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - thresholdDays)

    const { data: overdueStores } = await supabase
      .from("client_stores")
      .select("id, store_name, client_id, client:clients(owner_id)")
      .lt("last_feedback_date", cutoff.toISOString())
      .not("last_feedback_date", "is", null)

    if (!overdueStores?.length) return

    for (const store of overdueStores) {
      const ownerId = (store.client as unknown as { owner_id: string })?.owner_id
      if (!ownerId) continue

      // Resolve owner's org_member_id
      const { data: ownerMember } = await supabase
        .from("org_members")
        .select("id")
        .eq("profile_id", ownerId)
        .eq("org_id", orgId)
        .eq("is_active", true)
        .single()

      if (!ownerMember) continue

      await this.createAutoTask({
        title: `Feedback atrasado: ${store.store_name}`,
        description: `A loja ${store.store_name} está sem feedback há mais de ${thresholdDays} dias.`,
        type: "deadline",
        priority: "medium",
        source_type: "auto_feedback",
        source_id: store.id,
        org_id: orgId,
        client_id: store.client_id,
        store_id: store.id,
        candidate_assignees: [ownerMember.id],
      })
    }
  }

  /**
   * Cron: verificar contratos expirando nos próximos 30 dias
   */
  static async checkExpiringContracts(orgId: string, daysAhead = 30): Promise<void> {
    const supabase = createAdminClient()
    const now = new Date()
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + daysAhead)

    const { data: expiringContracts } = await supabase
      .from("contracts")
      .select("id, client_id, plan_name, end_date, client:clients(name, owner_id)")
      .eq("status", "active")
      .gte("end_date", now.toISOString())
      .lte("end_date", futureDate.toISOString())

    if (!expiringContracts?.length) return

    for (const contract of expiringContracts) {
      const clientData = contract.client as unknown as { name: string; owner_id: string }
      if (!clientData?.owner_id) continue

      const { data: ownerMember } = await supabase
        .from("org_members")
        .select("id")
        .eq("profile_id", clientData.owner_id)
        .eq("org_id", orgId)
        .eq("is_active", true)
        .single()

      if (!ownerMember) continue

      await this.createAutoTask({
        title: `Renovar contrato: ${clientData.name}`,
        description: `O contrato "${contract.plan_name}" do cliente ${clientData.name} expira em ${contract.end_date}.`,
        type: "deadline",
        priority: "high",
        source_type: "auto_contract",
        source_id: contract.id,
        org_id: orgId,
        client_id: contract.client_id,
        due_date: contract.end_date,
        candidate_assignees: [ownerMember.id],
      })
    }
  }
}

// --- Helpers ---

const SOURCE_TO_CONFIG_COLUMN: Record<TaskSourceType, string | null> = {
  manual: null, // manual tasks always show
  auto_onboarding: "show_onboarding_tasks",
  auto_meeting: "show_meeting_tasks",
  auto_campaign: "show_campaign_tasks",
  auto_feedback: "show_feedback_tasks",
  auto_report: "show_report_tasks",
  auto_contract: "show_contract_tasks",
  auto_onboarding_step: "show_onboarding_tasks",
}

/**
 * Verifica se um membro tem uma fonte de evento habilitada na board_config.
 * Se não existe config, usa defaults da role.
 */
async function isSourceEnabledForMember(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  orgMemberId: string,
  configColumn: string
): Promise<boolean> {
  // Try to get explicit config
  const { data: config } = await supabase
    .from("board_config")
    .select(configColumn)
    .eq("org_member_id", orgMemberId)
    .single()

  if (config) {
    return !!(config as unknown as Record<string, boolean>)[configColumn]
  }

  // No config → use role defaults
  const { data: member } = await supabase
    .from("org_members")
    .select("role")
    .eq("id", orgMemberId)
    .single()

  if (!member) return false

  // Import defaults inline to avoid circular dependency
  const { getDefaultsForRole } = await import("@/lib/services/board-config-defaults")
  const defaults = getDefaultsForRole(member.role)
  return !!(defaults as unknown as Record<string, boolean>)[configColumn]
}
