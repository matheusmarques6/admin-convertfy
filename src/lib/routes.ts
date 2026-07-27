// ============================================================================
// Arquivo centralizado de rotas — Convertfy Admin
// Todas as rotas do sistema devem ser referenciadas a partir deste arquivo.
// Nenhum path deve ser hardcoded em componentes.
// ============================================================================

export const ROUTES = {
  // ── Públicas ──────────────────────────────────────────────────────────
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  CHANGE_PASSWORD: "/change-password",

  // ── Admin ─────────────────────────────────────────────────────────────
  ADMIN: {
    ROOT: "/admin",
    DASHBOARD: "/admin/dashboard",
    DASHBOARD_OPERATIONAL: "/admin/dashboard/operational",

    CLIENTS: {
      LIST: "/admin/clients",
      NEW: "/admin/clients/new",
      DETAIL: (id: string) => `/admin/clients/${id}` as const,
      EDIT: (id: string) => `/admin/clients/${id}/edit` as const,
    },

    STORES: {
      LIST: "/admin/stores",
      DETAIL: (id: string) => `/admin/stores/${id}` as const,
    },

    CAMPAIGNS: {
      LIST: "/admin/campaigns",
      PIPELINE: "/admin/campaigns/pipeline",
      CENTRAL: "/admin/campaigns/central",
    },

    AUTOMATIONS: {
      LIST: "/admin/automations",
      NEW: "/admin/automations/new",
      DETAIL: (id: string) => `/admin/automations/${id}` as const,
    },

    BOARD: "/admin/board",

    MEETINGS: {
      LIST: "/admin/meetings",
      MINE: "/admin/meetings?scope=mine",
      NEW: "/admin/meetings/new",
      CALENDAR: "/admin/meetings?view=calendar",
    },

    FINANCIAL: "/admin/financial",

    REPORTS: {
      LIST: "/admin/reports",
      NEW: "/admin/reports/new",
      DETAIL: (id: string) => `/admin/reports/${id}` as const,
      EDIT: (id: string) => `/admin/reports/${id}/edit` as const,
    },

    REPORT_JOBS: {
      LIST: "/admin/report-jobs",
      DETAIL: (id: string) => `/admin/report-jobs/${id}` as const,
    },

    PRODUCTIVITY: {
      HOME: "/admin/productivity",
      BOARD: "/admin/productivity/board",
      CALENDAR: "/admin/productivity/calendar",
      GOALS: "/admin/productivity/goals",
      HABITS: "/admin/productivity/habits",
      FOCUS: "/admin/productivity/focus",
    },

    PIPELINE: "/admin/pipeline",

    // ── COMERCIAL (aquisicao / sales) ───────────────────────────────────
    COMERCIAL: {
      ROOT: "/admin/comercial",
      DASHBOARD: "/admin/comercial/dashboard",
      PIPELINES: "/admin/comercial/pipelines",
      PIPELINE_DETAIL: (id: string) => `/admin/comercial/pipelines/${id}` as const,
      LEADS: "/admin/comercial/leads",
      LEAD_DETAIL: (id: string) => `/admin/comercial/leads/${id}` as const,
      DEAL_DETAIL: (id: string) => `/admin/comercial/deals/${id}` as const,
      FORMS: "/admin/comercial/forms",
      FORM_DETAIL: (id: string) => `/admin/comercial/forms/${id}` as const,
      AUTOMACOES: {
        LIST: "/admin/comercial/automacoes",
        DETAIL: (id: string) => `/admin/comercial/automacoes/${id}` as const,
      },
      CANAIS: "/admin/comercial/canais",
      REPORTS: "/admin/comercial/reports",
    },

    // ── OPERACIONAL (pos-venda / cs / ops) ──────────────────────────────
    OPERACIONAL: {
      ROOT: "/admin/operacional",
      DASHBOARD: "/admin/operacional/dashboard",
      PIPELINES: "/admin/operacional/pipelines",
      PIPELINES_ADMIN: "/admin/operacional/pipelines/admin",
      PIPELINE_DETAIL: (id: string) => `/admin/operacional/pipelines/${id}` as const,
      DEAL_DETAIL: (id: string) => `/admin/operacional/deals/${id}` as const,
      DEAL_DETAIL_FULL: (id: string) =>
        `/admin/operacional/deals/${id}/detail` as const,
      FORMS: "/admin/operacional/forms",
      FORM_DETAIL: (id: string) => `/admin/operacional/forms/${id}` as const,
      REPORTS: "/admin/operacional/reports",
      // ── Customer Success (rotinas semanais/mensais do CS) ─────────────
      // URLs canonicas sob /admin/operacional/* — mesmo padrao de tudo
      // mais do workspace operacional. As URLs antigas /admin/<pagina>
      // continuam respondendo via redirect 308 pra nao quebrar bookmarks.
      CS: {
        // Modulo Customer Success com shell de abas (Painel · Pipelines ·
        // Formularios · Cadencias) — porta do prototipo Figma Make.
        PAINEL: "/admin/operacional/cs",
        CRM: "/admin/operacional/cs-crm",
        CALLS: "/admin/operacional/cs-crm/calls",
        CADENCES: "/admin/operacional/cs-crm/cadences",
        ACOMPANHAMENTO: "/admin/operacional/acompanhamento",
        RITUAL: "/admin/operacional/ritual",
      },
    },

    // ── Compartilhado (comercial e operacional acessam) ─────────────────
    INBOX: "/admin/inbox",
    INBOX_THREAD: (id: string) => `/admin/inbox/${id}` as const,

    // ── Onboarding (pipeline operacional v2 — PRD) ──────────────────────
    ONBOARDING_V2: {
      LIST: "/admin/onboarding",
      DETAIL: (id: string) => `/admin/onboarding/${id}` as const,
      NEW: "/admin/onboarding/new",
    },
    ONBOARDING_HELP: {
      LIST: "/admin/onboarding-help",
      EDIT: "/admin/onboarding-help/edit",
      EDIT_PAGE: (id: string) => `/admin/onboarding-help/${id}/edit` as const,
    },
    // ── Settings adicionais ──────────────────────────────────────────────
    AI_TEMPLATES: "/admin/settings/ai-templates",

    // ── Weekly reports ───────────────────────────────────────────────────
    WEEKLY_REPORT: (storeId: string) =>
      `/admin/stores/${storeId}/weekly-report` as const,

    TEAM: "/admin/team",
    NOTIFICATIONS: "/admin/notifications",
    ONBOARDING: "/admin/onboarding",
    HEALTH: "/admin/health",
    INSIGHTS: "/admin/insights",
    LIST_HYGIENE: "/admin/list-hygiene",
    TOOLS: "/admin/tools",
    TOOLS_CURRENCY_AUDIT: "/admin/tools/currency-audit",

    AGENTS: {
      PROMPTS: "/admin/agents/prompts",
      RUNS: "/admin/agents/runs",
    },

    SETTINGS: {
      ROOT: "/admin/settings",
      BRIEFINGS: "/admin/settings/briefings",
      PROFILE: "/admin/settings/profile",
      COMPANY: "/admin/settings/company",
      APPEARANCE: "/admin/settings/appearance",
      NOTIFICATIONS: "/admin/settings/notifications",
      INTEGRATIONS: "/admin/settings/integrations",
      PERMISSIONS: "/admin/settings/permissions",
      CUSTOM_FIELDS: "/admin/settings/custom-fields",
      TAGS: "/admin/settings/tags",
      EMAIL_TEMPLATES: "/admin/settings/email-templates",
      EMAIL_GENERATION: "/admin/settings/email-generation",
      EMAIL_GENERATION_LOGS: "/admin/settings/email-generation-logs",
      CAMPAIGN_CENTRAL: "/admin/settings/campaign-central",
    },
    AI_USAGE: "/admin/ai-usage",
  },

  // ── Cliente (Portal) ─────────────────────────────────────────────────
  CLIENT: {
    ROOT: "/client",
    LOGIN: "/client/login",
    CHANGE_PASSWORD: "/client/change-password",
    DASHBOARD: "/client/dashboard",

    ONBOARDING: {
      ROOT: "/client/onboarding",
      WIZARD: "/client/onboarding/wizard",
    },

    STORES: {
      LIST: "/client/stores",
      NEW: "/client/stores/new",
      DETAIL: (id: string) => `/client/stores/${id}` as const,
    },

    CAMPAIGNS: "/client/campaigns",
    FLOWS: "/client/flows",
    ANALYTICS: "/client/analytics",
    INTEGRATIONS: "/client/integrations",

    TRACKING: {
      ROOT: "/client/tracking",
      PAGE: "/client/tracking/page",
    },

    INVOICES: "/client/invoices",
    SETTINGS: "/client/settings",
  },

  // ── Públicas especiais ────────────────────────────────────────────────
  PUBLIC: {
    ONBOARDING: "/public/onboarding",
  },

  TRACK: {
    ROOT: "/track",
    CODE: (code: string) => `/track/${code}` as const,
  },

  TRACKING: {
    EMBED: "/tracking/embed",
  },
} as const

// ── Rotas protegidas (para middleware) ──────────────────────────────────
export const ADMIN_PROTECTED_PATHS = [
  "/admin",
]

export const CLIENT_PROTECTED_PATHS = [
  "/client",
]

export const AUTH_PATHS = ["/login", "/register"]

// ── Helpers ─────────────────────────────────────────────────────────────

/** Check if a path is an admin route */
export function isAdminRoute(pathname: string): boolean {
  return pathname.startsWith("/admin")
}

/** Check if a path is a client route */
export function isClientRoute(pathname: string): boolean {
  return pathname.startsWith("/client")
}

/** Check if a path is a public route */
export function isPublicRoute(pathname: string): boolean {
  return pathname.startsWith("/public")
}
