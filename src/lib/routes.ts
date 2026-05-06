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

    CRM: {
      ROOT: "/admin/crm",
      SALES: {
        ROOT: "/admin/crm/sales",
        PIPELINES: "/admin/crm/sales/pipelines",
        PIPELINE_DETAIL: (id: string) => `/admin/crm/sales/pipelines/${id}` as const,
        LEADS: "/admin/crm/sales/leads",
        LEAD_DETAIL: (id: string) => `/admin/crm/sales/leads/${id}` as const,
        DEAL_DETAIL: (id: string) => `/admin/crm/sales/deals/${id}` as const,
        DASHBOARD: "/admin/crm/sales/dashboard",
      },
      CS: {
        ROOT: "/admin/crm/cs",
        PIPELINES: "/admin/crm/cs/pipelines",
        PIPELINE_DETAIL: (id: string) => `/admin/crm/cs/pipelines/${id}` as const,
        DEAL_DETAIL: (id: string) => `/admin/crm/cs/deals/${id}` as const,
        DASHBOARD: "/admin/crm/cs/dashboard",
      },
      INBOX: "/admin/crm/inbox",
      INBOX_THREAD: (id: string) => `/admin/crm/inbox/${id}` as const,
      AUTOMATIONS: {
        LIST: "/admin/crm/automations",
        NEW: "/admin/crm/automations/new",
        DETAIL: (id: string) => `/admin/crm/automations/${id}` as const,
      },
      REPORTS: "/admin/crm/reports",
      PARTNERS: "/admin/crm/partners",
    },

    TEAM: "/admin/team",
    NOTIFICATIONS: "/admin/notifications",
    ONBOARDING: "/admin/onboarding",
    HEALTH: "/admin/health",
    INSIGHTS: "/admin/insights",
    LIST_HYGIENE: "/admin/list-hygiene",
    TOOLS: "/admin/tools",

    SETTINGS: {
      ROOT: "/admin/settings",
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
