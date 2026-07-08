"use client"

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react"
import type { OrgRole } from "@/types/organization"
import { canAccess as canAccessItem, isReadOnly as isReadOnlyItem, type NavItemId } from "@/lib/permissions/role-access"

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
  /** Funções ativas da conta. Fonte de verdade do gating. */
  roles: OrgRole[]
  /** True se o profile global é admin (`profiles.role = 'admin'`). Bypass total. */
  isAdmin: boolean
  /** @deprecated Use `roles.includes('admin')`. Mantido para compat até a próxima limpeza. */
  isOrgOwner: boolean
  /** @deprecated Use `roles[0]` ou o helper `canAccess`. */
  orgRole: string | null
  /**
   * @deprecated Sistema de features está sendo retirado. Tabela mantida
   * inerte por 1 release. Não dependa deste array para gating.
   */
  features: string[]
  storeAccess: StoreAccess[]
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
  /** Gate principal: passa o id do NavItem e retorna se a conta vê. */
  canAccess: (itemId: NavItemId) => boolean
  /** True se o item é somente leitura para esta conta (ex.: Equipe para Suporte). */
  isReadOnly: (itemId: NavItemId) => boolean
  /** @deprecated noop transicional — features estão desativadas. Sempre `false`. */
  hasFeature: (featureKey: string) => boolean
  /** @deprecated idem. */
  hasAnyFeature: (featureKeys: string[]) => boolean
  /** @deprecated idem. */
  hasAllFeatures: (featureKeys: string[]) => boolean
  canAccessStore: (storeId: string) => boolean
  refetch: () => Promise<void>
}

const defaultPermissions: Permissions = {
  roles: [],
  isAdmin: false,
  isOrgOwner: false,
  orgRole: null,
  features: [],
  storeAccess: [],
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

  const canAccess = useCallback((itemId: NavItemId): boolean => {
    if (!permissions) return false
    if (permissions.isAdmin) return true
    return canAccessItem(itemId, permissions.roles)
  }, [permissions])

  const isReadOnly = useCallback((itemId: NavItemId): boolean => {
    if (!permissions) return false
    if (permissions.isAdmin) return false
    return isReadOnlyItem(itemId, permissions.roles)
  }, [permissions])

  // hasFeature/hasAnyFeature/hasAllFeatures retornam false para forçar a
  // migração dos consumidores para `canAccess`. Mantidos apenas para não
  // quebrar imports até a próxima limpeza.
  const noopFeature = useCallback((): boolean => false, [])

  const canAccessStore = useCallback((storeId: string): boolean => {
    if (!permissions) return false
    if (permissions.isAdmin || permissions.roles.includes("admin") || permissions.roles.includes("dev")) return true
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
        canAccess,
        isReadOnly,
        hasFeature: noopFeature,
        hasAnyFeature: noopFeature,
        hasAllFeatures: noopFeature,
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

/**
 * Resolve acesso a uma rota usando a matriz central de NavItem.
 * Rota desconhecida → libera (default permissivo, igual ao comportamento legado).
 */
const ROUTE_TO_NAV_ITEM: Record<string, NavItemId> = {
  "/admin/board": "geral.board",
  "/admin/clients": "ops.clients",
  "/admin/team": "geral.team",
  "/admin/onboarding": "ops.onboarding",
  "/admin/stores": "ops.stores",
  "/admin/financial": "geral.financial",
  "/admin/meetings": "comercial.meetings",
  "/admin/campaigns": "ops.campaigns.list",
  "/admin/reports": "geral.reports",
  "/admin/automations": "comercial.automacoes",
}

export function useCanAccessRoute(routePath: string): boolean {
  const { permissions, isLoading, canAccess } = usePermissions()

  if (isLoading || !permissions) return false
  if (permissions.isAdmin) return true
  if (routePath === "/admin/stores") return permissions.storeAccess.length > 0

  const navItem = ROUTE_TO_NAV_ITEM[routePath]
  if (!navItem) return true
  return canAccess(navItem)
}
