import { create } from "zustand"
import { persist } from "zustand/middleware"
import type {
  User,
  Integration,
  Pipeline,
  PipelineStage,
  DealWithRelations,
  PipelineMember,
  PipelineImportRule,
  PipelineMemberRole,
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
      skipHydration: true,
    }
  )
)

// Integrations Store
interface IntegrationStatus {
  connected: boolean
  error?: string
  lastSync?: string
  details?: Record<string, unknown>
}

interface IntegrationsState {
  integrations: Integration[]
  statuses: Record<string, IntegrationStatus>
  isLoading: boolean
  isTesting: string | null
  setIntegrations: (integrations: Integration[]) => void
  addIntegration: (integration: Integration) => void
  updateIntegration: (id: string, updates: Partial<Integration>) => void
  removeIntegration: (id: string) => void
  setStatus: (type: string, status: IntegrationStatus) => void
  setLoading: (loading: boolean) => void
  setTesting: (type: string | null) => void
}

// Pipeline Store
interface PipelineState {
  pipelines: Pipeline[]
  selectedPipeline: Pipeline | null
  stages: PipelineStage[]
  deals: DealWithRelations[]
  members: PipelineMember[]
  importRules: PipelineImportRule[]
  currentUserRole: PipelineMemberRole | null
  setPipelines: (pipelines: Pipeline[]) => void
  setSelectedPipeline: (pipeline: Pipeline | null) => void
  setStages: (stages: PipelineStage[]) => void
  setDeals: (deals: DealWithRelations[]) => void
  setMembers: (members: PipelineMember[]) => void
  setImportRules: (rules: PipelineImportRule[]) => void
  setCurrentUserRole: (role: PipelineMemberRole | null) => void
}

export const usePipelineStore = create<PipelineState>()((set) => ({
  pipelines: [],
  selectedPipeline: null,
  stages: [],
  deals: [],
  members: [],
  importRules: [],
  currentUserRole: null,
  setPipelines: (pipelines) => set({ pipelines }),
  setSelectedPipeline: (selectedPipeline) => set({ selectedPipeline }),
  setStages: (stages) => set({ stages }),
  setDeals: (deals) => set({ deals }),
  setMembers: (members) => set({ members }),
  setImportRules: (importRules) => set({ importRules }),
  setCurrentUserRole: (currentUserRole) => set({ currentUserRole }),
}))

// Integrations Store
export const useIntegrationsStore = create<IntegrationsState>((set) => ({
  integrations: [],
  statuses: {},
  isLoading: false,
  isTesting: null,
  setIntegrations: (integrations) => set({ integrations }),
  addIntegration: (integration) =>
    set((state) => ({ integrations: [...state.integrations, integration] })),
  updateIntegration: (id, updates) =>
    set((state) => ({
      integrations: state.integrations.map((i) =>
        i.id === id ? { ...i, ...updates } : i
      ),
    })),
  removeIntegration: (id) =>
    set((state) => ({ integrations: state.integrations.filter((i) => i.id !== id) })),
  setStatus: (type, status) =>
    set((state) => ({ statuses: { ...state.statuses, [type]: status } })),
  setLoading: (isLoading) => set({ isLoading }),
  setTesting: (isTesting) => set({ isTesting }),
}))
