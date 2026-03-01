import type { OrgRole } from "@/types/organization"

export interface BoardConfigDefaults {
  show_onboarding_tasks: boolean
  show_meeting_tasks: boolean
  show_campaign_tasks: boolean
  show_feedback_tasks: boolean
  show_report_tasks: boolean
  show_contract_tasks: boolean
  show_manual_tasks: boolean
  calendar_view_mode: "daily" | "weekly" | "monthly"
  show_personal_events: boolean
}

/**
 * Defaults de board_config por role do agente.
 * Quando um membro não tem config salva, esses defaults são usados
 * como sugestão pré-preenchida baseada na sua função.
 */
export const BOARD_CONFIG_DEFAULTS: Record<OrgRole, BoardConfigDefaults> = {
  owner: {
    show_onboarding_tasks: true,
    show_meeting_tasks: true,
    show_campaign_tasks: true,
    show_feedback_tasks: true,
    show_report_tasks: true,
    show_contract_tasks: true,
    show_manual_tasks: true,
    calendar_view_mode: "monthly",
    show_personal_events: true,
  },
  manager: {
    show_onboarding_tasks: true,
    show_meeting_tasks: true,
    show_campaign_tasks: true,
    show_feedback_tasks: true,
    show_report_tasks: true,
    show_contract_tasks: true,
    show_manual_tasks: true,
    calendar_view_mode: "monthly",
    show_personal_events: true,
  },
  coo: {
    show_onboarding_tasks: true,
    show_meeting_tasks: true,
    show_campaign_tasks: true,
    show_feedback_tasks: true,
    show_report_tasks: true,
    show_contract_tasks: true,
    show_manual_tasks: true,
    calendar_view_mode: "monthly",
    show_personal_events: true,
  },
  coordinator: {
    show_onboarding_tasks: true,
    show_meeting_tasks: true,
    show_campaign_tasks: false,
    show_feedback_tasks: true,
    show_report_tasks: true,
    show_contract_tasks: true,
    show_manual_tasks: true,
    calendar_view_mode: "monthly",
    show_personal_events: true,
  },
  copywriter: {
    show_onboarding_tasks: false,
    show_meeting_tasks: false,
    show_campaign_tasks: true,
    show_feedback_tasks: false,
    show_report_tasks: false,
    show_contract_tasks: false,
    show_manual_tasks: true,
    calendar_view_mode: "weekly",
    show_personal_events: true,
  },
  designer: {
    show_onboarding_tasks: true,
    show_meeting_tasks: true,
    show_campaign_tasks: true,
    show_feedback_tasks: false,
    show_report_tasks: false,
    show_contract_tasks: false,
    show_manual_tasks: true,
    calendar_view_mode: "weekly",
    show_personal_events: true,
  },
  developer: {
    show_onboarding_tasks: true,
    show_meeting_tasks: true,
    show_campaign_tasks: true,
    show_feedback_tasks: false,
    show_report_tasks: false,
    show_contract_tasks: false,
    show_manual_tasks: true,
    calendar_view_mode: "weekly",
    show_personal_events: true,
  },
  support: {
    show_onboarding_tasks: true,
    show_meeting_tasks: true,
    show_campaign_tasks: false,
    show_feedback_tasks: true,
    show_report_tasks: true,
    show_contract_tasks: true,
    show_manual_tasks: true,
    calendar_view_mode: "monthly",
    show_personal_events: true,
  },
  analyst: {
    show_onboarding_tasks: false,
    show_meeting_tasks: true,
    show_campaign_tasks: false,
    show_feedback_tasks: false,
    show_report_tasks: true,
    show_contract_tasks: false,
    show_manual_tasks: true,
    calendar_view_mode: "monthly",
    show_personal_events: true,
  },
}

export function getDefaultsForRole(role: OrgRole): BoardConfigDefaults {
  return BOARD_CONFIG_DEFAULTS[role] ?? BOARD_CONFIG_DEFAULTS.support
}

/**
 * Labels e descrições de cada fonte de evento para a UI.
 */
export const BOARD_SOURCE_OPTIONS = [
  {
    key: "show_onboarding_tasks" as const,
    label: "Onboarding",
    description: "Receber tasks quando novos onboardings são criados ou atualizados",
    icon: "Rocket",
  },
  {
    key: "show_meeting_tasks" as const,
    label: "Reuniões",
    description: "Receber tasks quando reuniões são agendadas para você",
    icon: "Video",
  },
  {
    key: "show_campaign_tasks" as const,
    label: "Campanhas",
    description: "Receber tasks de campanhas agendadas e copies para produção",
    icon: "Mail",
  },
  {
    key: "show_feedback_tasks" as const,
    label: "Feedback de Lojas",
    description: "Receber alertas quando lojas estão com feedback atrasado",
    icon: "MessageSquare",
  },
  {
    key: "show_report_tasks" as const,
    label: "Relatórios",
    description: "Receber tasks quando relatórios precisam ser gerados",
    icon: "FileText",
  },
  {
    key: "show_contract_tasks" as const,
    label: "Contratos",
    description: "Receber alertas quando contratos estão próximos do vencimento",
    icon: "FileSignature",
  },
] as const

export type BoardSourceKey = (typeof BOARD_SOURCE_OPTIONS)[number]["key"]
