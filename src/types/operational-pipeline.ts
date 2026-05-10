/**
 * Operational Pipelines (Monday-style)
 *
 * Pipelines configuraveis (Onboarding Ops, Acompanhamento, Feedback,
 * Suporte) com colunas customizaveis e automacoes baseadas em triggers.
 *
 * `tasks.operational_pipeline_id` + `tasks.operational_column_id`
 * vinculam tasks ao pipeline + coluna atual.
 */

export type OperationalAutomationTrigger =
  | "task_created"
  | "task_moved_to"
  | "task_assigned"
  | "task_overdue"
  | "task_completed"

export type OperationalAutomationAction =
  | "notify_assignee"
  | "notify_channel"
  | "assign_to"
  | "move_to_column"
  | "create_subtask"
  | "update_field"

export interface OperationalColumn {
  id: string // uuid gerado client-side
  name: string
  color: string // hex
  position: number
  wip_limit: number | null
}

export interface OperationalAutomationConfig {
  // Para trigger=task_moved_to: id da coluna alvo
  column_id?: string
  // Para action=notify_assignee/notify_channel: mensagem template
  message?: string
  // Para action=notify_channel: canal alvo
  channel?: "email" | "in_app" | "slack" | "whatsapp"
  // Para action=assign_to: profile_id
  assignee_id?: string
  // Para action=move_to_column: id da coluna destino
  target_column_id?: string
  // Para action=create_subtask
  subtask_title?: string
  subtask_assignee_id?: string
  // Para action=update_field
  field?: string
  value?: unknown
}

export interface OperationalAutomation {
  id: string
  name: string
  trigger: OperationalAutomationTrigger
  action: OperationalAutomationAction
  config: OperationalAutomationConfig
  is_active: boolean
}

export interface OperationalPipeline {
  id: string
  org_id: string
  name: string
  slug: string
  description: string | null
  icon: string
  color: string
  columns: OperationalColumn[]
  automations: OperationalAutomation[]
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

/**
 * Default pipelines aplicados ao primeiro acesso da org. Cada coluna
 * recebe id uuid gerado server-side ao criar.
 */
export const DEFAULT_OPERATIONAL_PIPELINES: Array<{
  name: string
  slug: string
  description: string
  icon: string
  color: string
  columns: Array<{ name: string; color: string }>
}> = [
  {
    name: "Onboarding Ops",
    slug: "onboarding",
    description: "Acompanhe o onboarding tecnico de novos clientes",
    icon: "rocket",
    color: "#7C3AED",
    columns: [
      { name: "Configuração", color: "#94A3B8" },
      { name: "Briefing", color: "#0EA5E9" },
      { name: "Setup Plataforma", color: "#6366F1" },
      { name: "Primeira Campanha", color: "#A855F7" },
      { name: "Go Live", color: "#22C55E" },
      { name: "Feedback 30d", color: "#F59E0B" },
    ],
  },
  {
    name: "Acompanhamento",
    slug: "acompanhamento",
    description: "Tarefas recorrentes de acompanhamento de clientes ativos",
    icon: "users",
    color: "#0EA5E9",
    columns: [
      { name: "Pendente", color: "#94A3B8" },
      { name: "Em Análise", color: "#0EA5E9" },
      { name: "Ação Necessária", color: "#F97316" },
      { name: "Aguardando Cliente", color: "#A855F7" },
      { name: "Concluído", color: "#22C55E" },
    ],
  },
  {
    name: "Feedback",
    slug: "feedback",
    description: "Solicitação e tratamento de feedback de clientes",
    icon: "message-square",
    color: "#F59E0B",
    columns: [
      { name: "Não Solicitado", color: "#94A3B8" },
      { name: "Solicitado", color: "#0EA5E9" },
      { name: "Recebido", color: "#A855F7" },
      { name: "Analisado", color: "#F59E0B" },
      { name: "Ação Tomada", color: "#22C55E" },
    ],
  },
  {
    name: "Suporte",
    slug: "suporte",
    description: "Tickets de suporte e chamados",
    icon: "life-buoy",
    color: "#EF4444",
    columns: [
      { name: "Novo", color: "#0EA5E9" },
      { name: "Em Atendimento", color: "#F97316" },
      { name: "Aguardando Resposta", color: "#A855F7" },
      { name: "Resolvido", color: "#22C55E" },
      { name: "Fechado", color: "#6B7280" },
    ],
  },
]

export const TRIGGER_LABELS: Record<OperationalAutomationTrigger, string> = {
  task_created: "Quando uma task é criada",
  task_moved_to: "Quando uma task é movida para",
  task_assigned: "Quando uma task é atribuída",
  task_overdue: "Quando uma task fica atrasada",
  task_completed: "Quando uma task é concluída",
}

export const ACTION_LABELS: Record<OperationalAutomationAction, string> = {
  notify_assignee: "Notificar o responsável",
  notify_channel: "Notificar um canal",
  assign_to: "Atribuir a alguém",
  move_to_column: "Mover para coluna",
  create_subtask: "Criar uma subtask",
  update_field: "Atualizar um campo",
}
