import { create } from "zustand"
import { persist } from "zustand/middleware"
import type {
  User,
  Client,
  Integration,
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

// Integrations Store
interface IntegrationStatus {
  connected: boolean
  error?: string
  lastSync?: string
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
