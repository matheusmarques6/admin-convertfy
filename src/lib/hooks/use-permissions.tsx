"use client"

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react"

export interface StoreAccess {
  store_id: string
  store_name: string
  client_id: string
  client_name: string
  can_view: boolean
  can_edit: boolean
  can_manage_onboarding: boolean
  can_manage_campaigns: boolean
  can_manage_reports: boolean
}

export interface Permissions {
  isAdmin: boolean
  isOrgOwner: boolean
  orgRole: string | null
  features: string[]
  storeAccess: StoreAccess[]
  // Computed permissions
  canCreateClients: boolean
  canManagePortalUsers: boolean
  canViewReports: boolean
  canViewFinancial: boolean
  canControlOnboarding: boolean
  canViewOnboarding: boolean
  canControlTeam: boolean
  canViewTeam: boolean
  canControlCampaigns: boolean
  canViewCampaigns: boolean
  canGenerateCopy: boolean
  canControlRequests: boolean
  canExecuteRequests: boolean
  canControlCalendar: boolean
}

export interface PermissionsData {
  profile: Record<string, unknown> | null
  orgMember: Record<string, unknown> | null
  permissions: Permissions
}

interface PermissionsContextValue {
  permissions: Permissions | null
  isLoading: boolean
  error: string | null
  hasFeature: (featureKey: string) => boolean
  hasAnyFeature: (featureKeys: string[]) => boolean
  hasAllFeatures: (featureKeys: string[]) => boolean
  canAccessStore: (storeId: string) => boolean
  refetch: () => Promise<void>
}

const defaultPermissions: Permissions = {
  isAdmin: false,
  isOrgOwner: false,
  orgRole: null,
  features: [],
  storeAccess: [],
  canCreateClients: false,
  canManagePortalUsers: false,
  canViewReports: false,
  canViewFinancial: false,
  canControlOnboarding: false,
  canViewOnboarding: false,
  canControlTeam: false,
  canViewTeam: false,
  canControlCampaigns: false,
  canViewCampaigns: false,
  canGenerateCopy: false,
  canControlRequests: false,
  canExecuteRequests: false,
  canControlCalendar: false,
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null)

export function PermissionsProvider({
  children,
  initialPermissions
}: {
  children: ReactNode
  initialPermissions?: Permissions | null
}) {
  const [permissions, setPermissions] = useState<Permissions | null>(initialPermissions || null)
  const [isLoading, setIsLoading] = useState(!initialPermissions)
  const [error, setError] = useState<string | null>(null)

  const fetchPermissions = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch("/api/me/permissions")

      if (!response.ok) {
        throw new Error("Falha ao carregar permissões")
      }

      const data: PermissionsData = await response.json()
      setPermissions(data.permissions)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
      setPermissions(defaultPermissions)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!initialPermissions) {
      fetchPermissions()
    }
  }, [fetchPermissions, initialPermissions])

  const hasFeature = useCallback((featureKey: string): boolean => {
    if (!permissions) return false
    if (permissions.isAdmin || permissions.isOrgOwner) return true
    return permissions.features.includes(featureKey)
  }, [permissions])

  const hasAnyFeature = useCallback((featureKeys: string[]): boolean => {
    if (!permissions) return false
    if (permissions.isAdmin || permissions.isOrgOwner) return true
    return featureKeys.some(key => permissions.features.includes(key))
  }, [permissions])

  const hasAllFeatures = useCallback((featureKeys: string[]): boolean => {
    if (!permissions) return false
    if (permissions.isAdmin || permissions.isOrgOwner) return true
    return featureKeys.every(key => permissions.features.includes(key))
  }, [permissions])

  const canAccessStore = useCallback((storeId: string): boolean => {
    if (!permissions) return false
    if (permissions.isAdmin || permissions.isOrgOwner) return true
    return permissions.storeAccess.some(
      access => access.store_id === storeId && access.can_view
    )
  }, [permissions])

  return (
    <PermissionsContext.Provider
      value={{
        permissions,
        isLoading,
        error,
        hasFeature,
        hasAnyFeature,
        hasAllFeatures,
        canAccessStore,
        refetch: fetchPermissions,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  const context = useContext(PermissionsContext)
  if (!context) {
    throw new Error("usePermissions deve ser usado dentro de PermissionsProvider")
  }
  return context
}

// Hook para verificar se o usuário pode acessar uma rota específica
export function useCanAccessRoute(routePath: string): boolean {
  const { permissions, isLoading } = usePermissions()

  if (isLoading || !permissions) return false
  if (permissions.isAdmin || permissions.isOrgOwner) return true

  // Mapeamento de rotas para features necessárias
  const routePermissions: Record<string, string[]> = {
    "/dashboard": [], // Sempre acessível
    "/board": ["request_control", "request_execute"],
    "/clients": ["create_clients"],
    "/team": ["team_control", "team_view"],
    "/onboarding": ["onboarding_control", "onboarding_view"],
    "/stores": [], // Controlado por storeAccess
    "/pipeline": ["request_control", "request_execute"],
    "/financial": ["view_financial"],
    "/meetings": ["calendar_control"],
    "/campaigns": ["campaign_control", "campaign_view"],
    "/klaviyo-metrics": ["campaign_view", "view_reports"],
    "/reports": ["view_reports"],
    "/automations": ["campaign_control"],
    "/tools": [], // Sempre acessível
    "/settings": [], // Sempre acessível
  }

  const requiredFeatures = routePermissions[routePath]

  // Se não há features requeridas, permite acesso
  if (!requiredFeatures || requiredFeatures.length === 0) {
    // Caso especial para /stores - precisa ter acesso a pelo menos uma loja
    if (routePath === "/stores") {
      return permissions.storeAccess.length > 0
    }
    return true
  }

  // Verifica se tem pelo menos uma das features necessárias
  return requiredFeatures.some(feature => permissions.features.includes(feature))
}
