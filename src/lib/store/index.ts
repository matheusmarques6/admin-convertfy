import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { User, Client, Pipeline, Deal, Automation } from "@/types"

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
  pipelines: Pipeline[]
  selectedPipeline: Pipeline | null
  deals: Deal[]
  isLoading: boolean
  setPipelines: (pipelines: Pipeline[]) => void
  setSelectedPipeline: (pipeline: Pipeline | null) => void
  setDeals: (deals: Deal[]) => void
  addDeal: (deal: Deal) => void
  updateDeal: (id: string, updates: Partial<Deal>) => void
  moveDeal: (dealId: string, stageId: string) => void
  removeDeal: (id: string) => void
  setLoading: (loading: boolean) => void
}

export const usePipelineStore = create<PipelineState>((set) => ({
  pipelines: [],
  selectedPipeline: null,
  deals: [],
  isLoading: false,
  setPipelines: (pipelines) => set({ pipelines }),
  setSelectedPipeline: (selectedPipeline) => set({ selectedPipeline }),
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
