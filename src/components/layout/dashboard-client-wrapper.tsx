"use client"

import { ReactNode, useEffect } from "react"
import { PermissionsProvider, Permissions } from "@/lib/hooks/use-permissions"
import { useAuthStore, useUIStore } from "@/lib/store"
import type { User } from "@/types"

interface DashboardClientWrapperProps {
  children: ReactNode
  initialPermissions?: Permissions | null
  /**
   * Profile do usuário logado, resolvido no layout server-side. Hidrata
   * o useAuthStore — sem isso o store fica user:null PARA SEMPRE
   * (nenhum outro lugar chama setUser) e tudo que depende dele quebra
   * silenciosamente: sino de notificações (badge + página), owner de
   * deals, delete de clients etc.
   */
  initialUser?: User | null
}

export function DashboardClientWrapper({
  children,
  initialPermissions,
  initialUser,
}: DashboardClientWrapperProps) {
  useEffect(() => {
    useUIStore.persist.rehydrate()
  }, [])

  useEffect(() => {
    if (initialUser) {
      useAuthStore.getState().setUser(initialUser)
    }
  }, [initialUser])

  return (
    <PermissionsProvider initialPermissions={initialPermissions}>
      {children}
    </PermissionsProvider>
  )
}
