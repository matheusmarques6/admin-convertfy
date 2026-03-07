"use client"

import { ReactNode, useEffect } from "react"
import { PermissionsProvider, Permissions } from "@/lib/hooks/use-permissions"
import { useUIStore } from "@/lib/store"

interface DashboardClientWrapperProps {
  children: ReactNode
  initialPermissions?: Permissions | null
}

export function DashboardClientWrapper({
  children,
  initialPermissions
}: DashboardClientWrapperProps) {
  useEffect(() => {
    useUIStore.persist.rehydrate()
  }, [])

  return (
    <PermissionsProvider initialPermissions={initialPermissions}>
      {children}
    </PermissionsProvider>
  )
}
