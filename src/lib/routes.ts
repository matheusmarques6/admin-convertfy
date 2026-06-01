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
    },

    AUTOMATIONS: {
      LIST: "/admin/automations",
      NEW: "/admin/automations/new",
      DETAIL: (id: string) => `/admin/automations/${id}` as const,
    },

    BOARD: "/admin/board",

    MEETINGS: {
      LIST: "/admin/meetings",
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
      AUTOMACOES: {
        LIST: "/admin/operacional/automacoes",
        DETAIL: (id: string) => `/admin/operacional/automacoes/${id}` as const,
      },
      CANAIS: "/admin/operacional/canais",
      REPORTS: "/admin/operacional/reports",
      // Workflows Monday-style (Onboarding Ops, Acompanhamento, Feedback,
      // Suporte) — kanbans com automacoes baseadas em triggers/actions.
      WORKFLOWS: {
        ROOT: "/admin/operacional/workflows",
        DETAIL: (slug: string) =>
          `/admin/operacional/workflows/${slug}` as const,
        ONBOARDING: "/admin/operacional/workflows/onboarding",
        ACOMPANHAMENTO: "/admin/operacional/workflows/acompanhamento",
        FEEDBACK: "/admin/operacional/workflows/feedback",
        SUPORTE: "/admin/operacional/workflows/suporte",
      },
      // ── Customer Success (rotinas semanais/mensais do CS) ─────────────
      // URLs canonicas sob /admin/operacional/* — mesmo padrao de tudo
      // mais do workspace operacional. As URLs antigas /admin/<pagina>
      // continuam respondendo via redirect 308 pra nao quebrar bookmarks.
      CS: {
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
    /** Apontamos pro board unificado. /admin/me ainda existe e redireciona. */
    ME: "/admin/productivity/board?view=mine",

    // ── Settings adicionais ──────────────────────────────────────────────
    AI_TEMPLATES: "/admin/settings/ai-templates",

    // ── Weekly reports ───────────────────────────────────────────────────
    WEEKLY_REPORT: (storeId: string) =>
      `/admin/stores/${storeId}/weekly-report` as const,

    // ── Deprecated (alias de compat — usar COMERCIAL/OPERACIONAL) ───────
    /** @deprecated Use ROUTES.ADMIN.COMERCIAL e ROUTES.ADMIN.OPERACIONAL */
    CRM: {
      ROOT: "/admin/comercial",
      SALES: {
        ROOT: "/admin/comercial",
        PIPELINES: "/admin/comercial/pipelines",
        PIPELINE_DETAIL: (id: string) => `/admin/comercial/pipelines/${id}` as const,
        LEADS: "/admin/comercial/leads",
        LEAD_DETAIL: (id: string) => `/admin/comercial/leads/${id}` as const,
        DEAL_DETAIL: (id: string) => `/admin/comercial/deals/${id}` as const,
        DASHBOARD: "/admin/comercial/dashboard",
      },
      CS: {
        ROOT: "/admin/operacional",
        PIPELINES: "/admin/operacional/pipelines",
        PIPELINE_DETAIL: (id: string) => `/admin/operacional/pipelines/${id}` as const,
        DEAL_DETAIL: (id: string) => `/admin/operacional/deals/${id}` as const,
        DASHBOARD: "/admin/operacional/dashboard",
      },
      INBOX: "/admin/inbox",
      INBOX_THREAD: (id: string) => `/admin/inbox/${id}` as const,
      AUTOMATIONS: {
        LIST: "/admin/operacional/automacoes",
        NEW: "/admin/operacional/automacoes/new",
        DETAIL: (id: string) => `/admin/operacional/automacoes/${id}` as const,
      },
      REPORTS: "/admin/operacional/reports",
      PARTNERS: "/admin/operacional/partners",
      CHANNELS: "/admin/operacional/canais",
    },

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
    },

    EMAIL_BLUEPRINTS: "/admin/email-blueprints",

    SETTINGS: {
      ROOT: "/admin/settings",
      BRIEFINGS: "/admin/settings/briefings",
      PROFILE: "/admin/settings/profile",
      COMPANY: "/admin/settings/company",
      APPEARANCE: "/admin/settings/appearance",
      NOTIFICATIONS: "/admin/settings/notifications",
      INTEGRATIONS: "/admin/settings/integrations",
      USERS: "/admin/settings/users",
      PERMISSIONS: "/admin/settings/permissions",
      CUSTOM_FIELDS: "/admin/settings/custom-fields",
      TAGS: "/admin/settings/tags",
      EMAIL_TEMPLATES: "/admin/settings/email-templates",
    },
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

  REPORT: "/report",
} as const

// ── Mapeamento de rotas antigas para novas (redirects) ──────────────────
export const LEGACY_REDIRECTS: Array<{ source: string; destination: string; permanent: boolean }> = [
  // Admin routes
  { source: "/dashboard", destination: ROUTES.ADMIN.DASHBOARD, permanent: true },
  { source: "/dashboard/operational", destination: ROUTES.ADMIN.DASHBOARD_OPERATIONAL, permanent: true },
  { source: "/clients", destination: ROUTES.ADMIN.CLIENTS.LIST, permanent: true },
  { source: "/clients/new", destination: ROUTES.ADMIN.CLIENTS.NEW, permanent: true },
  { source: "/clients/:id", destination: "/admin/clients/:id", permanent: true },
  { source: "/clients/:id/edit", destination: "/admin/clients/:id/edit", permanent: true },
  { source: "/stores", destination: ROUTES.ADMIN.STORES.LIST, permanent: true },
  { source: "/stores/:id", destination: "/admin/stores/:id", permanent: true },
  { source: "/campaigns", destination: ROUTES.ADMIN.CAMPAIGNS.LIST, permanent: true },
  { source: "/automations", destination: ROUTES.ADMIN.AUTOMATIONS.LIST, permanent: true },
  { source: "/automations/new", destination: ROUTES.ADMIN.AUTOMATIONS.NEW, permanent: true },
  { source: "/automations/:id", destination: "/admin/automations/:id", permanent: true },
  { source: "/board", destination: ROUTES.ADMIN.BOARD, permanent: true },
  { source: "/meetings", destination: ROUTES.ADMIN.MEETINGS.LIST, permanent: true },
  { source: "/meetings/new", destination: ROUTES.ADMIN.MEETINGS.NEW, permanent: true },
  { source: "/financial", destination: ROUTES.ADMIN.FINANCIAL, permanent: true },
  { source: "/reports", destination: ROUTES.ADMIN.REPORTS.LIST, permanent: true },
  { source: "/reports/new", destination: ROUTES.ADMIN.REPORTS.NEW, permanent: true },
  { source: "/reports/:id", destination: "/admin/reports/:id", permanent: true },
  { source: "/reports/:id/edit", destination: "/admin/reports/:id/edit", permanent: true },
  { source: "/pipeline", destination: ROUTES.ADMIN.PIPELINE, permanent: true },
  { source: "/team", destination: ROUTES.ADMIN.TEAM, permanent: true },
  { source: "/notifications", destination: ROUTES.ADMIN.NOTIFICATIONS, permanent: true },
  { source: "/onboarding", destination: ROUTES.ADMIN.ONBOARDING, permanent: true },
  { source: "/tools", destination: ROUTES.ADMIN.TOOLS, permanent: true },
  { source: "/settings", destination: ROUTES.ADMIN.SETTINGS.ROOT, permanent: true },
  { source: "/settings/:path*", destination: "/admin/settings/:path*", permanent: true },

  // CRM legado → Comercial / Operacional
  { source: "/admin/crm", destination: "/admin/comercial/pipelines", permanent: true },
  { source: "/admin/crm/sales/pipelines", destination: "/admin/comercial/pipelines", permanent: true },
  { source: "/admin/crm/sales/pipelines/:id", destination: "/admin/comercial/pipelines/:id", permanent: true },
  { source: "/admin/crm/sales/leads", destination: "/admin/comercial/leads", permanent: true },
  { source: "/admin/crm/sales/leads/:id", destination: "/admin/comercial/leads/:id", permanent: true },
  { source: "/admin/crm/sales/deals/:id", destination: "/admin/comercial/deals/:id", permanent: true },
  { source: "/admin/crm/sales/dashboard", destination: "/admin/comercial/dashboard", permanent: true },
  { source: "/admin/crm/cs/pipelines", destination: "/admin/operacional/pipelines", permanent: true },
  { source: "/admin/crm/cs/pipelines/:id", destination: "/admin/operacional/pipelines/:id", permanent: true },
  { source: "/admin/crm/cs/deals/:id", destination: "/admin/operacional/deals/:id", permanent: true },
  { source: "/admin/crm/cs/dashboard", destination: "/admin/operacional/dashboard", permanent: true },
  { source: "/admin/crm/inbox", destination: "/admin/inbox", permanent: true },
  { source: "/admin/crm/inbox/:id", destination: "/admin/inbox/:id", permanent: true },
  { source: "/admin/crm/automations", destination: "/admin/operacional/automacoes", permanent: true },
  { source: "/admin/crm/automations/:id", destination: "/admin/operacional/automacoes/:id", permanent: true },
  { source: "/admin/crm/channels", destination: "/admin/operacional/canais", permanent: true },
  { source: "/admin/crm/reports", destination: "/admin/operacional/reports", permanent: true },

  // Portal → Client routes
  { source: "/portal/login", destination: ROUTES.CLIENT.LOGIN, permanent: true },
  { source: "/portal/dashboard", destination: ROUTES.CLIENT.DASHBOARD, permanent: true },
  { source: "/portal/onboarding", destination: ROUTES.CLIENT.ONBOARDING.ROOT, permanent: true },
  { source: "/portal/onboarding/wizard", destination: ROUTES.CLIENT.ONBOARDING.WIZARD, permanent: true },
  { source: "/portal/stores", destination: ROUTES.CLIENT.STORES.LIST, permanent: true },
  { source: "/portal/stores/new", destination: ROUTES.CLIENT.STORES.NEW, permanent: true },
  { source: "/portal/stores/:id", destination: "/client/stores/:id", permanent: true },
  { source: "/portal/campaigns", destination: ROUTES.CLIENT.CAMPAIGNS, permanent: true },
  { source: "/portal/flows", destination: ROUTES.CLIENT.FLOWS, permanent: true },
  { source: "/portal/tracking", destination: ROUTES.CLIENT.TRACKING.ROOT, permanent: true },
  { source: "/portal/tracking/:path*", destination: "/client/tracking/:path*", permanent: true },
  { source: "/portal/analytics", destination: ROUTES.CLIENT.ANALYTICS, permanent: true },
  { source: "/portal/integrations", destination: ROUTES.CLIENT.INTEGRATIONS, permanent: true },
  { source: "/portal/invoices", destination: ROUTES.CLIENT.INVOICES, permanent: true },
  { source: "/portal/settings", destination: ROUTES.CLIENT.SETTINGS, permanent: true },
  { source: "/portal/change-password", destination: ROUTES.CLIENT.CHANGE_PASSWORD, permanent: true },
]

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
