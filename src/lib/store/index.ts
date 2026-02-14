import { create } from "zustand"
import { persist } from "zustand/middleware"
import type {
  User,
  Client,
  Pipeline,
  PipelineStage,
  Deal,
  DealWithRelations,
  PipelineMember,
  PipelineMemberRole,
  PipelineImportRule,
  Automation,
  Integration,
  IntegrationType,
} from "@/types"

// Auth Store
interface AuthState {
  user: User | null
  isLoading: boolean
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
}))

// UI Store
interface UIState {
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    }),
    {
      name: "convertfy-ui",
    }
  )
)

// Clients Store
interface ClientsState {
  clients: Client[]
  selectedClient: Client | null
  isLoading: boolean
  setClients: (clients: Client[]) => void
  setSelectedClient: (client: Client | null) => void
  addClient: (client: Client) => void
  updateClient: (id: string, updates: Partial<Client>) => void
  removeClient: (id: string) => void
  setLoading: (loading: boolean) => void
}

export const useClientsStore = create<ClientsState>((set) => ({
  clients: [],
  selectedClient: null,
  isLoading: false,
  setClients: (clients) => set({ clients }),
  setSelectedClient: (selectedClient) => set({ selectedClient }),
  addClient: (client) =>
    set((state) => ({ clients: [...state.clients, client] })),
  updateClient: (id, updates) =>
    set((state) => ({
      clients: state.clients.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
  removeClient: (id) =>
    set((state) => ({ clients: state.clients.filter((c) => c.id !== id) })),
  setLoading: (isLoading) => set({ isLoading }),
}))

// Pipeline Store
interface PipelineState {
  // State
  pipelines: Pipeline[]
  selectedPipeline: Pipeline | null
  stages: PipelineStage[]
  deals: DealWithRelations[]
  members: PipelineMember[]
  importRules: PipelineImportRule[]
  currentUserRole: PipelineMemberRole | null
  isLoading: boolean

  // Pipelines
  setPipelines: (pipelines: Pipeline[]) => void
  setSelectedPipeline: (pipeline: Pipeline | null) => void
  setStages: (stages: PipelineStage[]) => void
  addStage: (stage: PipelineStage) => void
  updateStage: (id: string, updates: Partial<PipelineStage>) => void
  removeStage: (id: string) => void
  reorderStages: (stages: PipelineStage[]) => void

  // Deals
  setDeals: (deals: DealWithRelations[]) => void
  addDeal: (deal: DealWithRelations) => void
  updateDeal: (id: string, updates: Partial<Deal>) => void
  moveDeal: (dealId: string, stageId: string) => void
  removeDeal: (id: string) => void

  // Members
  setMembers: (members: PipelineMember[]) => void
  addMember: (member: PipelineMember) => void
  updateMember: (id: string, updates: Partial<PipelineMember>) => void
  removeMember: (id: string) => void
  setCurrentUserRole: (role: PipelineMemberRole | null) => void

  // Import Rules
  setImportRules: (rules: PipelineImportRule[]) => void
  addImportRule: (rule: PipelineImportRule) => void
  updateImportRule: (id: string, updates: Partial<PipelineImportRule>) => void
  removeImportRule: (id: string) => void
  toggleImportRule: (id: string) => void

  setLoading: (loading: boolean) => void
}

export const usePipelineStore = create<PipelineState>((set) => ({
  // State
  pipelines: [],
  selectedPipeline: null,
  stages: [],
  deals: [],
  members: [],
  importRules: [],
  currentUserRole: null,
  isLoading: false,

  // Pipelines
  setPipelines: (pipelines) => set({ pipelines }),
  setSelectedPipeline: (selectedPipeline) => set({ selectedPipeline }),
  setStages: (stages) => set({ stages }),
  addStage: (stage) =>
    set((state) => ({ stages: [...state.stages, stage] })),
  updateStage: (id, updates) =>
    set((state) => ({
      stages: state.stages.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),
  removeStage: (id) =>
    set((state) => ({ stages: state.stages.filter((s) => s.id !== id) })),
  reorderStages: (stages) => set({ stages }),

  // Deals
  setDeals: (deals) => set({ deals }),
  addDeal: (deal) => set((state) => ({ deals: [...state.deals, deal] })),
  updateDeal: (id, updates) =>
    set((state) => ({
      deals: state.deals.map((d) => (d.id === id ? { ...d, ...updates } : d)),
    })),
  moveDeal: (dealId, stageId) =>
    set((state) => ({
      deals: state.deals.map((d) =>
        d.id === dealId ? { ...d, stage_id: stageId } : d
      ),
    })),
  removeDeal: (id) =>
    set((state) => ({ deals: state.deals.filter((d) => d.id !== id) })),

  // Members
  setMembers: (members) => set({ members }),
  addMember: (member) =>
    set((state) => ({ members: [...state.members, member] })),
  updateMember: (id, updates) =>
    set((state) => ({
      members: state.members.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  removeMember: (id) =>
    set((state) => ({ members: state.members.filter((m) => m.id !== id) })),
  setCurrentUserRole: (currentUserRole) => set({ currentUserRole }),

  // Import Rules
  setImportRules: (importRules) => set({ importRules }),
  addImportRule: (rule) =>
    set((state) => ({ importRules: [...state.importRules, rule] })),
  updateImportRule: (id, updates) =>
    set((state) => ({
      importRules: state.importRules.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    })),
  removeImportRule: (id) =>
    set((state) => ({ importRules: state.importRules.filter((r) => r.id !== id) })),
  toggleImportRule: (id) =>
    set((state) => ({
      importRules: state.importRules.map((r) =>
        r.id === id ? { ...r, is_active: !r.is_active } : r
      ),
    })),

  setLoading: (isLoading) => set({ isLoading }),
}))

// Automations Store
interface AutomationsState {
  automations: Automation[]
  selectedAutomation: Automation | null
  isLoading: boolean
  setAutomations: (automations: Automation[]) => void
  setSelectedAutomation: (automation: Automation | null) => void
  addAutomation: (automation: Automation) => void
  updateAutomation: (id: string, updates: Partial<Automation>) => void
  toggleAutomation: (id: string) => void
  removeAutomation: (id: string) => void
  setLoading: (loading: boolean) => void
}

export const useAutomationsStore = create<AutomationsState>((set) => ({
  automations: [],
  selectedAutomation: null,
  isLoading: false,
  setAutomations: (automations) => set({ automations }),
  setSelectedAutomation: (selectedAutomation) => set({ selectedAutomation }),
  addAutomation: (automation) =>
    set((state) => ({ automations: [...state.automations, automation] })),
  updateAutomation: (id, updates) =>
    set((state) => ({
      automations: state.automations.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    })),
  toggleAutomation: (id) =>
    set((state) => ({
      automations: state.automations.map((a) =>
        a.id === id ? { ...a, is_active: !a.is_active } : a
      ),
    })),
  removeAutomation: (id) =>
    set((state) => ({
      automations: state.automations.filter((a) => a.id !== id),
    })),
  setLoading: (isLoading) => set({ isLoading }),
}))

// Dashboard Widgets Store
interface DashboardWidget {
  id: string
  type: string
  title: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  config?: Record<string, unknown>
}

interface DashboardState {
  widgets: DashboardWidget[]
  setWidgets: (widgets: DashboardWidget[]) => void
  addWidget: (widget: DashboardWidget) => void
  updateWidget: (id: string, updates: Partial<DashboardWidget>) => void
  removeWidget: (id: string) => void
  reorderWidgets: (widgets: DashboardWidget[]) => void
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      widgets: [],
      setWidgets: (widgets) => set({ widgets }),
      addWidget: (widget) =>
        set((state) => ({ widgets: [...state.widgets, widget] })),
      updateWidget: (id, updates) =>
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, ...updates } : w
          ),
        })),
      removeWidget: (id) =>
        set((state) => ({ widgets: state.widgets.filter((w) => w.id !== id) })),
      reorderWidgets: (widgets) => set({ widgets }),
    }),
    {
      name: "convertfy-dashboard",
    }
  )
)

// Integrations Store
interface IntegrationStatus {
  type: IntegrationType
  connected: boolean
  lastSync?: string
  error?: string
  data?: Record<string, unknown>
}

interface IntegrationsState {
  integrations: Integration[]
  statuses: Record<IntegrationType, IntegrationStatus>
  isLoading: boolean
  isTesting: IntegrationType | null
  setIntegrations: (integrations: Integration[]) => void
  addIntegration: (integration: Integration) => void
  updateIntegration: (id: string, updates: Partial<Integration>) => void
  removeIntegration: (id: string) => void
  setStatus: (type: IntegrationType, status: Partial<IntegrationStatus>) => void
  setLoading: (loading: boolean) => void
  setTesting: (type: IntegrationType | null) => void
  getIntegrationByType: (type: IntegrationType) => Integration | undefined
  isConnected: (type: IntegrationType) => boolean
}

const initialStatuses: Record<IntegrationType, IntegrationStatus> = {
  asaas: { type: "asaas", connected: false },
  meta_ads: { type: "meta_ads", connected: false },
  google_ads: { type: "google_ads", connected: false },
  klaviyo: { type: "klaviyo", connected: false },
  shopify: { type: "shopify", connected: false },
  instagram: { type: "instagram", connected: false },
  whatsapp: { type: "whatsapp", connected: false },
  google_calendar: { type: "google_calendar", connected: false },
  wise: { type: "wise", connected: false },
}

export const useIntegrationsStore = create<IntegrationsState>((set, get) => ({
  integrations: [],
  statuses: initialStatuses,
  isLoading: false,
  isTesting: null,
  setIntegrations: (integrations) => {
    const newStatuses = { ...initialStatuses }
    integrations.forEach((integration) => {
      newStatuses[integration.type] = {
        type: integration.type,
        connected: integration.is_active,
        lastSync: integration.last_sync,
      }
    })
    set({ integrations, statuses: newStatuses })
  },
  addIntegration: (integration) =>
    set((state) => ({
      integrations: [...state.integrations, integration],
      statuses: {
        ...state.statuses,
        [integration.type]: {
          type: integration.type,
          connected: integration.is_active,
          lastSync: integration.last_sync,
        },
      },
    })),
  updateIntegration: (id, updates) =>
    set((state) => {
      const updatedIntegrations = state.integrations.map((i) =>
        i.id === id ? { ...i, ...updates } : i
      )
      const integration = updatedIntegrations.find((i) => i.id === id)
      const newStatuses = { ...state.statuses }
      if (integration) {
        newStatuses[integration.type] = {
          type: integration.type,
          connected: integration.is_active,
          lastSync: integration.last_sync,
        }
      }
      return { integrations: updatedIntegrations, statuses: newStatuses }
    }),
  removeIntegration: (id) =>
    set((state) => {
      const integration = state.integrations.find((i) => i.id === id)
      const filteredIntegrations = state.integrations.filter((i) => i.id !== id)
      const newStatuses = { ...state.statuses }
      if (integration) {
        newStatuses[integration.type] = {
          type: integration.type,
          connected: false,
        }
      }
      return { integrations: filteredIntegrations, statuses: newStatuses }
    }),
  setStatus: (type, status) =>
    set((state) => ({
      statuses: {
        ...state.statuses,
        [type]: { ...state.statuses[type], ...status },
      },
    })),
  setLoading: (isLoading) => set({ isLoading }),
  setTesting: (isTesting) => set({ isTesting }),
  getIntegrationByType: (type) => get().integrations.find((i) => i.type === type),
  isConnected: (type) => get().statuses[type]?.connected ?? false,
}))
